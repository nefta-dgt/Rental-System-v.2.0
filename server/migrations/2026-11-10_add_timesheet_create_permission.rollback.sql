-- Membatalkan 2026-11-10_add_timesheet_create_permission.sql.
begin;
delete from access.role_permission where permission_key = 'timesheet:create';
delete from access.user_permission where permission_key = 'timesheet:create';
delete from access.permission where key = 'timesheet:create';
commit;
