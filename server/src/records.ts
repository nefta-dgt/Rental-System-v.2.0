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

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const handle =
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

export async function audit(tx: Tx, userId: string, key: string, entity: string, entityId: string, after: unknown, before: unknown = null) {
  await tx.execute(
    sql`insert into access.audit_log (user_id, permission_key, entity, entity_id, before, after)
        values (${userId}::uuid, ${key}, ${entity}, ${entityId}, ${before === null ? null : JSON.stringify(before)}::jsonb, ${after === null ? null : JSON.stringify(after)}::jsonb)`,
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

    const [units, contracts, operators, defaults] = await Promise.all([
      db.execute<{ unit_id: string; unit_type: string | null }>(
        sql`select unit_id, unit_type from rental.unit where status = 'active' order by unit_type, unit_id`,
      ),
      db.execute<{ rc_id: string; rc_type: string | null; location: string | null; status: string | null }>(
        sql`select rc_id, rc_type, location, status from rental.rent_contract order by rc_start_date desc nulls last, rc_id limit 200`,
      ),
      db.execute<{ employee_id: string; full_name: string }>(
        sql`select employee_id, full_name from hr.employee
            where lower(role) = 'operator' and is_active order by full_name`,
      ),
      db.execute<{ unit_type: string; rc_type: string; wo_time: number | null; wo_volume: number | null; rc_pipe: number | null }>(
        sql`select unit_type, rc_type, wo_time, wo_volume, rc_pipe from rental.unit_price_default
            where unit_type is not null and rc_type is not null order by rc_type, unit_type`,
      ),
    ]);
    res.json({
      // Tipe work order = rc_type yang ada di unit_price_default. Nilai awal time/volume/pipe diambil dari tabel yang sama.
      rcTypes: [...new Set(defaults.rows.map((d) => d.rc_type))],
      defaults: defaults.rows.map((d) => ({ unitType: d.unit_type, rcType: d.rc_type, time: d.wo_time, volume: d.wo_volume, pipe: d.rc_pipe })),
      operators: operators.rows.map((o) => ({ employeeId: o.employee_id, name: o.full_name })),
      units: units.rows.map((u) => ({ unitId: u.unit_id, unitType: u.unit_type })),
      contracts: contracts.rows.map((c) => ({ rcId: c.rc_id, rcType: c.rc_type, location: c.location, status: c.status })),
    });
  }),
);

// ---------- Work order ----------
const workOrderBody = z.object({
  operatorId: z.string().uuid("Operator wajib dipilih"),
  unitId: text(100).min(1, "Unit wajib dipilih"),
  rcType: text(100).min(1, "Tipe work order wajib dipilih"),
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

type WorkOrderInput = z.infer<typeof workOrderBody>;
type Existing = { operatorId: string | null; unitId: string | null; rcType: string | null; rcId: string | null };

// Validasi isi work order. Untuk ubah data, nilai yang tidak diganti tidak dicek ulang
// (WO lama boleh punya tipe/operator/unit yang sekarang sudah tidak ada di daftar pilihan).
async function validateWorkOrder(tx: Tx, b: WorkOrderInput, existing?: Existing) {
  const unitChanged = !existing || existing.unitId !== b.unitId;
  const unit = unitChanged
    ? await activeUnit(tx, b.unitId)
    : (await tx.execute<{ unit_id: string; unit_type: string | null }>(sql`select unit_id, unit_type from rental.unit where unit_id = ${b.unitId}`)).rows[0];
  if (!unit) throw new HttpError(400, `Unit ${b.unitId} tidak ditemukan`);

  if (!existing || existing.rcType !== b.rcType) {
    const rt = await tx.execute(sql`select 1 from rental.unit_price_default where rc_type = ${b.rcType} limit 1`);
    if (rt.rows.length === 0) throw new HttpError(400, "Tipe work order tidak valid");
  }

  // Operator harus karyawan aktif ber-role operator. Nama operator juga disimpan di kolom "user" (kompatibel dengan v1).
  const opChanged = !existing || existing.operatorId !== b.operatorId;
  const op = await tx.execute<{ full_name: string }>(
    opChanged
      ? sql`select full_name from hr.employee where employee_id = ${b.operatorId}::uuid and lower(role) = 'operator' and is_active`
      : sql`select full_name from hr.employee where employee_id = ${b.operatorId}::uuid`,
  );
  if (op.rows.length === 0) throw new HttpError(400, "Operator tidak ditemukan atau tidak aktif");

  if (b.rcId && (!existing || existing.rcId !== b.rcId)) {
    const rc = await tx.execute(sql`select 1 from rental.rent_contract where rc_id = ${b.rcId}`);
    if (rc.rows.length === 0) throw new HttpError(400, `Kontrak ${b.rcId} tidak ditemukan`);
  }
  return { unit, operatorName: op.rows[0].full_name };
}

// Peringatan (tidak memblokir, sama seperti v1): bentrok dengan maintenance atau standby.
async function workOrderWarnings(tx: Tx, unitId: string, start: string, finish: string) {
  const maint = await tx.execute<{ d: string }>(
    sql`select date::text as d from rental.maintenance
        where unit_id = ${unitId} and date between ${start}::date and ${finish}::date order by date limit 10`,
  );
  const stand = await tx.execute<{ d: string }>(
    sql`select date::text as d from rental.standby_log
        where unit_id = ${unitId} and date between ${start}::date and ${finish}::date order by date limit 10`,
  );
  return [
    ...(maint.rows.length ? [`Unit ${unitId} punya maintenance pada ${maint.rows.map((r) => r.d).join(", ")}.`] : []),
    ...(stand.rows.length ? [`Unit ${unitId} punya standby pada ${stand.rows.map((r) => r.d).join(", ")}.`] : []),
  ];
}

recordsRouter.post(
  "/work-orders",
  requirePermission("work_order:create"),
  handle(async (req, res) => {
    const b = workOrderBody.parse(req.body);
    const finish = b.finishDate ?? b.startDate;
    if (finish < b.startDate) throw new HttpError(400, "Tanggal selesai tidak boleh sebelum tanggal mulai");
    const userId = req.session.userId!;

    const result = await db.transaction(async (tx) => {
      const { unit, operatorName } = await validateWorkOrder(tx, b);

      const woId = await nextDailyId(tx, "WO");
      await tx.execute(
        sql`insert into rental.work_order
              (wo_id, "user", operator, created_by, location, rc_type, wo_start_date, wo_finish_date, unit_id, unit_type, qty, time, volume, pipe, remarks, rc_id)
            values
              (${woId}, ${operatorName}, ${b.operatorId}::uuid, ${userId}::uuid, ${b.location}, ${b.rcType}, ${b.startDate}::date, ${finish}::date, ${unit.unit_id}, ${unit.unit_type},
               ${b.qty}, ${b.time ?? null}, ${b.volume ?? 0}, ${b.pipe}, ${b.remarks}, ${b.rcId})`,
      );

      const warnings = await workOrderWarnings(tx, unit.unit_id, b.startDate, finish);

      await audit(tx, userId, "work_order:create", "work_order", woId, {
        unit_id: unit.unit_id, operator: b.operatorId, rc_type: b.rcType, location: b.location, start: b.startDate, finish, rc_id: b.rcId,
      });
      return { id: woId, unitId: unit.unit_id, startDate: b.startDate, finishDate: finish, warnings };
    });

    res.status(201).json(result);
  }),
);

// ---------- Cari, lihat, ubah, hapus work order ----------
const likePattern = (v: string) => `%${v.replace(/[\\%_]/g, "\\$&")}%`;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  rcType: z.string().trim().max(100).optional(),
  unitId: z.string().trim().max(100).optional(),
  operator: z.string().trim().max(100).optional(),
  date: isoDate.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

type WoRow = {
  wo_id: string; timestamp: string | null; created_by_name: string | null; operator: string | null; operator_name: string | null; unit_id: string | null; unit_type: string | null;
  rc_type: string | null; rc_id: string | null; location: string | null; start_date: string | null; finish_date: string | null;
  qty: number | null; time: number | null; volume: string | null; pipe: string | null; remarks: string | null;
};

const woSelect = sql`select w.wo_id, w."timestamp"::text as timestamp, cu.employee_name as created_by_name, w.operator, coalesce(e.full_name, w."user") as operator_name, w.unit_id, w.unit_type, w.rc_type, w.rc_id,
    w.location, w.wo_start_date::text as start_date, w.wo_finish_date::text as finish_date, w.qty, w.time, w.volume::text as volume, w.pipe, w.remarks
  from rental.work_order w left join hr.employee e on e.employee_id = w.operator
  left join hr.users cu on cu.user_id = w.created_by`;

const toWo = (r: WoRow) => ({
  id: r.wo_id, timestamp: r.timestamp, createdByName: r.created_by_name, operatorId: r.operator, operatorName: r.operator_name, unitId: r.unit_id, unitType: r.unit_type,
  rcType: r.rc_type, rcId: r.rc_id, location: r.location, startDate: r.start_date, finishDate: r.finish_date ?? r.start_date,
  qty: r.qty, time: r.time, volume: r.volume === null ? null : Number(r.volume), pipe: r.pipe, remarks: r.remarks,
});

recordsRouter.get(
  "/work-orders",
  requirePermission("work_order:view"),
  handle(async (req, res) => {
    const f = listQuery.parse(req.query);
    const conds = [sql`true`];
    const like = likePattern;
    if (f.q) {
      const l = like(f.q);
      conds.push(sql`(w.wo_id ilike ${l} or w.location ilike ${l} or w.rc_id ilike ${l} or w.remarks ilike ${l})`);
    }
    if (f.unitId) conds.push(sql`w.unit_id ilike ${like(f.unitId)}`);
    if (f.operator) conds.push(sql`coalesce(e.full_name, w."user") ilike ${like(f.operator)}`);
    if (f.rcType) conds.push(sql`w.rc_type = ${f.rcType}`);
    // WO ikut jika tanggal yang dicari berada di dalam periodenya: start <= tanggal <= finish.
    if (f.date) conds.push(sql`w.wo_start_date <= ${f.date}::date and coalesce(w.wo_finish_date, w.wo_start_date) >= ${f.date}::date`);
    const where = sql.join(conds, sql` and `);

    const [total, rows] = await Promise.all([
      db.execute<{ n: string }>(sql`select count(*) as n from rental.work_order w left join hr.employee e on e.employee_id = w.operator where ${where}`),
      db.execute<WoRow>(
        sql`${woSelect} where ${where} order by w.wo_start_date desc nulls last, w."timestamp" desc nulls last, w.wo_id desc
            limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`,
      ),
    ]);
    res.json({ items: rows.rows.map(toWo), total: Number(total.rows[0].n), page: f.page, pageSize: f.pageSize });
  }),
);

recordsRouter.get(
  "/work-orders/:id",
  requirePermission("work_order:view"),
  handle(async (req, res) => {
    const r = await db.execute<WoRow>(sql`${woSelect} where w.wo_id = ${String(req.params.id)}`);
    if (r.rows.length === 0) throw new HttpError(404, "Work order tidak ditemukan");
    res.json(toWo(r.rows[0]));
  }),
);

// Mengganti semua kolom yang bisa diedit (wo_id, created_by, dan timestamp tidak berubah).
recordsRouter.put(
  "/work-orders/:id",
  requirePermission("work_order:edit"),
  handle(async (req, res) => {
    const b = workOrderBody.parse(req.body);
    const finish = b.finishDate ?? b.startDate;
    if (finish < b.startDate) throw new HttpError(400, "Tanggal selesai tidak boleh sebelum tanggal mulai");
    const userId = req.session.userId!;
    const id = String(req.params.id);

    const result = await db.transaction(async (tx) => {
      const cur = await tx.execute<WoRow>(sql`${woSelect} where w.wo_id = ${id} for update of w`);
      if (cur.rows.length === 0) throw new HttpError(404, "Work order tidak ditemukan");
      const before = toWo(cur.rows[0]);

      const { unit, operatorName } = await validateWorkOrder(tx, b, {
        operatorId: before.operatorId, unitId: before.unitId, rcType: before.rcType, rcId: before.rcId,
      });
      await tx.execute(
        sql`update rental.work_order set "user" = ${operatorName}, operator = ${b.operatorId}::uuid, location = ${b.location}, rc_type = ${b.rcType},
              wo_start_date = ${b.startDate}::date, wo_finish_date = ${finish}::date, unit_id = ${unit.unit_id}, unit_type = ${unit.unit_type},
              qty = ${b.qty}, time = ${b.time ?? null}, volume = ${b.volume ?? 0}, pipe = ${b.pipe}, remarks = ${b.remarks}, rc_id = ${b.rcId}
            where wo_id = ${id}`,
      );
      const warnings = await workOrderWarnings(tx, unit.unit_id, b.startDate, finish);
      const after = { ...before, operatorId: b.operatorId, operatorName, unitId: unit.unit_id, unitType: unit.unit_type, rcType: b.rcType, rcId: b.rcId,
        location: b.location, startDate: b.startDate, finishDate: finish, qty: b.qty, time: b.time ?? null, volume: b.volume ?? 0, pipe: b.pipe, remarks: b.remarks };
      await audit(tx, userId, "work_order:edit", "work_order", id, after, before);
      return { id, unitId: unit.unit_id, startDate: b.startDate, finishDate: finish, warnings };
    });
    res.json(result);
  }),
);

// Hapus ditolak kalau WO sudah dipakai timesheet (hubungan data tidak boleh putus diam-diam).
recordsRouter.delete(
  "/work-orders/:id",
  requirePermission("work_order:delete"),
  handle(async (req, res) => {
    const userId = req.session.userId!;
    const id = String(req.params.id);
    await db.transaction(async (tx) => {
      const cur = await tx.execute<WoRow>(sql`${woSelect} where w.wo_id = ${id} for update of w`);
      if (cur.rows.length === 0) throw new HttpError(404, "Work order tidak ditemukan");

      const refs = await tx.execute<{ ts: string; val: string; buf: string }>(
        sql`select (select count(*) from rental.timesheet where work_order_id = ${id}) as ts,
                   (select count(*) from rental.timesheet_valuation where wo_id = ${id}) as val,
                   (select count(*) from rental.buffer_timesheet where wo_id = ${id}) as buf`,
      );
      const used = [
        [Number(refs.rows[0].ts), "timesheet"],
        [Number(refs.rows[0].val), "valuasi timesheet"],
        [Number(refs.rows[0].buf), "buffer timesheet"],
      ].filter(([n]) => (n as number) > 0);
      if (used.length) throw new HttpError(409, `Work order ${id} tidak bisa dihapus karena sudah dipakai di ${used.map(([n, l]) => `${l} (${n})`).join(", ")}.`);

      await tx.execute(sql`delete from rental.work_order where wo_id = ${id}`);
      await audit(tx, userId, "work_order:delete", "work_order", id, null, toWo(cur.rows[0]));
    });
    res.json({ ok: true, id });
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
        sql`insert into rental.maintenance (unit_id, date, remarks, created_by)
            select ${unit.unit_id}, g.d::date, ${b.remarks}, ${userId}::uuid
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
        sql`insert into rental.standby_log (unit_id, date, "user", created_by)
            select ${unit.unit_id}, g.d::date, ${name}, ${userId}::uuid
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

// ---------- Daftar maintenance dan standby (satu baris per unit per hari, sama seperti isi tabelnya) ----------
const dayListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  unitId: z.string().trim().max(100).optional(),
  date: isoDate.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

type DayRow = { id: number; unit_id: string; unit_type: string | null; date: string; created_at: string | null; created_by_name: string | null; note: string | null };
const toDay = (r: DayRow) => ({ id: r.id, unitId: r.unit_id, unitType: r.unit_type, date: r.date, createdAt: r.created_at, createdByName: r.created_by_name, note: r.note });

// createdByName: nama akun dari created_by; standby lama (v1) cadangannya kolom "user". note: remarks (maintenance), null untuk standby.
// q mencari di remarks (maintenance) atau nama pembuat (standby).
const CREATOR = sql`coalesce(cu.employee_name, t."user")`;
const DAY_LISTS = {
  maintenance: { table: sql`rental.maintenance`, creator: sql`cu.employee_name`, note: sql`t.remarks`, search: sql`t.remarks`, view: "maintenance:view" },
  standby: { table: sql`rental.standby_log`, creator: CREATOR, note: sql`null::text`, search: CREATOR, view: "standby:view" },
} as const;

for (const [kind, cfg] of Object.entries(DAY_LISTS)) {
  recordsRouter.get(
    `/${kind}`,
    requirePermission(cfg.view),
    handle(async (req, res) => {
      const f = dayListQuery.parse(req.query);
      const conds = [sql`true`];
      if (f.q) conds.push(sql`${cfg.search} ilike ${likePattern(f.q)}`);
      if (f.unitId) conds.push(sql`t.unit_id ilike ${likePattern(f.unitId)}`);
      if (f.date) conds.push(sql`t.date = ${f.date}::date`);
      const where = sql.join(conds, sql` and `);

      const [total, rows] = await Promise.all([
        db.execute<{ n: string }>(sql`select count(*) as n from ${cfg.table} t left join hr.users cu on cu.user_id = t.created_by where ${where}`),
        db.execute<DayRow>(
          sql`select t.id, t.unit_id, u.unit_type, t.date::text as date, t.created_at::text as created_at, ${cfg.creator} as created_by_name, ${cfg.note} as note
              from ${cfg.table} t left join rental.unit u on u.unit_id = t.unit_id
              left join hr.users cu on cu.user_id = t.created_by
              where ${where} order by t.date desc, t.id desc
              limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`,
        ),
      ]);
      res.json({ items: rows.rows.map(toDay), total: Number(total.rows[0].n), page: f.page, pageSize: f.pageSize });
    }),
  );
}

// Standby digabung per rentang: hari berurutan untuk satu unit menjadi satu baris (gaps-and-islands).
// Penggabungan dilakukan sebelum filter tanggal dan pembuat, supaya satu rentang tidak terpotong oleh filter.
type RangeRow = { unit_id: string; unit_type: string | null; start_date: string; finish_date: string; days: string; created_at: string | null; created_by_name: string | null };

recordsRouter.get(
  "/standby/ranges",
  requirePermission("standby:view"),
  handle(async (req, res) => {
    const f = dayListQuery.parse(req.query);
    const unitCond = f.unitId ? sql`where t.unit_id ilike ${likePattern(f.unitId)}` : sql``;
    const conds = [sql`true`];
    if (f.q) conds.push(sql`g.created_by_name ilike ${likePattern(f.q)}`);
    if (f.date) conds.push(sql`${f.date}::date between g.start_date and g.finish_date`);
    const where = sql.join(conds, sql` and `);

    const base = sql`
      with s as (
        select t.unit_id, t.date, t.created_at, coalesce(cu.employee_name, t."user") as creator,
               t.date - (dense_rank() over (partition by t.unit_id order by t.date))::int as grp
        from rental.standby_log t left join hr.users cu on cu.user_id = t.created_by ${unitCond}
      ), g as (
        select s.unit_id, min(s.date) as start_date, max(s.date) as finish_date, count(distinct s.date) as days, min(s.created_at) as created_at,
               (array_agg(s.creator order by s.date, s.created_at) filter (where s.creator is not null))[1] as created_by_name
        from s group by s.unit_id, s.grp
      )`;
    const [total, rows] = await Promise.all([
      db.execute<{ n: string }>(sql`${base} select count(*) as n from g where ${where}`),
      db.execute<RangeRow>(
        sql`${base} select g.unit_id, u.unit_type, g.start_date::text as start_date, g.finish_date::text as finish_date, g.days::text as days,
                   g.created_at::text as created_at, g.created_by_name
            from g left join rental.unit u on u.unit_id = g.unit_id
            where ${where} order by g.finish_date desc, g.start_date desc, g.unit_id
            limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`,
      ),
    ]);
    res.json({
      items: rows.rows.map((r) => ({
        unitId: r.unit_id, unitType: r.unit_type, startDate: r.start_date, finishDate: r.finish_date, days: Number(r.days),
        createdAt: r.created_at, createdByName: r.created_by_name,
      })),
      total: Number(total.rows[0].n), page: f.page, pageSize: f.pageSize,
    });
  }),
);

