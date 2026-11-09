# Aturan Endpoint (API v2)

Catatan ini mencatat aturan setiap endpoint server v2. **Wajib diperbarui setiap kali endpoint dibuat atau diubah** (path, izin, validasi, perilaku, kode error).

- Server: `http://localhost:3200`. Saat pengembangan web di `http://localhost:5173` meneruskan `/api` ke server.
- Format: JSON. Error selalu berbentuk `{ "error": "pesan" }` (kadang dengan field tambahan).
- Autentikasi: sesi cookie (`connect.sid`, httpOnly, 8 jam), disimpan di memori server.
- Izin dicek lewat `requirePermission(key)` ([server/src/access.ts](../server/src/access.ts)). Belum login → `401`, tidak punya izin → `403`.
- Semua perubahan data dicatat di `access.audit_log`.
- Kolom `rental.work_order.created_by` baru ada di staging, jadi endpoint pembuat WO belum bisa jalan di live (lihat Planning).

Terakhir diperbarui: 2026-11-09 (tipe work order dan nilai awal time/volume/pipe dari `unit_price_default`).

---

## Autentikasi

### POST `/api/login`
- Izin: publik.
- Body: `{ username, password }` (keduanya wajib, tidak boleh kosong).
- Sukses `200`: `{ username, name, role }`. Sesi dibuat ulang (regenerate).
- Error: `400` jika ada yang kosong; `401` jika username/password salah atau akun nonaktif; `500` jika sesi gagal dibuat.
- Kode: [server/src/index.ts](../server/src/index.ts).

### POST `/api/logout`
- Izin: publik (tanpa cek login).
- Sukses `200`: `{ ok: true }`. Sesi dihapus dan cookie dibersihkan.

### GET `/api/me`
- Izin: harus login (akun aktif).
- Sukses `200`: `{ username, name, role, sections, permissions }`. `sections` berisi `["*"]` untuk Superadmin.
- Error: `401` jika belum login atau akun nonaktif.

## Jadwal unit

### GET `/api/schedule`
- Izin: `schedule:view`.
- Query: `from` (wajib, `YYYY-MM-DD`), `to` (opsional, default `from` + 6 hari).
- Rentang maksimal 7 hari; `to` tidak boleh sebelum `from`.
- Hanya membaca data (unit, work order, standby, maintenance), tidak mengubah apa pun.
- Sukses `200`: `{ from, to, days[], units[] }`.
- Error: `400` untuk format tanggal salah, rentang terbalik, atau lebih dari 7 hari.
- Kode: [server/src/schedule.ts](../server/src/schedule.ts).

## Pilihan form

### GET `/api/form-options`
- Izin: login dan salah satu dari `work_order:create`, `maintenance:create`, `standby:create`.
- Sukses `200`: `{ rcTypes[], defaults[], operators[], units[], contracts[] }`.
  - `rcTypes`: daftar tipe work order = nilai `rc_type` yang ada di `rental.unit_price_default` (saat ini Contract, Mass Concrete, Retail).
  - `defaults`: `{ unitType, rcType, time, volume, pipe }` dari `unit_price_default` (`wo_time`, `wo_volume`, `rc_pipe`). Form memakainya sebagai nilai awal; user tetap bisa mengubahnya. Pencocokan `unit_type` tidak peka huruf besar/kecil (`rental.unit` memakai `MINI`, tabel default memakai `Mini`).
  - `operators`: `{ employeeId, name }` dari `hr.employee` dengan `lower(role) = 'operator'` dan `is_active`, urut nama.
  - `units`: `{ unitId, unitType }`, hanya unit berstatus `active`.
  - `contracts`: `{ rcId, rcType, location, status }`, 200 terbaru menurut `rc_start_date`.
- Error: `401`, `403`.
- Kode: [server/src/records.ts](../server/src/records.ts).

## Work order

### POST `/api/work-orders`
- Izin: `work_order:create`.
- Body:

| Field | Aturan |
|---|---|
| `operatorId` | wajib, UUID karyawan; harus aktif dan ber-role operator (disimpan ke kolom `operator`) |
| `unitId` | wajib; unit harus ada dan `active` |
| `rcType` | wajib; harus salah satu `rc_type` di `rental.unit_price_default` (lihat `rcTypes` di `/api/form-options`) |
| `location` | wajib, maks 500 karakter |
| `startDate` | wajib, `YYYY-MM-DD`, antara 2020-01-01 dan 2100-12-31 |
| `finishDate` | opsional; kosong → sama dengan `startDate`; tidak boleh sebelum `startDate` |
| `qty` | bilangan bulat 0–999, default 1 |
| `time` | opsional, bilangan bulat 0–9999 |
| `volume` | opsional, 0–99.999.999, default 0 |
| `pipe` | opsional, maks 100 karakter |
| `remarks` | opsional, maks 2000 karakter |
| `rcId` | opsional, maks 50 karakter; kalau diisi harus ada di `rental.rent_contract` |

- Perilaku (satu transaksi, semua-atau-tidak-sama-sekali):
  - `wo_id` dibuat otomatis `WOyy-mmdd-NNN` dari `rental.id_daily_counter` (sama dengan v1).
  - `unit_type` diambil dari tabel unit (tidak dikirim dari form).
  - Kolom `user` diisi nama lengkap operator (kompatibel dengan v1), `operator` diisi `operatorId`, `created_by` diisi akun yang login.
  - Tumpang tindih tidak memblokir. Bentrok dengan maintenance/standby hanya muncul di `warnings`.
  - Dicatat di `access.audit_log` (`work_order:create`).
- Sukses `201`: `{ id, unitId, startDate, finishDate, warnings[] }`.
- Error: `400` (validasi, unit/operator/`rcId` tidak valid), `401`, `403`, `500`.

Belum ada: list, detail, ubah, dan hapus work order.

## Maintenance dan standby

Aturan sama untuk keduanya: satu baris per unit per hari, rentang maksimal 31 hari, semua-atau-tidak-sama-sekali.

### POST `/api/maintenance`
- Izin: `maintenance:create`.
- Body: `unitId` (wajib), `startDate` (wajib), `finishDate` (opsional, default `startDate`), `remarks` (opsional, maks 2000).
- Tidak boleh bentrok dengan work order atau maintenance lain pada tanggal itu.
- Sukses `201`: `{ unitId, startDate, finishDate, count }`.
- Error: `400` (validasi, rentang > 31 hari, unit tidak valid), `409` (bentrok; berisi `conflicts[]` dan tidak ada data tersimpan), `401`, `403`.

### POST `/api/standby`
- Izin: `standby:create`.
- Body: sama dengan maintenance, tetapi tanpa `remarks`; kolom `user` diisi nama akun yang login.
- Tidak boleh bentrok dengan work order, maintenance, atau standby lain pada tanggal itu.
- Sukses `201` dan error sama seperti maintenance.

---

## Yang belum ada
- List, detail, ubah, dan hapus untuk work order, maintenance, dan standby.
- Endpoint ubah jadwal (`schedule:edit`).
- Endpoint pengaturan akses Superadmin.
