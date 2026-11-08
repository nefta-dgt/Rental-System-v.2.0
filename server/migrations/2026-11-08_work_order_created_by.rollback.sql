-- Membatalkan 2026-11-08_work_order_created_by.sql. Data kolom created_by ikut hilang.
begin;
alter table rental.work_order drop constraint if exists fk_work_order_created_by;
alter table rental.work_order drop column if exists created_by;
commit;
