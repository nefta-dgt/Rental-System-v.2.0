import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db.js";

type WorkOrder = {
  id: string;
  rcId: string | null;
  rcType: string | null;
  location: string | null;
  start: string;
  finish: string;
};
type Cell = { wo: WorkOrder[]; standby: boolean; maintenance: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 7;
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)));
const query = z.object({ from: isoDate, to: isoDate.optional() });

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);

// Jadwal untuk rentang tanggal pilihan (maksimal 7 hari). Hanya membaca data, tidak mengubah apa pun.
// Parameter: from (wajib, YYYY-MM-DD) dan to (opsional, default from + 6 hari).
export const scheduleRouter = Router();

scheduleRouter.get("/", async (req, res) => {
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Parameter from dan to harus berformat YYYY-MM-DD" });

  const start = dayMs(parsed.data.from);
  const end = parsed.data.to ? dayMs(parsed.data.to) : start + (MAX_DAYS - 1) * DAY_MS;
  const count = Math.round((end - start) / DAY_MS) + 1;
  if (count < 1) return res.status(400).json({ error: "Tanggal sampai tidak boleh sebelum tanggal dari" });
  if (count > MAX_DAYS) return res.status(400).json({ error: `Rentang maksimal ${MAX_DAYS} hari` });

  const from = iso(start);
  const to = iso(end);
  const days = Array.from({ length: count }, (_, i) => iso(start + i * DAY_MS));
  const last = count - 1;

  // Tanggal dikirim sebagai teks supaya tidak bergeser oleh zona waktu.
  const [units, workOrders, standby, maintenance] = await Promise.all([
    db.execute<{ unit_id: string; unit_type: string | null; status: string }>(
      sql`select unit_id, unit_type, status from rental.unit order by unit_type, unit_id`,
    ),
    db.execute<{
      wo_id: string;
      unit_id: string;
      rc_id: string | null;
      rc_type: string | null;
      location: string | null;
      s: string;
      f: string;
    }>(
      sql`select wo_id, unit_id, rc_id, rc_type, location, wo_start_date::text as s,
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
    const lastDay = Math.min(last, Math.round((dayMs(w.f) - start) / DAY_MS));
    const wo: WorkOrder = { id: w.wo_id, rcId: w.rc_id, rcType: w.rc_type, location: w.location, start: w.s, finish: w.f };
    for (let i = first; i <= lastDay; i++) cellsOf(w.unit_id)[i].wo.push(wo);
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
