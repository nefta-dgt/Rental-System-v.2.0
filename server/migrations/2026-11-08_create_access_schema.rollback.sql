-- Membatalkan 2026-11-08_create_access_schema.sql. Hanya menghapus objek di schema "access"; tabel v1 tidak tersentuh.
begin;
drop table if exists access.audit_log;
drop table if exists access.user_permission;
drop table if exists access.role_permission;
drop table if exists access.permission;
drop schema if exists access;
commit;
