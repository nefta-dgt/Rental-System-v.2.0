# Aturan Endpoint (API v2)

Catatan ini mencatat aturan setiap endpoint server v2. **Wajib diperbarui setiap kali endpoint dibuat atau diubah** (path, izin, validasi, perilaku, kode error).

- Server: `http://localhost:3200`. Saat pengembangan web di `http://localhost:5173` meneruskan `/api` ke server.
- Format: JSON. Error selalu berbentuk `{ "error": "pesan" }` (kadang dengan field tambahan).
- Autentikasi: sesi cookie (`connect.sid`, httpOnly, 8 jam), disimpan di memori server.
- Izin dicek lewat `requirePermission(key)` ([server/src/access.ts](../server/src/access.ts)). Belum login → `401`, tidak punya izin → `403`.
- Semua perubahan data dicatat di `access.audit_log`.
- Kolom `created_by` pada `rental.work_order`, `rental.maintenance`, `rental.standby_log`, serta `rental.timesheet.standby_id`, baru ada di staging, jadi endpoint buat dan daftar untuk ketiganya belum bisa jalan di live (lihat Planning).

Terakhir diperbarui: 2026-11-11 (Timesheet Approval: `/api/timesheet-approvals`; timesheet standby: POST `/api/standby/:id/timesheet`, tanpa work order).

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

### GET `/api/work-orders`
- Izin: `work_order:view`.
- Query (semua opsional, digabung dengan AND; semua teks tidak peka huruf besar/kecil dan cocok sebagian):
  - `q` (maks 100): nomor WO, location, RC id, remarks.
  - `unitId` (maks 100): ID unit.
  - `operator` (maks 100): nama operator (dari `hr.employee`, cadangan kolom `user`).
  - `rcType`: tipe work order (persis).
  - `date` (`YYYY-MM-DD`): hanya WO yang periodenya mencakup tanggal itu, yaitu `wo_start_date <= date <= wo_finish_date` (finish kosong dianggap sama dengan start).
  - `page` (default 1), `pageSize` (default 25, maks 100).
- Urutan: tanggal mulai terbaru dulu. Parameter `from` dan `to` yang lama sudah diganti oleh `date`.
- Sukses `200`: `{ items[], total, page, pageSize }`. Tiap item: `id, timestamp, createdByName, operatorId, operatorName, unitId, unitType, rcType, rcId, location, startDate, finishDate, qty, time, volume, pipe, remarks`. Tanggal berbentuk teks `YYYY-MM-DD`. `timestamp` = waktu WO dibuat (teks dari database); `createdByName` = nama akun (`hr.users.employee_name`) dari `created_by`, `null` untuk WO dari v1/bot. `operatorName` berasal dari `hr.employee` lewat kolom `operator`, bukan kolom `user`.
- Error: `400` (format tanggal salah), `401`, `403`.

### GET `/api/work-orders/:id`
- Izin: `work_order:view`. Sukses `200`: satu item seperti di atas. Error: `404` jika tidak ada.

### PUT `/api/work-orders/:id`
- Izin: `work_order:edit`. Berlaku untuk semua work order (belum ada aturan "hanya WO miliknya").
- Body sama dengan `POST /api/work-orders` (semua kolom yang bisa diedit diganti sekaligus). `wo_id`, `created_by`, dan `timestamp` tidak berubah.
- Validasi sama dengan create, **kecuali** nilai yang tidak diganti tidak dicek ulang: WO lama boleh tetap punya unit nonaktif, operator nonaktif, atau tipe lama (mis. `Standby`) selama nilai itu tidak diubah.
- Kolom `user` ikut diisi nama operator, `unit_type` mengikuti unit. Baris dikunci selama transaksi.
- Bentrok dengan maintenance/standby hanya `warnings` (tidak memblokir).
- Dicatat di `access.audit_log` (`work_order:edit`) berikut data sebelum dan sesudah.
- Sukses `200`: `{ id, unitId, startDate, finishDate, warnings[] }`. Error: `400`, `404`, `401`, `403`.

### DELETE `/api/work-orders/:id`
- Izin: `work_order:delete`.
- Ditolak `409` jika WO sudah dipakai di `rental.timesheet`, `rental.timesheet_valuation`, atau `rental.buffer_timesheet` (pesan menyebut jumlahnya). Ini mencegah relasi putus diam-diam (`timesheet_valuation.wo_id` akan di-null otomatis oleh FK).
- Dicatat di `access.audit_log` (`work_order:delete`) berikut data sebelum dihapus. Tidak bisa dibatalkan.
- Sukses `200`: `{ ok: true, id }`. Error: `404`, `409`, `401`, `403`.

Izin baru `work_order:view`, `work_order:edit`, `work_order:delete` dibuat lewat `server/migrations/2026-11-09_add_work_order_view_edit_delete_permissions.sql` (staging saja; Superadmin otomatis lewat `*`).


## Maintenance dan standby

Aturan sama untuk keduanya: satu baris per unit per hari, rentang maksimal 31 hari, semua-atau-tidak-sama-sekali.

### GET `/api/maintenance` dan GET `/api/standby`
- Izin: `maintenance:view` / `standby:view` (migrasi `server/migrations/2026-11-10_add_maintenance_standby_view_permissions.sql`, staging saja; Superadmin otomatis lewat `*`).
- Satu item = satu baris tabel (satu unit, satu hari), sama seperti isi `rental.maintenance` / `rental.standby_log`. Rentang yang dibuat sekaligus muncul sebagai beberapa baris.
- Query (semua opsional, digabung dengan AND; teks tidak peka huruf besar/kecil dan cocok sebagian):
  - `q` (maks 100): maintenance → `remarks`; standby → nama pembuat (`createdByName`).
  - `unitId` (maks 100): ID unit.
  - `date` (`YYYY-MM-DD`): hanya baris pada tanggal itu (persis).
  - `page` (default 1), `pageSize` (default 25, maks 100).
- Urutan: tanggal terbaru dulu, lalu `id` terbesar.
- Sukses `200`: `{ items[], total, page, pageSize }`. Tiap item: `id, unitId, unitType, date (YYYY-MM-DD), createdAt, createdByName, note`. `createdByName` = nama akun (`hr.users.employee_name`) dari `created_by`; untuk standby lama dari v1 cadangannya kolom `user`; `null` jika tidak ada. `note` = `remarks` (maintenance), selalu `null` untuk standby.
- Error: `400` (format tanggal salah), `401`, `403`.

### GET `/api/standby/ranges`
- Izin: `standby:view`. Dipakai halaman Daftar Standby.
- Menggabungkan hari berurutan untuk satu unit menjadi satu rentang (tanpa lubang), memakai data `rental.standby_log`. Penggabungan dilakukan **sebelum** filter `q` dan `date`, jadi satu rentang tidak terpotong oleh filter. Filter `unitId` diterapkan sebelum penggabungan (aman, per unit).
- Query (opsional, digabung dengan AND): `q` (nama pembuat, tidak peka huruf besar/kecil, cocok sebagian), `unitId`, `date` (`YYYY-MM-DD`; rentang yang mencakup tanggal itu), `page`, `pageSize` (default 25, maks 100).
- Urutan: tanggal selesai terbaru, lalu tanggal mulai terbaru, lalu unit.
- Sukses `200`: `{ items[], total, page, pageSize }`. Tiap item: `unitId, unitType, startDate, finishDate, days, createdAt, createdByName`. `days` = jumlah hari berbeda dalam rentang; `createdAt` = pembuatan baris paling awal; `createdByName` = pembuat baris pertama yang punya nama (rentang yang dibuat beberapa orang hanya menampilkan satu nama).
- Error: `400` (format tanggal salah), `401`, `403`. Endpoint harian `GET /api/standby` tetap ada.

### POST `/api/maintenance`
- Izin: `maintenance:create`.
- Body: `unitId` (wajib), `startDate` (wajib), `finishDate` (opsional, default `startDate`), `remarks` (opsional, maks 2000).
- Tidak boleh bentrok dengan work order atau maintenance lain pada tanggal itu.
- Setiap baris yang dibuat mengisi `created_by` dengan akun yang login.
- Sukses `201`: `{ unitId, startDate, finishDate, count }`.
- Error: `400` (validasi, rentang > 31 hari, unit tidak valid), `409` (bentrok; berisi `conflicts[]` dan tidak ada data tersimpan), `401`, `403`.

### POST `/api/standby`
- Izin: `standby:create`.
- Body: sama dengan maintenance, tetapi tanpa `remarks`; kolom `user` diisi nama akun yang login.
- Tidak boleh bentrok dengan work order, maintenance, atau standby lain pada tanggal itu.
- Setiap baris yang dibuat mengisi `created_by` (akun yang login); kolom `user` tetap diisi nama akun seperti sebelumnya.
- Sukses `201` dan error sama seperti maintenance.

## Timesheet Approval

Sumber data: `rental.buffer_timesheet` (hasil OCR dari WhatsApp/n8n, ditulis v1). Hanya yang berstatus `PENDING` muncul di daftar. Kode: [server/src/timesheetApproval.ts](../server/src/timesheetApproval.ts).

### GET `/api/timesheet-approvals`
- Izin: `timesheet:view`.
- Query: `q` (maks 100; cocok sebagian pada nomor TS, unit, pelanggan, operator), `page` (default 1), `pageSize` (1–100, default 25).
- Sukses `200`: `{ items[], total, page, pageSize }`; item: `{ id, createdAt, tsNo, unitId, unitType, date, customer, location, operator, volume, confidence, doubtfulFields, hasImage }`. Nilai berupa teks OCR apa adanya. Urut `created_at` terbaru.

### GET `/api/timesheet-approvals/:id`
- Izin: `timesheet:view`.
- Sukses `200`: isi OCR (`fields`), `status`, `confidence`, `doubtfulFields`, `hasImage`, plus bahan untuk approve:
  - `resolved`: `{ unitId, date }` = unit master (dicocokkan tanpa spasi/tanda baca, tidak peka huruf besar/kecil, mis. "K 20" = `K-20`) dan tanggal ISO. `null` kalau tidak terbaca.
  - `workOrders[]`: work order unit itu yang periodenya mencakup tanggal timesheet (`hasTimesheetThatDay` menandai yang sudah punya timesheet hari itu).
  - `prefill`: nilai awal form yang sudah dirapikan (tanggal ISO, jam `HH:MM`, volume).
  - `operators[]`, `crew[]` (dengan `nik`): karyawan aktif ber-role operator/crew. `units[]`: semua unit master. `statuses[]`: pilihan status timesheet.
  - `suggested`: `{ operatorId, crewIds }` dari kecocokan nama persis di OCR (boleh kosong).
- Error: `404`.

### GET `/api/timesheet-approvals/work-orders`
- Izin: `timesheet:view`.
- Query: `unitId`, `date` (`YYYY-MM-DD`). Mengembalikan `{ items[] }`: work order unit itu yang periodenya mencakup tanggal, `{ id, location, rcType, operatorId, start, finish, hasTimesheetThatDay }`. Parameter tidak valid → `items` kosong. Dipakai form saat unit atau tanggal diubah.

### GET `/api/timesheet-approvals/:id/image`
- Izin: `timesheet:view`.
- Mengirim file gambar OCR dari folder `UPLOADS_DIR` (env server). Hanya nama file dari `image_filename` yang dipakai, jadi tidak bisa keluar dari folder itu.
- Error: `404` (tidak ada gambar, `UPLOADS_DIR` belum diatur, atau file tidak ada di folder).

### POST `/api/timesheet-approvals/:id/approve`
- Izin: `timesheet:approve`.
- Body (nilai OCR boleh dikoreksi di form, seperti Review Document di v1):

| Field | Aturan |
|---|---|
| `woId` | wajib; work order harus ada, untuk unit yang sama, periodenya mencakup `date`, dan operatornya (kalau terisi) sama dengan `operatorId` |
| `tsNo` | wajib, maks 100; belum boleh ada di `rental.timesheet` |
| `operatorId` | wajib, UUID karyawan aktif ber-role operator (nama lengkapnya disimpan di kolom `operator`) |
| `unitId` | wajib; harus ada di `rental.unit` |
| `date` | wajib, `YYYY-MM-DD`, 2020-01-01 sampai 2100-12-31 |
| `status` | `Work`, `Standby`, `Failed`, atau `Failed-maintenance` (sama dengan pilihan v1) |
| `volume` | wajib, angka 0–99.999.999 |
| `start`, `finish` | wajib, `HH:MM`; total jam kerja dihitung server dari keduanya (lewat tengah malam +24 jam, 2 desimal) |
| `dispatch`, `arrive`, `returnTime` | opsional, `HH:MM` |
| `distanceKm` | opsional, angka atau `null` |
| `pipe`, `customer`, `location`, `batchingPlant`, `notes` | opsional teks |
| `crewIds` | opsional, maks 4 UUID karyawan aktif ber-role crew; tidak boleh dobel atau sama dengan operator |

- Perilaku (satu transaksi, termasuk status buffer; v1 mengubah status di luar transaksi):
  - Baris buffer dikunci dan harus `PENDING`.
  - Membuat `rental.timesheet` (`unit_type` dari master unit, `time` = total jam hasil hitung), `operator_and_crew_assignment` (OPERATOR dan CREW), lalu buffer menjadi `APPROVED` dengan `wo_id`.
  - Perusahaan, PIC, dan Phone dari OCR tidak disimpan (v1 juga tidak menyimpannya).
  - Dicatat di `access.audit_log` (`timesheet:approve`).
- Sukses `200`: `{ id, status: "APPROVED", tsId, workOrderId, unitId, date }`.
- Error: `400` (validasi, unit/WO/operator/crew tidak valid, WO beda unit, tanggal di luar periode WO, operator beda dengan operator WO), `404`, `409` (sudah di-approve/decline, nomor TS sudah ada, atau WO itu sudah punya timesheet di tanggal tsb).
- Timesheet tanpa work order tidak bisa dibuat lewat jalur ini (v1 bisa); ini sejalan dengan aturan "tepat satu" work order atau standby.

### POST `/api/timesheet-approvals/:id/decline`
- Izin: `timesheet:approve`.
- Mengubah status buffer menjadi `REJECTED` (baris tidak dihapus, sama dengan v1). Hanya dari `PENDING`.
- Sukses `200`: `{ id, status: "REJECTED" }`. Error: `404`, `409`.

---

## Timesheet standby

### POST `/api/standby/:id/timesheet`
- Izin: `timesheet:create` (migrasi `server/migrations/2026-11-10_add_timesheet_create_permission.sql`, staging saja; Superadmin otomatis lewat `*`).
- Membuat **timesheet berstatus `Standby`** untuk satu hari standby (`:id` = `rental.standby_log.id`). Timesheet menunjuk standby lewat kolom `timesheet.standby_id` dan **tidak** memakai work order (`work_order_id` dikosongkan). Aturan "tepat satu" dari `work_order_id` atau `standby_id` dijaga constraint `timesheet_one_parent_check`.
- Butuh migrasi `2026-11-10_timesheet_standby_id.sql` (kolom `standby_id`: boleh kosong, FK `ON DELETE RESTRICT`, `UNIQUE`). Constraint `2026-11-10_timesheet_one_parent_check.sql` dipasang paling akhir dan bukan syarat endpoint ini. Keduanya baru ada di staging.
- Body:

| Field | Aturan |
|---|---|
| `tsId` | wajib, maks 100 karakter; nomor timesheet harus belum dipakai |
| `operatorId` | wajib, UUID karyawan aktif ber-role `operator` |
| `crewIds` | opsional, maks 5 UUID karyawan aktif ber-role `crew`; tidak boleh ganda dan tidak boleh sama dengan operator |
| `time` | opsional, 0 sampai 9999, default 0 |
| `volume` | opsional, 0 sampai 99.999.999, default 0 |
| `remarks` | opsional, maks 2000 karakter |

- Perilaku (satu transaksi, semua-atau-tidak-sama-sekali):
  - Unit, tanggal, dan tipe unit diambil dari baris standby (tidak dikirim dari form). Kolom `operator` diisi nama operator, kolom `user` diisi nama akun yang login (ikut tercatat sebagai `changed_by` di `ts_log`).
  - Satu hari standby hanya boleh punya satu timesheet (`409` jika sudah ada).
  - Satu OPERATOR dan nol sampai lima CREW dimasukkan ke `operator_and_crew_assignment`, sama seperti v1.
  - Tidak memblokir jika unit dan tanggal itu sudah punya timesheet lain (Work/Standby); hanya muncul di `warnings`.
  - Trigger `fn_log_timesheet_changes` menulis ke `ts_log` tanpa awalan skema, jadi transaksi memasang `set local search_path to rental, public`. Fungsi trigger di database tidak diubah.
  - Dicatat di `access.audit_log` (`timesheet:create`).
- Sukses `201`: `{ tsId, standbyId, unitId, date, status, operatorName, crewCount, warnings[] }`.
- Error: `400` (validasi, operator atau crew tidak valid, ID standby bukan angka), `404` (hari standby tidak ada), `409` (standby sudah punya timesheet, atau nomor timesheet dobel), `401`, `403`.
- Belum ada halaman web untuk endpoint ini.

## Yang belum ada
- Detail, ubah, dan hapus untuk maintenance dan standby (daftar sudah ada).
- Endpoint ubah jadwal (`schedule:edit`).
- Endpoint pengaturan akses Superadmin.
