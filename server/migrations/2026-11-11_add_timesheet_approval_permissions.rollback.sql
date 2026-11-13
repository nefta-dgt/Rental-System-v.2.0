-- Membatalkan 2026-11-11_add_timesheet_approval_permissions.sql.
begin;
delete from access.role_permission where permission_key in ('timesheet:view', 'timesheet:approve');
delete from access.user_permission where permission_key in ('timesheet:view', 'timesheet:approve');
delete from access.permission where key in ('timesheet:view', 'timesheet:approve');
commit;
