import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.js";

type WorkOrder = { id: string; rcId: string | null; location: string | null };
type Cell = { wo: WorkOrder[]; standby: boolean; maintenance: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const query = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Tanggal tidak valid"),
});

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);

// Jadwal satu minggu (7 hari mulai dari `from`). Hanya membaca data, tidak mengubah apa pun.
export const scheduleRouter = Router();

scheduleRouter.get("/", async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Parameter from harus berformat YYYY-MM-DD" });

  const start = dayMs(parsed.data.from);
  const from = iso(start);
  const to = iso(start + 6 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, i) => iso(start + i * DAY_MS));

  // Tanggal dikirim sebagai teks supaya tidak bergeser oleh zona waktu.
  const [units, workOrders, standby, maintenance] = await Promise.all([
    db.execute<{ unit_id: string; unit_type: string | null; status: string }>(
      sql`select unit_id, unit_type, status from rental.unit order by unit_type, unit_id`,
    ),
    db.execute<{ wo_id: string; unit_id: string; rc_id: string | null; location: string | null; s: string; f: string }>(
      sql`select wo_id, unit_id, rc_id, location, wo_start_date::text as s,
                 coalesce(wo_finish_date, wo_start_date)::text as f
          from rental.work_order
          where unit_id is not null and unit_id <> ''
            and wo_start_date <= ${to}::date
            and coalesce(wo_finish_date, wo_start_date) >= ${from}::date`,
    ),
    db.execute<{ unit_id: string; d: string }>(
      sql`select unit_id, date::text as d from rental.standby_log
          where date between ${from}::date and ${to}::date`,
    ),
    db.execute<{ unit_id: string; d: string; remarks: string | null }>(
      sql`select unit_id, date::text as d, remarks from rental.maintenance
          where date between ${from}::date and ${to}::date`,
    ),
  ]);

  const cells = new Map<string, Cell[]>();
  const cellsOf = (unitId: string) => {
    let c = cells.get(unitId);
    if (!c) cells.set(unitId, (c = days.map(() => ({ wo: [], standby: false, maintenance: null }))));
    return c;
  };

  for (const w of workOrders.rows) {
    const first = Math.max(0, Math.round((dayMs(w.s) - start) / DAY_MS));
    const last = Math.min(6, Math.round((dayMs(w.f) - start) / DAY_MS));
    for (let i = first; i <= last; i++) cellsOf(w.unit_id)[i].wo.push({ id: w.wo_id, rcId: w.rc_id, location: w.location });
  }
  for (const s of standby.rows) cellsOf(s.unit_id)[days.indexOf(s.d)].standby = true;
  for (const m of maintenance.rows) cellsOf(m.unit_id)[days.indexOf(m.d)].maintenance = m.remarks ?? "";

  res.json({
    from,
    to,
    days,
    units: units.rows.map((u) => ({
      unitId: u.unit_id,
      unitType: u.unit_type,
      active: u.status === "active",
      cells: cellsOf(u.unit_id),
    })),
  });
});
