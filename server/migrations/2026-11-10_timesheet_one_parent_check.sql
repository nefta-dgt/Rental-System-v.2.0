-- Aturan "tepat satu": setiap timesheet menunjuk TEPAT SATU dari work_order_id atau standby_id.
-- JANGAN dijalankan di live sebelum: (1) 2026-11-10_timesheet_standby_id.sql sudah jalan, (2) tidak ada timesheet tanpa WO
-- (live dicek 2026-11-10: 0), dan (3) tidak ada lagi penulis ke timesheet yang membuat baris tanpa induk. Satu-satunya penulis
-- timesheet di v1 adalah endpoint approve (/api/review); tanpa penyesuaian, approve tanpa WO akan ditolak (error 23514, transaksi
-- di-rollback, dokumen tetap pending di buffer_timesheet), dan linkTimesheetToWorkOrder pada timesheet standby akan ditolak juga.
-- Dipasang NOT VALID lalu divalidasi, supaya pelanggaran (kalau ada) terlihat jelas sebelum constraint aktif penuh.
-- Pembatalan: 2026-11-10_timesheet_one_parent_check.rollback.sql
begin;

alter table rental.timesheet
  add constraint timesheet_one_parent_check check (num_nonnulls(work_order_id, standby_id) = 1) not valid;

alter table rental.timesheet validate constraint timesheet_one_parent_check;

commit;
