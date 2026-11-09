-- Membatalkan 2026-11-09_add_work_order_view_edit_delete_permissions.sql.
begin;
delete from access.role_permission where permission_key in ('work_order:view', 'work_order:edit', 'work_order:delete');
delete from access.user_permission where permission_key in ('work_order:view', 'work_order:edit', 'work_order:delete');
delete from access.permission where key in ('work_order:view', 'work_order:edit', 'work_order:delete');
commit;
