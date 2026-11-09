-- Membatalkan 2026-11-10_add_maintenance_standby_view_permissions.sql.
begin;
delete from access.role_permission where permission_key in ('maintenance:view', 'standby:view');
delete from access.user_permission where permission_key in ('maintenance:view', 'standby:view');
delete from access.permission where key in ('maintenance:view', 'standby:view');
commit;
