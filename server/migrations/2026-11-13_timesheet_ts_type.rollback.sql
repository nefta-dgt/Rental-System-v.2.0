-- Membatalkan 2026-11-13_timesheet_ts_type.sql. Data kolom ts_type ikut hilang.
begin;
alter table rental.timesheet drop column if exists ts_type;
drop type if exists rental.timesheet_type;
commit;
