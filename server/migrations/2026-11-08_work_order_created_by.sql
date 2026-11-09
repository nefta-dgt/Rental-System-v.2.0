-- Menambah rental.work_order.created_by: user_id akun (hr.users) yang membuat work order.
-- Hanya MENAMBAH satu kolom yang boleh kosong, tanpa default. Insert dari v1 tidak terpengaruh
-- (kolom tetap null), dan WO yang sudah ada dibiarkan kosong (pembuat lamanya hanya nama di kolom "user").
-- Pembatalan: 2026-11-08_work_order_created_by.rollback.sql
begin;

alter table rental.work_order
  add column created_by uuid;

alter table rental.work_order
  add constraint fk_work_order_created_by foreign key (created_by) references hr.users (user_id);

comment on column rental.work_order.created_by is 'user_id akun (hr.users) yang membuat WO. Null untuk WO dari v1 atau bot.';

commit;
