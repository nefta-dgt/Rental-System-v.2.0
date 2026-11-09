-- Menambah tiga izin untuk daftar, ubah, dan hapus work order. Hanya menambah baris di access.permission.
-- Superadmin sudah punya '*', jadi otomatis boleh. Peran lain diisi nanti.
-- Pembatalan: 2026-11-09_add_work_order_view_edit_delete_permissions.rollback.sql
begin;

insert into access.permission (key, feature, action, description) values
  ('work_order:view', 'work_order', 'view', 'Melihat dan mencari daftar work order'),
  ('work_order:edit', 'work_order', 'edit', 'Mengubah work order'),
  ('work_order:delete', 'work_order', 'delete', 'Menghapus work order');

commit;
