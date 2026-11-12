# Dokumentasi Penjadwalan (v2)

Dokumen ini menjelaskan fitur **Penjadwalan** di Rental System v2: apa yang bisa dilakukan, aturan bisnisnya, halaman dan izin yang terlibat, serta data di baliknya. Untuk detail teknis setiap endpoint, lihat [Aturan-Endpoint.md](Aturan-Endpoint.md). Untuk keputusan dan daftar yang masih terbuka, lihat [Rental-System-v2-Planning.md](Rental-System-v2-Planning.md).

Terakhir diperbarui: 2026-11-12 (sesuai `main` setelah PR #11).

> **Status:** semua migrasi database v2 baru dijalankan di **staging** (`company_staging`), belum di database live. Kode v2 membutuhkan migrasi itu, jadi belum bisa dipakai di live. Daftar dan urutannya ada di bagian "Open list: migrasi yang BELUM dijalankan di live" pada dokumen Planning.

---

## 1. Ringkasan

Penjadwalan menjawab pertanyaan "unit mana sedang melakukan apa, pada tanggal berapa". Setiap unit pada setiap hari bisa berada dalam tiga keadaan:

| Status | Artinya | Warna di jadwal |
|---|---|---|
| **Work order** | Unit dipakai untuk pekerjaan (WO) pada rentang tanggal tertentu | Biru |
| **Standby** | Unit siaga, belum atau tidak sedang bekerja | Kuning |
| **Maintenance** | Unit sedang dirawat atau diperbaiki | Merah muda |

Hari tanpa satu pun status dihitung sebagai **hari kosong**. Satu unit boleh punya lebih dari satu status di hari yang sama (misalnya dua work order, atau WO dan maintenance), dan semuanya ditampilkan.

Fitur ini terdiri dari:
- **Jadwal unit** (halaman Beranda): tampilan batang (Gantt) per unit per hari, hanya untuk melihat.
- **Work Order**: daftar, buat, ubah, dan hapus.
- **Maintenance**: daftar dan buat.
- **Standby**: daftar (digabung per rentang) dan buat.

---

## 2. Aturan bisnis

### 2.1 Satu baris per unit per hari (maintenance dan standby)

Maintenance dan standby disimpan **satu baris per unit per hari**, dengan kombinasi unit dan tanggal yang unik. Saat membuat rentang (misalnya 3 sampai 7 November), sistem membuat satu baris untuk setiap hari. Rentang maksimal **31 hari** sekali buat.

### 2.2 Aturan bentrok

| Yang dibuat | Tidak boleh pada hari yang sudah ada | Perlakuan jika bentrok |
|---|---|---|
| **Maintenance** | Work order, maintenance | Ditolak (`409`), tidak ada yang disimpan |
| **Standby** | Work order, maintenance, standby | Ditolak (`409`), tidak ada yang disimpan |
| **Work order** | (tidak ada pemblokiran) | Tetap tersimpan, tetapi muncul **peringatan** kalau tumpang tindih dengan maintenance atau standby |

Catatan:
- Pembuatan maintenance dan standby bersifat **semua-atau-tidak-sama-sekali**. Kalau satu saja hari dalam rentang bentrok, seluruh rentang ditolak, dan pesan kesalahan menyebut tanggal serta nomor WO yang bentrok.
- Work order sengaja tidak memblokir tumpang tindih, mengikuti v1 (di data v1 ada unit yang punya beberapa WO di hari yang sama).
- Di jadwal, WO yang tumpang tindih dengan maintenance ditandai titik merah ("bentrok").

### 2.3 Work order

- **Nomor WO** dibuat otomatis dengan format `WOyy-mmdd-NNN` (contoh `WO26-1108-001`), dari tabel `rental.id_daily_counter` yang sama dengan v1, sehingga nomor tidak bertabrakan dan tidak dipakai ulang.
- **Operator** wajib dipilih dari karyawan aktif dengan jabatan operator (`hr.employee`).
- **Tipe unit** (`unit_type`) tidak diisi manual: otomatis mengikuti unit yang dipilih.
- **Tanggal selesai** boleh dikosongkan, artinya WO hanya satu hari (selesai sama dengan mulai). Tanggal selesai tidak boleh sebelum tanggal mulai. Rentang tanggal bersifat **inklusif** (hari mulai dan hari selesai ikut dihitung).
- **Tipe work order** (`rc_type`) diambil dari daftar di `rental.unit_price_default` (saat ini Contract, Mass Concrete, Retail). Nilai awal untuk waktu, volume, dan pipa ikut terisi otomatis dari tabel yang sama sesuai tipe unit, tetapi tetap bisa diubah.
- **Hapus** ditolak kalau WO sudah dipakai di timesheet, timesheet valuation, atau buffer timesheet.
- Setiap buat, ubah, dan hapus WO dicatat di audit log, lengkap dengan data sebelum dan sesudah.

### 2.4 Siapa yang membuat (jejak pembuat)

| Kolom | Isi | Catatan |
|---|---|---|
| `work_order.operator` | `employee_id` operator | Dasar baru, bisa dihubungkan ke karyawan |
| `work_order.user` | Nama operator | Dipertahankan agar v1 dan pencocokan timesheet tetap jalan |
| `created_by` (WO, maintenance, standby) | `user_id` akun yang membuat | Diisi otomatis dari sesi login, tidak dari form |

Data lama dari v1 atau bot memiliki `created_by` kosong, dan itu normal.

---

## 3. Halaman dan menu

### 3.1 Struktur menu

Menu utama (sidebar) memiliki bagian **Penjadwalan** dengan tab di header: **Work Order**, **Maintenance**, dan **Standby**. Menu dibangun dari satu sumber, [web/src/menu.ts](../web/src/menu.ts). Aturannya:

- Tab hanya tampil kalau user punya salah satu izin terkait (lihat bagian 4).
- User yang **hanya boleh membuat** (tanpa izin lihat) langsung diarahkan ke form buat. User yang boleh melihat diarahkan ke daftar.
- Bagian yang belum tersedia (Work Order, Timesheet, Rent Contract, Timesheet Valuation di menu utama) tampil abu-abu dengan label "Segera".

### 3.2 Daftar rute

| Alamat | Halaman | Izin yang dibutuhkan |
|---|---|---|
| `/` (Beranda) | **Jadwal unit** (Gantt). Tanpa izin `schedule:view`, tampil halaman sambutan | `schedule:view` |
| `/schedule` | Dialihkan ke `/` (parameter `?from=&to=` ikut dibawa) | - |
| `/schedule/work-order` | Daftar Work Order | `work_order:view` |
| `/schedule/work-order/new` | Buat Work Order | `work_order:create` |
| `/schedule/work-order/:id/edit` | Ubah Work Order (tombol hapus ada di sini) | `work_order:edit` |
| `/schedule/maintenance` | Daftar Maintenance | `maintenance:view` |
| `/schedule/maintenance/new` | Buat Maintenance | `maintenance:create` |
| `/schedule/standby` | Daftar Standby (per rentang) | `standby:view` |
| `/schedule/standby/new` | Buat Standby | `standby:create` |

Tanpa izin yang sesuai, halaman menampilkan "Tidak ada akses". Pengecekan yang sebenarnya dilakukan di server pada setiap endpoint, sedangkan menu dan tombol yang disembunyikan di web hanya soal kenyamanan.

---

## 4. Halaman Jadwal unit (Beranda)

Kode: [web/src/pages/Schedule.tsx](../web/src/pages/Schedule.tsx), data dari `GET /api/schedule`.

### 4.1 Cara membaca

- **Baris** adalah unit, dikelompokkan per **tipe unit**. Judul grup bisa diklik untuk melipat atau membuka, dan menampilkan jumlah unit serta jumlah hari kosong di grup itu.
- **Kolom** adalah hari, dari tanggal "Dari" sampai "Sampai". Hari ini diberi garis biru di header, dan akhir pekan diberi latar sedikit berbeda.
- **Batang** adalah satu status yang berlangsung beberapa hari, menerus sepanjang rentangnya. Label work order berbentuk `Tipe : Lokasi` (contoh `Contract : Proyek PT. Wijaya Karya, Tbk`). Teks lokasi yang di database berupa KAPITAL ditampilkan dengan huruf besar-kecil biasa, dengan singkatan seperti PT, PP, KSO tetap kapital (daftar singkatan di [web/src/text.ts](../web/src/text.ts)). Data di database tidak diubah.
- Tanda **‹** di awal atau **›** di akhir label berarti WO itu mulai sebelum atau selesai sesudah rentang yang sedang ditampilkan.
- Batang yang tumpang tindih ditata ke baris berbeda di dalam unit yang sama.
- **Titik merah** pada batang menandai bentrok (work order dan maintenance di hari yang sama).
- **Klik batang** membuka popup detail di dekat batang (panel di bawah pada layar kecil): tipe, lokasi, nomor WO, kontrak, dan periode lengkap untuk WO; keterangan dan tanggal untuk maintenance; tanggal untuk standby. Popup ditutup dengan Escape, klik di luar, atau tombol ×.
- **Header tabel dan kolom unit tetap terlihat** saat tabel digulir.

### 4.2 Rentang tanggal

- Bawaan: **Senin sampai Minggu** pekan ini.
- Pilih sendiri dengan isian **Dari** dan **Sampai**. Rentang **maksimal 7 hari**. Kalau lebih, tanggal "Sampai" disesuaikan otomatis dengan catatan. Tanggal "Sampai" sebelum "Dari" ditolak.
- Mengubah "Dari" mempertahankan panjang rentang.
- Tombol panah (‹ ›) menggeser sepanjang rentang yang sedang dipakai. Tombol **Minggu ini** kembali ke bawaan.
- Rentang tersimpan di alamat (`/?from=2026-11-02&to=2026-11-08`), sehingga bisa dibagikan.

### 4.3 Filter dan ringkasan

- **Cari unit**: mencocokkan ID unit (contoh `K-33`).
- **Filter tipe unit**: dropdown dengan jumlah unit per tipe di sampingnya.
- **Unit nonaktif**: bawaannya disembunyikan; centang untuk menampilkannya (tampil redup). Jumlah per tipe ikut berubah.
- **Kartu ringkasan**: jumlah hari-unit untuk Work order, Standby, Maintenance, dan Hari kosong, mengikuti filter yang aktif. Di bawah tabel ada legenda dan jumlah hari-unit yang bentrok.

### 4.4 Yang tidak ditampilkan

- Work order yang tidak punya `unit_id` tidak muncul (tidak punya baris unit).
- Work order tanpa tanggal selesai dianggap berlangsung satu hari.
- Jadwal ini **hanya untuk melihat**. Belum ada pengubahan langsung dari tabel.

---

## 5. Halaman daftar dan form

### 5.1 Work Order

**Daftar** (`/schedule/work-order`), kode [WorkOrderList.tsx](../web/src/pages/records/WorkOrderList.tsx):
- Filter: pencarian (nomor WO, lokasi, RC id, catatan), ID unit, operator, tipe work order, dan satu tanggal (menampilkan WO yang periodenya mencakup tanggal itu).
- Filter disimpan di alamat, sehingga hasil pencarian tetap ada saat kembali dari halaman edit dan bisa dibagikan.
- Kolom: Timestamp, WO Id, Start / Finish date, Unit, Operator, Tipe, Location, dan Status. Kolom **Status belum berisi data** (disiapkan untuk nanti).
- Urutan: tanggal mulai terbaru dulu, dengan baris judul per tanggal mulai. Paginasi 25 baris per halaman; jumlah total dan tombol halaman ada di bilah bawah yang selalu terlihat.
- Pengguna yang boleh mengubah melihat tautan edit pada nomor WO; yang hanya boleh melihat melihat jumlah total bertanda "(hanya lihat)".

**Form buat dan ubah**, kode [WorkOrderForm.tsx](../web/src/pages/records/WorkOrderForm.tsx):

| Isian | Aturan |
|---|---|
| Operator | Wajib; dropdown yang bisa dicari |
| Tipe Work Order | Wajib; dari `unit_price_default` |
| Unit | Wajib; unit aktif; dropdown yang bisa dicari |
| Unit type | Otomatis dari unit (hanya baca) |
| RC id | Opsional; kontrak sewa yang ada |
| Location | Wajib, maksimal 500 karakter |
| Tanggal mulai / selesai | Mulai wajib; selesai opsional |
| Qty | 0 sampai 999, bawaan 1 |
| Time | Opsional, bilangan bulat |
| Volume | Opsional |
| Pipe | Opsional |
| Remarks | Opsional, maksimal 2000 karakter |

- Setelah simpan, muncul nomor WO, peringatan bentrok (kalau ada), dan tautan **Lihat di jadwal**.
- **Ubah**: nomor WO, pembuat, dan waktu pembuatan tidak berubah. Nilai lama yang tidak diganti tidak divalidasi ulang, jadi WO lama boleh tetap memakai unit atau operator yang sudah nonaktif.
- **Hapus**: tombol Hapus di halaman ubah, **hanya tampil untuk yang punya izin `work_order:delete`**. Klik Hapus memunculkan konfirmasi "Hapus {nomor}? Tidak bisa dibatalkan." dengan tombol **Ya, hapus** dan **Batal**. Ditolak oleh server kalau WO sudah dipakai di timesheet, timesheet valuation, atau buffer timesheet. Halaman ubah juga punya tautan "Kembali ke daftar".

### 5.2 Maintenance

- **Daftar** ([DayRecordList.tsx](../web/src/pages/records/DayRecordList.tsx)): satu baris per unit per hari, dikelompokkan per tanggal dengan baris judul hari. Kolom: **Dibuat** (waktu, dengan nama pembuat di bawahnya), **Unit** (dengan tipe di bawahnya), **Tanggal**, dan **Keterangan**. Filter: pencarian keterangan, ID unit, dan tanggal. Paginasi 25 baris per halaman.
- **Buat** ([DayRecordForm.tsx](../web/src/pages/records/DayRecordForm.tsx)): unit, tanggal mulai, tanggal selesai (opsional, maksimal 31 hari), dan keterangan (opsional).

### 5.3 Standby

- **Daftar** ([StandbyList.tsx](../web/src/pages/records/StandbyList.tsx)): hari berurutan untuk satu unit **digabung menjadi satu rentang**. Kolom: **Unit**, **Periode**, **Lama** (jumlah hari), **Status**, dan **Dibuat**. Status dihitung dari tanggal hari ini: **Akan datang**, **Berlangsung**, atau **Selesai**. Penggabungan dilakukan sebelum filter pencarian (nama pembuat), ID unit, dan tanggal, jadi satu rentang tidak terpotong oleh filter. Rentang yang dibuat beberapa orang hanya menampilkan satu nama pembuat. Bilah bawah menampilkan jumlah rentang standby.
- **Buat**: unit, tanggal mulai, dan tanggal selesai (opsional, maksimal 31 hari). Tidak ada keterangan.

---

## 6. Hak akses

Izin berbentuk `fitur:aksi`. Dicek di server per permintaan. Aturannya: izin dari peran, ditambah `allow` khusus user, dikurangi `deny` khusus user. **`deny` selalu menang**, dan izin yang tidak tercatat berarti ditolak. Tanda `*` berarti semua izin (dipegang Superadmin).

| Izin | Kegunaan |
|---|---|
| `schedule:view` | Melihat jadwal unit (Beranda) |
| `work_order:view` / `create` / `edit` / `delete` | Daftar, buat, ubah, dan hapus work order |
| `maintenance:view` / `create` | Daftar dan buat maintenance |
| `standby:view` / `create` | Daftar dan buat standby |
| `schedule:edit`, `schedule:export` | Sudah terdaftar, belum dipakai oleh halaman mana pun |
| `access:manage` | Sudah terdaftar, halaman pengaturan akses belum ada |

Izin dan pengecualian disimpan di schema `access` (`permission`, `role_permission`, `user_permission`, `audit_log`). Saat ini pembagian peran selain Superadmin belum diisi, dan pengaturan akses dilakukan lewat database. Detail desain ada di dokumen Planning (poin 8).

---

## 7. Data di database

| Tabel | Dipakai untuk | Catatan |
|---|---|---|
| `rental.unit` | Daftar unit, tipe, dan status aktif | Unit nonaktif disembunyikan secara bawaan |
| `rental.work_order` | Work order | Kunci `wo_id`; `unit_id`, `rc_id`, `created_by`, `operator` berupa foreign key |
| `rental.maintenance` | Maintenance harian | Unik per `(unit_id, date)` |
| `rental.standby_log` | Standby harian | Unik per `(unit_id, date)` |
| `rental.id_daily_counter` | Nomor harian WO | Sama dengan v1 |
| `rental.unit_price_default` | Daftar tipe WO dan nilai awal form | Pencocokan tipe unit tidak peka huruf besar-kecil |
| `rental.rent_contract` | Kontrak yang bisa dihubungkan ke WO | 200 terbaru ditawarkan di form |
| `hr.employee` | Daftar operator | Jabatan operator, aktif |
| `hr.users` | Akun login dan pembuat data | Acuan `created_by` |
| `access.*` | Izin dan catatan perubahan | Dibuat lewat migrasi v2 |

Migrasi terkait ada di [server/migrations](../server/migrations) (setiap migrasi punya skrip pembatalan `.rollback.sql`). Semuanya hanya **menambah** (kolom atau tabel baru), tidak mengubah atau menghapus yang dipakai v1.

---

## 8. API ringkas

Detail lengkap (validasi, kode error, bentuk respons) ada di [Aturan-Endpoint.md](Aturan-Endpoint.md).

| Metode dan alamat | Izin | Fungsi |
|---|---|---|
| `GET /api/schedule` | `schedule:view` | Jadwal untuk rentang maksimal 7 hari |
| `GET /api/form-options` | salah satu izin buat | Unit, kontrak, operator, tipe WO, nilai awal |
| `GET /api/work-orders` | `work_order:view` | Daftar WO dengan filter |
| `GET /api/work-orders/:id` | `work_order:view` | Satu WO |
| `POST /api/work-orders` | `work_order:create` | Buat WO |
| `PUT /api/work-orders/:id` | `work_order:edit` | Ubah WO |
| `DELETE /api/work-orders/:id` | `work_order:delete` | Hapus WO |
| `GET /api/maintenance` | `maintenance:view` | Daftar maintenance |
| `POST /api/maintenance` | `maintenance:create` | Buat maintenance (rentang) |
| `GET /api/standby` | `standby:view` | Daftar standby harian |
| `GET /api/standby/ranges` | `standby:view` | Daftar standby digabung per rentang |
| `POST /api/standby` | `standby:create` | Buat standby (rentang) |

---

## 9. Contoh alur

**Menjadwalkan unit untuk proyek.** Buka Penjadwalan, Work Order, lalu **Buat work order**. Pilih operator, tipe, unit, isi lokasi dan tanggal. Setelah simpan, klik **Lihat di jadwal** untuk melihat batang biru unit itu. Kalau ada peringatan bentrok dengan maintenance, atur ulang tanggalnya.

**Mencatat unit yang sedang diperbaiki.** Penjadwalan, Maintenance, **Buat maintenance**. Pilih unit dan rentang tanggal, isi keterangan. Kalau salah satu hari sudah memiliki WO, sistem menolak dan menyebut tanggal serta nomor WO-nya. Perbaiki rentangnya atau ubah WO tersebut dulu.

**Mencari tahu siapa memegang unit pada suatu hari.** Di Beranda, atur rentang tanggal, cari unit atau pilih tipenya, lalu klik batang untuk melihat lokasi dan periodenya. Atau di Daftar Work Order, isi filter tanggal dan unit.

---

## 10. Batasan dan yang belum ada

- Jadwal unit hanya untuk melihat; belum ada pengubahan atau geser jadwal langsung (`schedule:edit`).
- Maintenance dan standby belum bisa dilihat detailnya, diubah, atau dihapus dari web (hanya daftar dan buat).
- Laporan periode per tipe unit dan unduh CSV (ada di v1) belum dibuat (`schedule:export`).
- Halaman pengaturan akses untuk Superadmin belum ada, dan peran selain Superadmin belum dibagi.
- Aturan "hanya boleh mengubah WO miliknya" belum ada; izin ubah dan hapus berlaku untuk semua WO.
- WO lama dan WO dari v1 memiliki `created_by` kosong.
- Semua migrasi baru di staging; database live belum diubah.

---

## 11. Berkas kode terkait

| Bagian | Berkas |
|---|---|
| Endpoint jadwal | [server/src/schedule.ts](../server/src/schedule.ts) |
| Endpoint WO, maintenance, standby | [server/src/records.ts](../server/src/records.ts) |
| Pengecekan izin | [server/src/access.ts](../server/src/access.ts) |
| Menu dan tab | [web/src/menu.ts](../web/src/menu.ts), [web/src/Layout.tsx](../web/src/Layout.tsx) |
| Rute | [web/src/App.tsx](../web/src/App.tsx) |
| Halaman jadwal | [web/src/pages/Schedule.tsx](../web/src/pages/Schedule.tsx) |
| Daftar dan form | [web/src/pages/records/](../web/src/pages/records) |
| Dropdown yang bisa dicari | [web/src/components/Dropdown.tsx](../web/src/components/Dropdown.tsx) |
| Format teks lokasi | [web/src/text.ts](../web/src/text.ts) |

## 12. Mencoba di komputer sendiri

Dari akar repo (lihat README untuk persiapan pertama kali), jalankan `npm run dev`, lalu buka http://localhost:5173 dan login. Data yang tampil adalah data staging.
