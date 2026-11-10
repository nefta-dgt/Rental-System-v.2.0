-- Menambah izin timesheet:create (membuat timesheet standby di v2). Hanya menambah baris di access.permission.
-- Superadmin sudah punya '*', jadi otomatis boleh. Peran lain diisi nanti.
-- Pembatalan: 2026-11-10_add_timesheet_create_permission.rollback.sql
begin;

insert into access.permission (key, feature, action, description) values
  ('timesheet:create', 'timesheet', 'create', 'Membuat timesheet standby dari hari standby');

commit;
