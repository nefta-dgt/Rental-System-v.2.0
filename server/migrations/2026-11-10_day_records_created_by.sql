-- Menambah created_by (user_id akun di hr.users yang membuat catatan) ke rental.maintenance dan rental.standby_log.
-- Hanya MENAMBAH satu kolom yang boleh kosong pada tiap tabel, tanpa default. Insert dari v1 tidak terpengaruh
-- (kolom tetap null), dan baris yang sudah ada dibiarkan kosong. standby_log.user (nama) tetap diisi seperti biasa.
-- Pembatalan: 2026-11-10_day_records_created_by.rollback.sql
begin;

alter table rental.maintenance add column created_by uuid;
alter table rental.maintenance
  add constraint fk_maintenance_created_by foreign key (created_by) references hr.users (user_id);
comment on column rental.maintenance.created_by is 'user_id akun (hr.users) yang membuat catatan. Null untuk data dari v1 atau bot.';

alter table rental.standby_log add column created_by uuid;
alter table rental.standby_log
  add constraint fk_standby_log_created_by foreign key (created_by) references hr.users (user_id);
comment on column rental.standby_log.created_by is 'user_id akun (hr.users) yang membuat catatan. Null untuk data dari v1 atau bot.';

commit;
