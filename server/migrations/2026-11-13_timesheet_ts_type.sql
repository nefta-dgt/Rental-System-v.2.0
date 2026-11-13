-- Menambah rental.timesheet.ts_type: jenis timesheet (work, failed, standby) sebagai tipe enum rental.timesheet_type.
-- Hanya MENAMBAH satu tipe dan satu kolom yang boleh kosong, tanpa default dan tanpa mengisi baris yang ada.
-- Insert dan update dari v1 tidak terpengaruh (kolom tetap null); v1 memakai daftar kolom eksplisit, dan trigger
-- trg_log_timesheet memakai to_jsonb(NEW/OLD) sehingga kolom baru ikut tercatat di ts_log.
-- Kolom status (Work, Standby, Failed, Failed-maintenance) TIDAK diubah dan tetap dipakai v1.
-- Belum ada aturan yang memaksa ts_type terisi atau sejalan dengan status/standby_id; itu keputusan terpisah.
-- Pembatalan: 2026-11-13_timesheet_ts_type.rollback.sql
begin;

create type rental.timesheet_type as enum ('work', 'failed', 'standby');

alter table rental.timesheet add column ts_type rental.timesheet_type;

comment on column rental.timesheet.ts_type is 'Jenis timesheet: work, failed, atau standby. Boleh kosong (baris lama belum diisi).';

commit;
