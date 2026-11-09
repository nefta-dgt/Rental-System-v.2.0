-- Membatalkan 2026-11-10_day_records_created_by.sql. Data kolom created_by ikut hilang.
begin;
alter table rental.maintenance drop constraint if exists fk_maintenance_created_by;
alter table rental.maintenance drop column if exists created_by;
alter table rental.standby_log drop constraint if exists fk_standby_log_created_by;
alter table rental.standby_log drop column if exists created_by;
commit;
