-- Menambah dua izin untuk melihat daftar maintenance dan standby. Hanya menambah baris di access.permission.
-- Superadmin sudah punya '*', jadi otomatis boleh. Peran lain diisi nanti.
-- Pembatalan: 2026-11-10_add_maintenance_standby_view_permissions.rollback.sql
begin;

insert into access.permission (key, feature, action, description) values
  ('maintenance:view', 'maintenance', 'view', 'Melihat dan mencari daftar maintenance'),
  ('standby:view', 'standby', 'view', 'Melihat dan mencari daftar standby');

commit;
