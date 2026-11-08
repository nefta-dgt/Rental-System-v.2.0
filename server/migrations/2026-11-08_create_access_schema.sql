-- Hak akses v2: schema baru "access". Hanya MENAMBAH, tidak mengubah tabel v1 (hr.users, hr.role_permissions).
-- Jalankan di staging dulu. Pembatalan: 2026-11-08_create_access_schema.rollback.sql

begin;

create schema access;

-- Daftar izin yang sah (mencegah salah ketik). '*' berarti semua izin.
create table access.permission (
  key         text primary key,                 -- contoh: 'schedule:edit'
  feature     text not null,                    -- contoh: 'schedule'
  action      text not null,                    -- contoh: 'edit'
  description text not null,
  unique (feature, action)
);

-- Peran dan izinnya. role berupa teks agar cocok dengan hr.users.role
-- (peran Superadmin tidak ada di hr.role_permissions, jadi tidak bisa memakai referensi ke sana).
create table access.role_permission (
  role           varchar(100) not null,
  permission_key text not null references access.permission(key),
  scope          jsonb,                         -- null = berlaku untuk semua data (disiapkan untuk aturan berbasis data)
  primary key (role, permission_key)
);

-- Pengecualian per user: allow (tambahan) atau deny (pencabutan). deny selalu menang.
create table access.user_permission (
  user_id        uuid not null references hr.users(user_id),
  permission_key text not null references access.permission(key),
  effect         text not null check (effect in ('allow', 'deny')),
  scope          jsonb,
  granted_by     uuid references hr.users(user_id),
  note           text,
  created_at     timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- Catatan siapa mengubah apa dan kapan.
create table access.audit_log (
  id             bigserial primary key,
  at             timestamptz not null default now(),
  user_id        uuid references hr.users(user_id),
  permission_key text not null,
  entity         text not null,                 -- contoh: 'schedule'
  entity_id      text,
  before         jsonb,
  after          jsonb
);
create index audit_log_at_idx on access.audit_log (at desc);
create index audit_log_user_idx on access.audit_log (user_id, at desc);

-- Data awal: katalog izin dan akses penuh untuk Superadmin.
-- Pembagian peran lain menyusul, diisi setelah aturannya diputuskan.
insert into access.permission (key, feature, action, description) values
  ('*',               '*',        '*',      'Semua izin'),
  ('schedule:view',   'schedule', 'view',   'Melihat jadwal unit'),
  ('schedule:edit',   'schedule', 'edit',   'Mengubah jadwal unit'),
  ('schedule:export', 'schedule', 'export', 'Mengunduh laporan jadwal (CSV)'),
  ('access:manage',   'access',   'manage', 'Mengelola hak akses');

insert into access.role_permission (role, permission_key) values ('Superadmin', '*');

commit;
