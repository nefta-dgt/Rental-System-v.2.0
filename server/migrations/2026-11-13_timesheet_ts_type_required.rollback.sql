-- Membatalkan 2026-11-13_timesheet_ts_type_required.sql: melepas aturan dan NOT NULL.
-- Nilai ts_type yang sudah terisi dibiarkan (tidak dikosongkan lagi). Untuk menghapus kolomnya, jalankan 2026-11-13_timesheet_ts_type.rollback.sql.
begin;
alter table rental.timesheet drop constraint if exists timesheet_ts_type_standby_check;
alter table rental.timesheet alter column ts_type drop not null;
commit;
