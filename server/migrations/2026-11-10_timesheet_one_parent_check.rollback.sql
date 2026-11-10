-- Membatalkan 2026-11-10_timesheet_one_parent_check.sql.
begin;
alter table rental.timesheet drop constraint if exists timesheet_one_parent_check;
commit;
