-- Menambah tiga izin untuk halaman create. Hanya menambah baris di access.permission.
-- Superadmin sudah punya '*', jadi otomatis boleh. Peran lain diisi nanti.
-- Pembatalan: 2026-11-08_add_create_permissions.rollback.sql
begin;

insert into access.permission (key, feature, action, description) values
  ('work_order:create', 'work_order', 'create', 'Membuat work order'),
  ('maintenance:create', 'maintenance', 'create', 'Membuat catatan maintenance unit'),
  ('standby:create', 'standby', 'create', 'Membuat catatan standby unit');

commit;
