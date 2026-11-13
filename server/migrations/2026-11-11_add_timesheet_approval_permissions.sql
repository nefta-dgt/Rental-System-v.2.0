-- Menambah dua izin untuk menu Timesheet Approval (buffer_timesheet). Hanya menambah baris di access.permission.
-- Superadmin sudah punya '*', jadi otomatis boleh. Peran lain diisi nanti.
-- Pembatalan: 2026-11-11_add_timesheet_approval_permissions.rollback.sql
begin;

insert into access.permission (key, feature, action, description) values
  ('timesheet:view', 'timesheet', 'view', 'Melihat daftar timesheet yang menunggu approval'),
  ('timesheet:approve', 'timesheet', 'approve', 'Approve atau decline timesheet di buffer');

commit;
