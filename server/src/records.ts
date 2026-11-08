import { Router } from "express";
import type { RequestHandler } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { can, loadPermissions, requirePermission } from "./access.js";
import { db, users } from "./db.js";

// Membuat work order, maintenance, dan standby. Aturannya mengikuti v1:
// - maintenance dan standby: satu baris per unit per hari, tidak boleh bentrok dengan work order di hari itu;
//   standby juga tidak boleh bentrok dengan maintenance.
// - work order: tidak memblokir tumpang tindih (v1 juga begitu), hanya memberi peringatan.
// Semua perubahan dicatat di access.audit_log.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 31;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Tanggal tidak valid")
  .refine((s) => s >= "2020-01-01" && s <= "2100-12-31", "Tanggal di luar rentang yang wajar");
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().transform((v) => (v ? v : null));

const dayCount = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const handle =
  (fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => Promise<void>): RequestHandler =>
  async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) return void res.status(e.status).json({ error: e.message, ...e.extra });
      if (e instanceof z.ZodError) return void res.status(400).json({ error: e.issues[0]?.message ?? "Data tidak valid" });
      if ((e as { cause?: { code?: string } })?.cause?.code === "23505")
        return void res.status(409).json({ error: "Data untuk unit dan tanggal itu sudah ada." });
      console.error(e);
      res.status(500).json({ error: "Terjadi kesalahan di server" });
    }
  };

async function actor(userId: string) {
  const [u] = await db.select({ name: users.employeeName }).from(users).where(eq(users.userId, userId));
  return u?.name ?? null;
}

async function activeUnit(tx: Tx, unitId: string) {
  const r = await tx.execute<{ unit_id: string; unit_type: string | null; status: string }>(
    sql`select unit_id, unit_type, status from rental.unit where unit_id = ${unitId}`,
  );
  const unit = r.rows[0];
  if (!unit) throw new HttpError(400, `Unit ${unitId} tidak ditemukan`);
  if (unit.status !== "active") throw new HttpError(400, `Unit ${unitId} nonaktif`);
  return unit;
}

async function audit(tx: Tx, userId: string, key: string, entity: string, entityId: string, after: unknown) {
  await tx.execute(
    sql`insert into access.audit_log (user_id, permission_key, entity, entity_id, before, after)
        values (${userId}::uuid, ${key}, ${entity}, ${entityId}, null, ${JSON.stringify(after)}::jsonb)`,
  );
}

// Nomor harian: <prefix>yy-mmdd-NNN (mis. WO26-1108-001), naik atomik di id_daily_counter (sama seperti v1).
async function nextDailyId(tx: Tx, prefix: string) {
  const r = await tx.execute<{ id: string }>(
    sql`insert into rental.id_daily_counter as c (prefix, day, last_serial)
        values (${prefix}, (now() at time zone 'Asia/Jakarta')::date, 1)
        on conflict (prefix, day) do update set last_serial = c.last_serial + 1
        returning c.prefix || to_char(c.day, 'YY-MMDD') || '-' || lpad(c.last_serial::text, 3, '0') as id`,
  );
  return r.rows[0].id;
}

export const recordsRouter = Router();

// ---------- Pilihan untuk form (unit dan kontrak) ----------
const CREATE_KEYS = ["work_order:create", "maintenance:create", "standby:create"];

recordsRouter.get(
  "/form-options",
  handle(async (req, res) => {
    if (!req.session.userId) throw new HttpError(401, "Belum login");
    const perms = await loadPermissions(req.session.userId);
    if (!CREATE_KEYS.some((k) => can(perms, k))) throw new HttpError(403, "Anda tidak punya izin untuk aksi ini");

    const [units, contracts] = await Promise.all([
      db.execute<{ unit_id: string; unit_type: string | null }>(
        sql`select unit_id, unit_type from rental.unit where status = 'active' order by unit_type, unit_id`,
      ),
      db.execute<{ rc_id: string; rc_type: string | null; location: string | null; status: string | null }>(
        sql`select rc_id, rc_type, location, status from rental.rent_contract order by rc_start_date desc nulls last, rc_id limit 200`,
      ),
    ]);
    res.json({
      units: units.rows.map((u) => ({ unitId: u.unit_id, unitType: u.unit_type })),
      contracts: contracts.rows.map((c) => ({ rcId: c.rc_id, rcType: c.rc_type, location: c.location, status: c.status })),
    });
  }),
);

// ---------- Work order ----------
export const RC_TYPES = ["Retail", "Contract", "Standby", "Work-maintenance"] as const;

const workOrderBody = z.object({
  unitId: text(100).min(1, "Unit wajib dipilih"),
  rcType: z.enum(RC_TYPES, { message: "Tipe work order tidak valid" }),
  location: text(500).min(1, "Lokasi wajib diisi"),
  startDate: isoDate,
  finishDate: isoDate.optional(),
  qty: z.coerce.number().int("Jumlah harus bilangan bulat").min(0).max(999).default(1),
  time: z.coerce.number().int("Jam harus bilangan bulat").min(0).max(9999).optional(),
  volume: z.coerce.number().min(0).max(99999999).optional(),
  pipe: optionalText(100),
  remarks: optionalText(2000),
  rcId: optionalText(50),
});

recordsRouter.post(
  "/work-orders",
  requirePermission("work_order:create"),
  handle(async (req, res) => {
    const b = workOrderBody.parse(req.body);
    const finish = b.finishDate ?? b.startDate;
    if (finish < b.startDate) throw new HttpError(400, "Tanggal selesai tidak boleh sebelum tanggal mulai");
    const userId = req.session.userId!;
    const name = await actor(userId);

    const result = await db.transaction(async (tx) => {
      const unit = await activeUnit(tx, b.unitId);
      if (b.rcId) {
        const rc = await tx.execute(sql`select 1 from rental.rent_contract where rc_id = ${b.rcId}`);
        if (rc.rows.length === 0) throw new HttpError(400, `Kontrak ${b.rcId} tidak ditemukan`);
      }

      const woId = await nextDailyId(tx, "WO");
      await tx.execute(
        sql`insert into rental.work_order
              (wo_id, "user", location, rc_type, wo_start_date, wo_finish_date, unit_id, unit_type, qty, time, volume, pipe, remarks, rc_id)
            values
              (${woId}, ${name}, ${b.location}, ${b.rcType}, ${b.startDate}::date, ${finish}::date, ${unit.unit_id}, ${unit.unit_type},
               ${b.qty}, ${b.time ?? null}, ${b.volume ?? 0}, ${b.pipe}, ${b.remarks}, ${b.rcId})`,
      );

      // Peringatan (tidak memblokir, sama seperti v1): bentrok dengan maintenance atau standby.
      const maint = await tx.execute<{ d: string }>(
        sql`select date::text as d from rental.maintenance
            where unit_id = ${unit.unit_id} and date between ${b.startDate}::date and ${finish}::date order by date limit 10`,
      );
      const stand = await tx.execute<{ d: string }>(
        sql`select date::text as d from rental.standby_log
            where unit_id = ${unit.unit_id} and date between ${b.startDate}::date and ${finish}::date order by date limit 10`,
      );
      const warnings = [
        ...(maint.rows.length ? [`Unit ${unit.unit_id} punya maintenance pada ${maint.rows.map((r) => r.d).join(", ")}.`] : []),
        ...(stand.rows.length ? [`Unit ${unit.unit_id} punya standby pada ${stand.rows.map((r) => r.d).join(", ")}.`] : []),
      ];

      await audit(tx, userId, "work_order:create", "work_order", woId, {
        unit_id: unit.unit_id, rc_type: b.rcType, location: b.location, start: b.startDate, finish, rc_id: b.rcId,
      });
      return { id: woId, unitId: unit.unit_id, startDate: b.startDate, finishDate: finish, warnings };
    });

    res.status(201).json(result);
  }),
);

// ---------- Maintenance dan standby (satu baris per unit per hari, boleh rentang sampai 31 hari) ----------
const dayBody = z.object({
  unitId: text(100).min(1, "Unit wajib dipilih"),
  startDate: isoDate,
  finishDate: isoDate.optional(),
  remarks: optionalText(2000),
});

function range(b: { startDate: string; finishDate?: string }) {
  const finish = b.finishDate ?? b.startDate;
  if (finish < b.startDate) throw new HttpError(400, "Tanggal selesai tidak boleh sebelum tanggal mulai");
  if (dayCount(b.startDate, finish) > MAX_RANGE_DAYS) throw new HttpError(400, `Rentang maksimal ${MAX_RANGE_DAYS} hari`);
  return finish;
}

type Conflict = { date: string; reason: string };

async function dayConflicts(tx: Tx, unitId: string, start: string, finish: string, kind: "maintenance" | "standby") {
  const out: Conflict[] = [];
  const wo = await tx.execute<{ d: string; wo_id: string }>(
    sql`select distinct on (g.d) g.d::date::text as d, w.wo_id
        from generate_series(${start}::date, ${finish}::date, interval '1 day') as g(d)
        join rental.work_order w on w.unit_id = ${unitId}
          and w.wo_start_date <= g.d::date and coalesce(w.wo_finish_date, w.wo_start_date) >= g.d::date
        order by g.d`,
  );
  wo.rows.forEach((r) => out.push({ date: r.d, reason: `sudah ada work order ${r.wo_id}` }));

  const maint = await tx.execute<{ d: string }>(
    sql`select date::text as d from rental.maintenance where unit_id = ${unitId} and date between ${start}::date and ${finish}::date`,
  );
  maint.rows.forEach((r) => out.push({ date: r.d, reason: "sudah ada maintenance" }));

  if (kind === "standby") {
    const stand = await tx.execute<{ d: string }>(
      sql`select date::text as d from rental.standby_log where unit_id = ${unitId} and date between ${start}::date and ${finish}::date`,
    );
    stand.rows.forEach((r) => out.push({ date: r.d, reason: "sudah ada standby" }));
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function conflictError(label: string, unitId: string, conflicts: Conflict[]) {
  const first = conflicts.slice(0, 5).map((c) => `${c.date} (${c.reason})`).join(", ");
  const more = conflicts.length > 5 ? ` dan ${conflicts.length - 5} tanggal lain` : "";
  return new HttpError(409, `${label} untuk unit ${unitId} tidak bisa dibuat: ${first}${more}. Tidak ada data yang disimpan.`, { conflicts });
}

recordsRouter.post(
  "/maintenance",
  requirePermission("maintenance:create"),
  handle(async (req, res) => {
    const b = dayBody.parse(req.body);
    const finish = range(b);
    const userId = req.session.userId!;

    const result = await db.transaction(async (tx) => {
      const unit = await activeUnit(tx, b.unitId);
      const conflicts = await dayConflicts(tx, unit.unit_id, b.startDate, finish, "maintenance");
      if (conflicts.length) throw conflictError("Maintenance", unit.unit_id, conflicts);

      const ins = await tx.execute<{ id: number; d: string }>(
        sql`insert into rental.maintenance (unit_id, date, remarks)
            select ${unit.unit_id}, g.d::date, ${b.remarks}
            from generate_series(${b.startDate}::date, ${finish}::date, interval '1 day') as g(d)
            returning id, date::text as d`,
      );
      await audit(tx, userId, "maintenance:create", "maintenance", `${unit.unit_id}:${b.startDate}..${finish}`, {
        unit_id: unit.unit_id, start: b.startDate, finish, remarks: b.remarks, ids: ins.rows.map((r) => r.id),
      });
      return { unitId: unit.unit_id, startDate: b.startDate, finishDate: finish, count: ins.rows.length };
    });
    res.status(201).json(result);
  }),
);

recordsRouter.post(
  "/standby",
  requirePermission("standby:create"),
  handle(async (req, res) => {
    const b = dayBody.parse(req.body);
    const finish = range(b);
    const userId = req.session.userId!;
    const name = await actor(userId);

    const result = await db.transaction(async (tx) => {
      const unit = await activeUnit(tx, b.unitId);
      const conflicts = await dayConflicts(tx, unit.unit_id, b.startDate, finish, "standby");
      if (conflicts.length) throw conflictError("Standby", unit.unit_id, conflicts);

      const ins = await tx.execute<{ id: number; d: string }>(
        sql`insert into rental.standby_log (unit_id, date, "user")
            select ${unit.unit_id}, g.d::date, ${name}
            from generate_series(${b.startDate}::date, ${finish}::date, interval '1 day') as g(d)
            returning id, date::text as d`,
      );
      await audit(tx, userId, "standby:create", "standby_log", `${unit.unit_id}:${b.startDate}..${finish}`, {
        unit_id: unit.unit_id, start: b.startDate, finish, ids: ins.rows.map((r) => r.id),
      });
      return { unitId: unit.unit_id, startDate: b.startDate, finishDate: finish, count: ins.rows.length };
    });
    res.status(201).json(result);
  }),
);
