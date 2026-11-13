-- Melanjutkan 2026-11-13_timesheet_ts_type.sql: ts_type wajib diisi dan terikat ke standby_id.
-- 1) Semua baris yang ada diisi 'work' (keputusan user 2026-11-13; kolom status tidak diubah).
-- 2) ts_type jadi NOT NULL.
-- 3) timesheet_ts_type_standby_check: ts_type = 'standby' kalau dan hanya kalau standby_id terisi.
--    Untuk ts_type 'work' atau 'failed', standby_id harus kosong. Kolom work_order_id tidak diatur di sini:
--    karena timesheet_one_parent_check (tepat satu dari work_order_id/standby_id) tetap berlaku, timesheet standby
--    otomatis tanpa work_order_id, dan timesheet work/failed wajib punya work_order_id.
-- PERHATIAN: tanpa default, insert dari v1/bot/n8n yang tidak menyebut ts_type akan DITOLAK (NOT NULL). Jalankan di live
--   PALING AKHIR, bersama atau sesudah timesheet_one_parent_check, setelah v1 disesuaikan atau dipensiunkan.
-- Backfill memicu trigger trg_log_timesheet, jadi tiap baris yang diubah menulis satu catatan UPDATE ke ts_log.
-- Pembatalan: 2026-11-13_timesheet_ts_type_required.rollback.sql (nilai 'work' yang sudah diisi tidak dikembalikan ke kosong).
begin;
set local search_path to rental, public; -- trigger log menulis ke ts_log tanpa nama skema

update rental.timesheet set ts_type = 'work' where ts_type is null;

alter table rental.timesheet alter column ts_type set not null;

alter table rental.timesheet
  add constraint timesheet_ts_type_standby_check check ((ts_type = 'standby') = (standby_id is not null));

commit;
