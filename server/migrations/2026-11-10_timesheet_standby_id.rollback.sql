-- Membatalkan 2026-11-10_timesheet_standby_id.sql. Data kolom standby_id ikut hilang.
-- Jalankan 2026-11-10_timesheet_one_parent_check.rollback.sql lebih dulu bila CHECK sudah dipasang.
begin;
alter table rental.timesheet drop constraint if exists timesheet_standby_id_unique;
alter table rental.timesheet drop constraint if exists fk_timesheet_standby_id;
alter table rental.timesheet drop column if exists standby_id;
commit;
