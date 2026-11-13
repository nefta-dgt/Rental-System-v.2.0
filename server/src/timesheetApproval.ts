import { Router } from "express";
import path from "node:path";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "./access.js";
import { db } from "./db.js";
import { HttpError, audit, handle } from "./records.js";

// Timesheet Approval: timesheet hasil OCR yang menunggu di rental.buffer_timesheet (status PENDING).
// Approve membuat baris rental.timesheet (sama dengan POST /api/review di v1), decline hanya mengubah status buffer.
// Approve v2 berjalan dalam satu transaksi, termasuk pembaruan status buffer.

export const timesheetApprovalRouter = Router();

// ---------- Pembaca nilai OCR (teks) ke tipe database, mengikuti toPgDate/toPgTime/toPgNumber di v1 ----------
const clean = (v: unknown) => {
  const t = v === null || v === undefined ? "" : String(v).trim();
  return t === "" ? null : t;
};

function parseDate(v: unknown): string | null {
  const t = clean(v);
  if (!t) return null;
  let y: number, m: number, d: number;
  let r = t.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = t.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2}|\d{4})$/);
    if (!r) return null;
    d = Number(r[1]);
    m = Number(r[2]);
    y = Number(r[3]);
    if (y < 100) y += 2000;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2100 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseTime(v: unknown): string | null {
  const t = clean(v)?.replace(/\b(WIB|WITA|WIT|JAM)\b/gi, "").trim();
  if (!t) return null;
  const r = t.match(/^(\d{1,2})(?:[:.](\d{1,2}))?(?:[:.](\d{1,2}))?$/);
  if (!r) return null;
  const [h, mi, s] = [Number(r[1]), Number(r[2] ?? 0), Number(r[3] ?? 0)];
  if (h > 23 || mi > 59 || s > 59) return null;
  return [h, mi, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function parseNumber(v: unknown): number | null {
  const t = clean(v);
  if (!t) return null;
  const n = Number(t.replace(",", ".").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) && /\d/.test(t) ? n : null;
}

const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Buffer = Record<string, string | null> & { id: string; status: string; crew_members: { nama?: string | null }[] | null; confidence: string | null; created_at: string };

// ---------- Daftar ----------
const listQuery = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

timesheetApprovalRouter.get(
  "/",
  requirePermission("timesheet:view"),
  handle(async (req, res) => {
    const f = listQuery.parse(req.query);
    const conds = [sql`status = 'PENDING'`];
    if (f.q)
      conds.push(sql`(ts_no ilike ${likePattern(f.q)} or no_unit ilike ${likePattern(f.q)} or nama_pelanggan ilike ${likePattern(f.q)} or operator ilike ${likePattern(f.q)})`);
    const where = sql.join(conds, sql` and `);
    const [total, rows] = await Promise.all([
      db.execute<{ n: string }>(sql`select count(*) as n from rental.buffer_timesheet where ${where}`),
      db.execute<Record<string, string | null>>(
        sql`select id, created_at::text as created_at, ts_no, no_unit, tipe_unit, tanggal, nama_pelanggan, lokasi_proyek, operator, total_volume, confidence::text as confidence, field_ragu,
                   (image_filename is not null) as has_image
            from rental.buffer_timesheet where ${where}
            order by created_at desc limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`,
      ),
    ]);
    res.json({
      items: rows.rows.map((r) => ({
        id: r.id, createdAt: r.created_at, tsNo: r.ts_no, unitId: r.no_unit, unitType: r.tipe_unit, date: r.tanggal, customer: r.nama_pelanggan,
        location: r.lokasi_proyek, operator: r.operator, volume: r.total_volume, confidence: r.confidence === null ? null : Number(r.confidence),
        doubtfulFields: r.field_ragu, hasImage: !!r.has_image,
      })),
      total: Number(total.rows[0].n),
      page: f.page,
      pageSize: f.pageSize,
    });
  }),
);

// Status timesheet sama dengan pilihan di v1.
const STATUSES = ["Work", "Standby", "Failed", "Failed-maintenance"] as const;

// Work order milik unit itu yang periodenya mencakup tanggal; dipakai form (bisa berubah kalau unit atau tanggal diedit).
async function candidateWorkOrders(unitId: string, date: string) {
  const r = await db.execute<{ wo_id: string; location: string | null; rc_type: string | null; operator: string | null; start: string; finish: string; has_ts: boolean }>(
    sql`select w.wo_id, w.location, w.rc_type, w.operator::text as operator, w.wo_start_date::text as start, w.wo_finish_date::text as finish,
               exists (select 1 from rental.timesheet t where t.work_order_id = w.wo_id and t.date = ${date}::date) as has_ts
        from rental.work_order w where w.unit_id = ${unitId} and ${date}::date between w.wo_start_date and w.wo_finish_date
        order by w.wo_start_date, w.wo_id`,
  );
  return r.rows.map((w) => ({ id: w.wo_id, location: w.location, rcType: w.rc_type, operatorId: w.operator, start: w.start, finish: w.finish, hasTimesheetThatDay: w.has_ts }));
}

timesheetApprovalRouter.get(
  "/work-orders",
  requirePermission("timesheet:view"),
  handle(async (req, res) => {
    const q = z.object({ unitId: z.string().trim().min(1).max(100), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query);
    if (!q.success) return void res.json({ items: [] });
    res.json({ items: await candidateWorkOrders(q.data.unitId, q.data.date) });
  }),
);

// ---------- Detail (isi OCR + pilihan untuk approve) ----------
async function loadBuffer(id: string) {
  const r = await db.execute<Buffer>(sql`select *, created_at::text as created_at, confidence::text as confidence from rental.buffer_timesheet where id = ${id}`);
  return r.rows[0] ?? null;
}

timesheetApprovalRouter.get(
  "/:id",
  requirePermission("timesheet:view"),
  handle(async (req, res) => {
    const b = await loadBuffer(String(req.params.id));
    if (!b) throw new HttpError(404, "Timesheet tidak ditemukan");

    const date = parseDate(b.tanggal);
    const units = await db.execute<{ unit_id: string; unit_type: string | null }>(sql`select unit_id, unit_type from rental.unit`);
    const unit = units.rows.find((u) => norm(u.unit_id) === norm(b.no_unit)) ?? null;

    const [workOrders, operators, crew] = await Promise.all([
      unit && date
        ? candidateWorkOrders(unit.unit_id, date)
        : Promise.resolve([]),
      db.execute<{ employee_id: string; full_name: string }>(sql`select employee_id, full_name from hr.employee where lower(role) = 'operator' and is_active order by full_name`),
      db.execute<{ employee_id: string; full_name: string; nik: string | null }>(sql`select employee_id, full_name, nik from hr.employee where lower(role) = 'crew' and is_active order by full_name`),
    ]);

    const guess = (list: { employee_id: string; full_name: string }[], name: unknown) => (norm(name) ? list.find((e) => norm(e.full_name) === norm(name))?.employee_id ?? null : null);
    const crewGuess = (b.crew_members ?? []).map((c) => guess(crew.rows, c.nama)).filter((x): x is string => !!x);

    res.json({
      id: b.id, status: b.status, createdAt: b.created_at, confidence: b.confidence === null ? null : Number(b.confidence), doubtfulFields: b.field_ragu,
      hasImage: !!b.image_filename,
      fields: {
        tsNo: b.ts_no, date: b.tanggal, unitId: b.no_unit, unitType: b.tipe_unit, customer: b.nama_pelanggan, company: b.perusahaan, location: b.lokasi_proyek,
        dispatch: b.keberangkatan, arrive: b.kedatangan, start: b.mulai_operasi, finish: b.selesai_operasi, returnTime: b.pulang,
        totalHours: b.total_jam_kerja, volume: b.total_volume, pipe: b.pemakaian_pipa, operator: b.operator, notes: b.catatan,
        phone: b.phone, pic: b.penanggung_jawab, batchingPlant: b.b_plant,
        crew: (b.crew_members ?? []).map((c) => c.nama ?? "").filter(Boolean),
      },
      // Hasil pembacaan untuk approve: unit master, tanggal ISO, dan work order yang periodenya mencakup tanggal itu.
      resolved: { unitId: unit?.unit_id ?? null, date },
      // Nilai awal form yang sudah dirapikan: tanggal ISO, jam HH:MM, angka. Kosong kalau tidak terbaca.
      prefill: {
        date: date ?? "", dispatch: parseTime(b.keberangkatan)?.slice(0, 5) ?? "", arrive: parseTime(b.kedatangan)?.slice(0, 5) ?? "", start: parseTime(b.mulai_operasi)?.slice(0, 5) ?? "",
        finish: parseTime(b.selesai_operasi)?.slice(0, 5) ?? "", returnTime: parseTime(b.pulang)?.slice(0, 5) ?? "", volume: parseNumber(b.total_volume)?.toString() ?? "",
      },
      workOrders,
      operators: operators.rows.map((o) => ({ employeeId: o.employee_id, name: o.full_name })),
      crew: crew.rows.map((o) => ({ employeeId: o.employee_id, name: o.full_name, nik: o.nik })),
      units: units.rows.map((u) => ({ unitId: u.unit_id, unitType: u.unit_type })).sort((a, b) => a.unitId.localeCompare(b.unitId, "id", { numeric: true })),
      statuses: STATUSES,
      suggested: { operatorId: guess(operators.rows, b.operator), crewIds: crewGuess },
    });
  }),
);

// ---------- Gambar OCR ----------
// Gambar disimpan v1 di folder uploads di servernya (kolom image_filename berisi "uploads/<nama>").
// v2 membaca folder yang sama lewat UPLOADS_DIR; hanya nama file yang dipakai, jadi tidak bisa keluar dari folder itu.
timesheetApprovalRouter.get(
  "/:id/image",
  requirePermission("timesheet:view"),
  handle(async (req, res) => {
    const r = await db.execute<{ image_filename: string | null }>(sql`select image_filename from rental.buffer_timesheet where id = ${String(req.params.id)}`);
    const name = r.rows[0]?.image_filename;
    if (!r.rows[0] || !name) throw new HttpError(404, "Gambar tidak ada");
    const dir = process.env.UPLOADS_DIR;
    if (!dir) throw new HttpError(404, "Folder gambar (UPLOADS_DIR) belum diatur di server");
    const file = path.join(path.resolve(dir), path.basename(name));
    res.sendFile(file, { dotfiles: "deny" }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: "File gambar tidak ditemukan di server" });
    });
  }),
);

// ---------- Approve ----------
// Seperti form review v1: nilai hasil OCR boleh dikoreksi sebelum disimpan. Total jam dihitung dari Start dan Finish (sama dengan v1).
const timeField = z.string().trim().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Format jam harus HH:MM").default("");
const approveBody = z.object({
  woId: z.string().trim().min(1, "Work order wajib dipilih").max(100),
  tsNo: z.string().trim().min(1, "Nomor timesheet wajib diisi").max(100),
  operatorId: z.string().uuid("Operator wajib dipilih"),
  unitId: z.string().trim().min(1, "Unit wajib dipilih").max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal wajib diisi"),
  status: z.enum(STATUSES, { message: "Status tidak valid" }),
  volume: z.coerce.number("Total volume wajib diisi").min(0).max(99999999),
  pipe: z.string().trim().max(100).default(""),
  dispatch: timeField,
  arrive: timeField,
  start: timeField.refine((t) => t !== "", "Start wajib diisi"),
  finish: timeField.refine((t) => t !== "", "Finish wajib diisi"),
  returnTime: timeField,
  distanceKm: z.number().min(0).max(99999).nullable().default(null),
  customer: z.string().trim().max(500).default(""),
  location: z.string().trim().max(500).default(""),
  batchingPlant: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(2000).default(""),
  crewIds: z.array(z.string().uuid("Crew tidak valid")).max(4, "Crew maksimal 4 orang").default([]),
});

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

timesheetApprovalRouter.post(
  "/:id/approve",
  requirePermission("timesheet:approve"),
  handle(async (req, res) => {
    const id = String(req.params.id);
    const body = approveBody.parse(req.body);
    if (new Set(body.crewIds).size !== body.crewIds.length || body.crewIds.includes(body.operatorId))
      throw new HttpError(400, "Operator dan crew tidak boleh dipilih dua kali");
    if (Number.isNaN(Date.parse(`${body.date}T00:00:00Z`)) || body.date < "2020-01-01" || body.date > "2100-12-31") throw new HttpError(400, "Tanggal tidak valid");
    const userId = req.session.userId!;

    // Total jam kerja dari Start dan Finish (lewat tengah malam ditambah 24 jam), dibulatkan 2 desimal.
    const diff = (minutes(body.finish) - minutes(body.start) + 1440) % 1440;
    const hours = Math.round((diff / 60) * 100) / 100;

    try {
      const result = await db.transaction(async (tx) => {
        // Trigger log timesheet menulis ke ts_log tanpa nama skema, jadi search_path harus berisi rental.
        await tx.execute(sql`set local search_path to rental, public`);
        const locked = await tx.execute<Buffer>(sql`select * from rental.buffer_timesheet where id = ${id} for update`);
        const b = locked.rows[0];
        if (!b) throw new HttpError(404, "Timesheet tidak ditemukan");
        if (b.status !== "PENDING") throw new HttpError(409, `Timesheet ini sudah ${b.status === "APPROVED" ? "di-approve" : "di-decline"}.`);

        const unitRes = await tx.execute<{ unit_id: string; unit_type: string | null }>(sql`select unit_id, unit_type from rental.unit where unit_id = ${body.unitId}`);
        const unit = unitRes.rows[0];
        if (!unit) throw new HttpError(400, `Unit "${body.unitId}" tidak ditemukan di master unit.`);

        const wo = await tx.execute<{ wo_id: string; unit_id: string; operator: string | null; ok: boolean }>(
          sql`select wo_id, unit_id, operator::text as operator, (${body.date}::date between wo_start_date and wo_finish_date) as ok from rental.work_order where wo_id = ${body.woId}`,
        );
        if (!wo.rows[0]) throw new HttpError(400, `Work order ${body.woId} tidak ada.`);
        if (wo.rows[0].unit_id !== unit.unit_id) throw new HttpError(400, `Work order ${body.woId} untuk unit ${wo.rows[0].unit_id}, sedangkan timesheet ini unit ${unit.unit_id}.`);
        if (!wo.rows[0].ok) throw new HttpError(400, `Tanggal timesheet di luar periode work order ${body.woId}.`);
        if (wo.rows[0].operator && wo.rows[0].operator !== body.operatorId) throw new HttpError(400, "Operator tidak sama dengan operator di work order yang dipilih.");

        const dup = await tx.execute(sql`select 1 from rental.timesheet where ts_id = ${body.tsNo}`);
        if (dup.rows.length) throw new HttpError(409, `Nomor timesheet ${body.tsNo} sudah ada.`);

        const op = await tx.execute<{ full_name: string }>(sql`select full_name from hr.employee where employee_id = ${body.operatorId}::uuid and lower(role) = 'operator' and is_active`);
        if (!op.rows[0]) throw new HttpError(400, "Operator tidak ditemukan, nonaktif, atau bukan operator");
        if (body.crewIds.length) {
          const crew = await tx.execute(sql`select employee_id from hr.employee where employee_id in (${sql.join(body.crewIds.map((i) => sql`${i}::uuid`), sql`, `)}) and lower(role) = 'crew' and is_active`);
          if (crew.rows.length !== body.crewIds.length) throw new HttpError(400, "Ada crew yang tidak ditemukan, nonaktif, atau bukan crew");
        }

        const t = (v: string) => (v === "" ? null : v);
        await tx.execute(
          sql`insert into rental.timesheet
                (ts_id, dispatch, arrive, start, finish, "return", time, volume, pipe, batching_plant, unit_type, date, location, remarks, customer, unit_id, work_order_id, operator, image_filename, status, distance_km)
              values
                (${body.tsNo}, ${t(body.dispatch)}::time, ${t(body.arrive)}::time, ${body.start}::time, ${body.finish}::time, ${t(body.returnTime)}::time,
                 ${hours}, ${body.volume}, ${t(body.pipe)}, ${t(body.batchingPlant)}, ${unit.unit_type}, ${body.date}::date, ${t(body.location)}, ${t(body.notes)}, ${t(body.customer)},
                 ${unit.unit_id}, ${body.woId}, ${op.rows[0].full_name}, ${clean(b.image_filename)}, ${body.status}, ${body.distanceKm})`,
        );
        await tx.execute(sql`insert into rental.operator_and_crew_assignment (ts_id, employee_id, role) values (${body.tsNo}, ${body.operatorId}::uuid, 'OPERATOR')`);
        for (const crewId of body.crewIds)
          await tx.execute(sql`insert into rental.operator_and_crew_assignment (ts_id, employee_id, role) values (${body.tsNo}, ${crewId}::uuid, 'CREW')`);

        await tx.execute(sql`update rental.buffer_timesheet set status = 'APPROVED', wo_id = ${body.woId}, updated_at = now() where id = ${id}`);
        await audit(tx, userId, "timesheet:approve", "buffer_timesheet", id, { ts_id: body.tsNo, work_order_id: body.woId, unit_id: unit.unit_id, date: body.date, status: body.status, operator: body.operatorId, crew_ids: body.crewIds }, { status: "PENDING" });
        return { id, status: "APPROVED", tsId: body.tsNo, workOrderId: body.woId, unitId: unit.unit_id, date: body.date };
      });
      res.json(result);
    } catch (e) {
      if ((e as { cause?: { code?: string } })?.cause?.code === "23505") throw new HttpError(409, "Work order ini sudah punya timesheet di tanggal itu, atau nomor timesheet sudah ada.");
      throw e;
    }
  }),
);

// ---------- Decline ----------
timesheetApprovalRouter.post(
  "/:id/decline",
  requirePermission("timesheet:approve"),
  handle(async (req, res) => {
    const id = String(req.params.id);
    const userId = req.session.userId!;
    await db.transaction(async (tx) => {
      const locked = await tx.execute<{ status: string }>(sql`select status from rental.buffer_timesheet where id = ${id} for update`);
      if (!locked.rows[0]) throw new HttpError(404, "Timesheet tidak ditemukan");
      if (locked.rows[0].status !== "PENDING") throw new HttpError(409, `Timesheet ini sudah ${locked.rows[0].status === "APPROVED" ? "di-approve" : "di-decline"}.`);
      await tx.execute(sql`update rental.buffer_timesheet set status = 'REJECTED', updated_at = now() where id = ${id}`);
      await audit(tx, userId, "timesheet:approve", "buffer_timesheet", id, { status: "REJECTED" }, { status: "PENDING" });
    });
    res.json({ id, status: "REJECTED" });
  }),
);
