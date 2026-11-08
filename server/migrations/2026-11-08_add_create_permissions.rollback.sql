-- Membatalkan 2026-11-08_add_create_permissions.sql.
begin;
delete from access.user_permission where permission_key in ('work_order:create', 'maintenance:create', 'standby:create');
delete from access.role_permission where permission_key in ('work_order:create', 'maintenance:create', 'standby:create');
delete from access.permission where key in ('work_order:create', 'maintenance:create', 'standby:create');
commit;
