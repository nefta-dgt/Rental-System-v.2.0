-- Menambah rental.timesheet.standby_id: timesheet bisa menunjuk satu hari standby (rental.standby_log), sejajar dengan work_order_id.
-- Hanya MENAMBAH satu kolom yang boleh kosong, tanpa default. Insert dan update dari v1 tidak terpengaruh (kolom tetap null);
-- v1 memakai daftar kolom eksplisit, dan trigger trg_log_timesheet memakai to_jsonb(NEW/OLD) sehingga kolom baru ikut tercatat di ts_log.
-- ON DELETE RESTRICT (bukan SET NULL): standby yang sudah punya timesheet tidak boleh terhapus diam-diam, dan SET NULL akan
-- membuat timesheet tanpa induk (melanggar aturan "tepat satu" di migrasi berikutnya).
-- Aturan "tepat satu" (CHECK) ada di file terpisah dan dipasang PALING AKHIR: 2026-11-10_timesheet_one_parent_check.sql
-- Pembatalan: 2026-11-10_timesheet_standby_id.rollback.sql
begin;

alter table rental.timesheet add column standby_id integer;

alter table rental.timesheet
  add constraint fk_timesheet_standby_id foreign key (standby_id) references rental.standby_log (id) on delete restrict;

alter table rental.timesheet
  add constraint timesheet_standby_id_unique unique (standby_id);

comment on column rental.timesheet.standby_id is 'Hari standby (rental.standby_log.id) yang ditunjuk timesheet ini. Salah satu dari work_order_id atau standby_id terisi (dipaksa oleh timesheet_one_parent_check bila sudah dipasang).';

commit;
