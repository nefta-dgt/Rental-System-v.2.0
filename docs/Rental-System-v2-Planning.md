# Rental System v2.0 — catatan perencanaan

Ditulis 2026-11-07 dari percakapan perencanaan di project v1 (`~/Desktop/Project-Adams/n8n-dashboard-sheet`).
Tujuan file ini: supaya sesi baru di project v2 bisa langsung nyambung. Baca file ini dulu sebelum mulai.

## Tujuan v2
- Sistem baru memakai **React** dan **sistem login**.
- Fitur pertama: **merombak ulang "Unit Schedule"** (v1: `public/unit_schedule.html`, `public/unit_schedule_report.html`).
- Dikembangkan fitur demi fitur, tiap fitur di branch sendiri.

## Keadaan v1 (yang ada sekarang)
- Backend: Node.js + Express 5, PostgreSQL lewat `pg` mentah (tanpa ORM), Socket.io, Multer, dotenv. File: `index.js`, `routes/api.js`, `routes/dashboard.js`, `config/db.js`.
- Frontend: HTML biasa per halaman di `public/`, Tailwind lewat CDN, JS di dalam file HTML + `public/js/` (sidebar.js, nice-alert.js). Tanpa React, tanpa build.
- Bot WhatsApp: `wa/whatsapptosql.js`, proses Node terpisah, kirim ke webhook n8n.
- Database: PostgreSQL, search_path `rental`. Ada schema lain (`finance`, `hr`). `hr.users` dipakai tabel lain sebagai acuan user_id (kandidat dasar login).
- Live: http://187.77.125.130:3000. Deploy lewat Coolify, **push ke `main` v1 otomatis redeploy live**.
- Staging lokal: DB `company_staging` (PostgreSQL 18, port 5433), dijalankan dengan `npm run staging` (branch `staging-runner` di repo v1, belum di-merge). `.env.staging` hanya ada di laptop, tidak masuk git.

## Keputusan yang sudah diambil
- v2 dibuat sebagai **repo terpisah** (rekomendasi: `rental-system-v2`, Private). Alasan: v2 sistem baru yang berumur panjang, branch panjang di repo v1 akan makin menjauh dari `main` v1 dan konfliknya besar; deploy v2 harus terpisah dari Coolify v1.
- Alur git: branch per fitur, merge ke `main` lewat PR. Direct ke `main` hanya untuk perbaikan kecil.
- Jangan `git add -A`; pakai `git add <nama file>`.
- Jangan salin `.env` / `.env.staging` ke git; pastikan `.gitignore` mengabaikannya sejak commit pertama.

## Rekomendasi tech stack (belum final)
Backend:
- Node.js + Express (atau Fastify) + TypeScript
- PostgreSQL
- Akses DB: **Drizzle** direkomendasikan (struktur tabel bertipe, migrasi otomatis); alternatif tetap `pg` mentah seperti v1. **Belum diputuskan.** Hindari Prisma kalau skema DB lama dipakai ulang.
- Login: sesi lewat cookie httpOnly, password di-hash (argon2/bcrypt), tabel user bisa mulai dari `hr.users`, siapkan peran (admin, operator, finance) dari awal.
- Validasi input: Zod

Frontend:
- React + Vite + TypeScript, Tailwind CSS, TanStack Query, React Router
- Tabel jadwal unit x hari: bangun sendiri (TanStack Table + virtualisasi), bukan library kalender (FullCalendar resource timeline berbayar).

Struktur repo yang disarankan: satu repo, dua folder `server/` dan `web/`; backend menyajikan hasil build frontend, jadi di Coolify satu aplikasi.
Tidak disarankan sekarang: Next.js / framework full-stack, mikroservis.

## Keputusan yang MASIH TERBUKA
1. **Database:** v2 memakai DB yang sama dengan v1 live, atau skema baru? Kalau sama: migrasi v2 hanya boleh menambah (tabel/kolom baru), jangan hapus atau ubah yang dipakai v1 (insiden 2026-11-02: migrasi yang menghapus kolom merusak kode live lama). Kembangkan di staging dulu.
2. **Backend:** pakai ulang logika/endpoint v1 (Work Order, Rent Contract, Standby) atau tulis baru?
3. **Drizzle atau `pg` mentah.**
4. **Kapan v1 dimatikan** dan bagaimana perbaikan di v1 selama masa transisi.
5. **Sidebar/navigasi** v2: dibuat ulang atau link balik ke v1.
6. **Fitur Unit Schedule yang wajib ada:** daftar belum dicatat. Di v1 ada Search unit, tabel per-hari, laporan periode per tipe unit dengan CSV, sinkron dengan Standby Log dan Work Order. Perlu ditanyakan: apa masalah utama versi sekarang (tampilan, kecepatan, cara pakai)?
7. **Timeline:** akan dibicarakan user (belum ada).
8. **Akses per fitur (otorisasi):** tiap fitur punya level akses terpisah. Contoh: jadwal unit bisa **dilihat umum**, tapi **mengubah jadwal** hanya untuk user tertentu. Perlu diputuskan:
   - Level akses per fitur: lihat saja, ubah, atau admin. Atau cukup lihat/ubah.
   - Penyimpanan: kembangkan `hr.role_permissions` (kini hanya daftar `sections` per peran) atau buat tabel izin baru (fitur + aksi + peran). Ingat aturan migrasi: hanya menambah.
   - Pengecualian per user: pakai ulang `hr.users.allowed_sections_override`, atau skema baru yang bisa membedakan lihat dan ubah.
   - Penegakan: wajib dicek di **server** pada tiap endpoint, tidak cukup menyembunyikan tombol di web.
   - Daftar fitur dan siapa yang boleh mengubah masing-masing (belum dicatat).

   **Status 2026-11-08 (branch `feature/access-control`):** pola dipilih = peran + izin + pengecualian per user, dengan kolom `scope` disiapkan untuk aturan berbasis data nanti. Schema baru `access` dibuat di **staging saja** (`server/migrations/2026-11-08_create_access_schema.sql`, pembatalan: `.rollback.sql`): `permission`, `role_permission`, `user_permission`, `audit_log`. Hanya menambah, `hr.*` tidak diubah. Izin berbentuk `fitur:aksi`; deny selalu menang; tidak tercatat = ditolak; `*` = semua izin. Dicek di server per permintaan (`server/src/access.ts`). Data awal: katalog izin jadwal dan `access:manage`, serta Superadmin = `*`.
   - **Belum:** pembagian peran (menunggu aturan), halaman pengaturan akses khusus Superadmin, penulisan `audit_log` (tabel sudah ada), endpoint ubah jadwal (`schedule:edit`), dan migrasi ke DB live (belum dijalankan di live).
   - **Halaman create (branch `feature/create-pages`, bertumpu pada `feature/access-control`):** sidebar dengan submenu Jadwal Unit (Work Order, Maintenance, Standby), masing-masing form pembuatan data. Izin baru `work_order:create`, `maintenance:create`, `standby:create` (migrasi `2026-11-08_add_create_permissions.sql`, staging saja). Aturan mengikuti v1: maintenance dan standby satu baris per unit per hari dan tidak boleh bentrok dengan WO (standby juga tidak dengan maintenance), diisi per rentang maksimal 31 hari secara semua-atau-tidak-sama-sekali; WO tidak memblokir tumpang tindih, hanya memberi peringatan. Nomor WO memakai `rental.id_daily_counter` yang sama dengan v1. Setiap pembuatan dicatat di `access.audit_log`. **Belum:** ubah dan hapus data, dan halaman daftar/tabel per jenis.
   - **Pembuat WO (branch `work_order`):** kolom `rental.work_order.user` hanya berisi nama operator/kru (di v1: 66 nama, semuanya karyawan, tidak ada yang cocok dengan akun `hr.users`). Ditambah kolom `created_by` (uuid, boleh null, FK ke `hr.users.user_id`) lewat `server/migrations/2026-11-08_work_order_created_by.sql` (staging saja; checksum 1662 WO lama tidak berubah). Diisi untuk WO yang dibuat lewat v2; WO lama dan WO dari v1/bot tetap kosong, jadi aturan "hanya boleh mengubah WO miliknya" baru berlaku untuk WO baru.
   - **Catatan data:** `hr.users` tidak terhubung ke `hr.employee` dengan ID, dan `work_order.user` berisi nama operator (bukan akun login), jadi aturan "data milik sendiri" butuh pemetaan dulu.
9. **Penyimpanan sesi login:** sementara sesi disimpan di **memori server** (keputusan 2026-11-08, untuk pengembangan di staging). Konsekuensi: semua user logout tiap server restart/redeploy. **Wajib pindah ke tabel sesi di DB sebelum v2 dipakai user sungguhan di live.**

## Langkah menyiapkan project v2
1. Buat repo kosong di GitHub (tanpa README/.gitignore). `gh` belum ter-install, pakai browser.
2. Buat folder project (di luar folder v1), misalnya `~/Desktop/Project-Adams/rental-system-v2`.
3. `git init`, `git remote add origin ...`, commit pertama (README + .gitignore), push ke `main`.
4. Scaffold React (Vite) dan server, tiap fitur di branch sendiri.
Folder dengan nama "Rental System v.2.0" di Desktop ini hanya tempat catatan, belum repo.

## Hal terbuka dari v1 (jangan lupa)
- Branch `staging-runner` dan `gitignore-ds-store` di repo v1 sudah di-push tapi belum di-merge (opsional).
- Migrasi `finance_expenses_request` (SQL + rollback) dan `docs/` (skema DB) dipindahkan ke `~/Desktop/n8n-parkir`. Belum diverifikasi apakah tabel `finance.expenses_request` sudah ada di DB staging atau live.
- Smoke test live v1 belum tercatat selesai: ID `WO26-mmdd-001`/`RC26-mmdd-001`, Operational Expenses Rent Contract, Standby Log, Unit Activity, Operator Payout, Unit Schedule Search unit.
- 5 branch lama di repo v1 sudah ter-merge dan aman dihapus.
- 754 dari 913 hari standby belum punya link timesheet (opsional).
- **Hapus kolom `rental.work_order.user` di live (rencana user, belum dijalankan; dicek 2026-11-09):** `employee_id` operator sudah dipindah ke kolom `operator` (uuid, FK ke `hr.employee`), terisi 1480/1480 baris di live dan semuanya cocok dengan `full_name` di `user`, jadi `user` kini duplikat. Menghapusnya mengubah DB live dan tidak bisa dibatalkan. Sebelum dihapus: pastikan v1, n8n, laporan, dan view/fungsi DB tidak lagi memakai `user`; backup tabel; jalankan lewat file migrasi + rollback, staging dulu. Kolom `created_by` juga belum ada di live (hanya di staging).
- **Migrasi `created_by` ke live ditunda (keputusan user, 2026-11-09):** `server/migrations/2026-11-08_work_order_created_by.sql` (+ rollback) belum dijalankan di live. Aman ditunda: kolom nullable tanpa default, insert dari v1 tidak terpengaruh, tidak ada view/trigger di `rental.work_order`; satu-satunya beda skema live vs staging adalah `created_by` + FK-nya. Yang tertahan: fitur v2 yang menulis `created_by` dan aturan "hanya ubah WO miliknya" di live (v2 ke live juga masih menunggu migrasi izin `*:create` dan sesi login di DB). Saat menjalankan: backup dulu, saat sepi, dan jangan bersamaan dengan hapus kolom `user`. Belum dicek: kode v1 yang mungkin bergantung pada urutan kolom (`SELECT *` / `INSERT` tanpa daftar kolom).

## Catatan kecil
- **Singkatan yang tetap kapital** (PT, CV, KM, RT, RW, dll.) ada di `web/src/text.ts`, konstanta `ACRONYMS`. Dipakai fungsi `properCase()` yang mengubah teks KAPITAL jadi huruf besar-kecil biasa (jadwal; Operator dan Location di Daftar Work Order). Kalau ada kata yang salah (mis. "Rt", "Cv"), tambahkan kata itu dengan huruf besar ke daftar. Perubahan kode, jadi web perlu di-build ulang dan dipasang. Data di database tidak diubah.
- **Migrasi `created_by` untuk maintenance dan standby (2026-11-10):** `server/migrations/2026-11-10_day_records_created_by.sql` (+ rollback) menambah kolom `created_by` (uuid, nullable, FK ke `hr.users`) ke `rental.maintenance` dan `rental.standby_log`. Baru dijalankan di staging; **belum di live**. Sama seperti `work_order.created_by`: nullable tanpa default, insert dari v1 tidak terpengaruh; di staging tidak ada trigger, view, atau FK yang memakai kedua tabel ini (dicek 2026-11-10; belum dicek di live). Sampai dijalankan di live, endpoint buat dan daftar maintenance/standby v2 akan error di live. Jalankan bersama migrasi izin `maintenance:view`/`standby:view`.

## Open list: migrasi yang BELUM dijalankan di live (dicek 2026-11-10)
Semua migrasi di `server/migrations/` baru dijalankan di staging lokal (`company_staging`). Live (`company`) belum disentuh (keputusan user). Dicek read-only: skema `access` belum ada di live, jadi v2 belum bisa dipasang ke live sebelum migrasi ini dijalankan.

Urutan kalau nanti dijalankan (tiap file punya `.rollback.sql`; backup dulu, saat sepi, staging dulu):
1. `2026-11-08_create_access_schema.sql`: skema `access` (permission, role/user permission, audit log, sesi login). **Belum ada di live.**
2. `2026-11-08_add_create_permissions.sql`: izin `work_order:create`, `maintenance:create`, `standby:create`.
3. `2026-11-09_add_work_order_view_edit_delete_permissions.sql`: izin `work_order:view/edit/delete`.
4. `2026-11-10_add_maintenance_standby_view_permissions.sql`: izin `maintenance:view`, `standby:view`.
5. `2026-11-08_work_order_created_by.sql`: kolom `rental.work_order.created_by`.
6. `2026-11-10_day_records_created_by.sql`: kolom `created_by` di `rental.maintenance` dan `rental.standby_log` (live dicek: tanpa trigger, view, FK masuk, atau fungsi DB yang memakainya).
7. Belum dibuat: hapus kolom `rental.work_order.user` (lihat catatan di atas; tidak bisa dibatalkan, jangan bersamaan dengan langkah 5).

Catatan:
- Sebelum migrasi dijalankan, kode v2 yang dipasang ke live akan error (login, daftar, buat). Jalankan migrasi dulu, baru pasang kode.
- Setelah langkah 1 sampai 4, role selain Superadmin belum punya izin apa pun; isi `access.role_permission` dulu (pembagian peran belum diputuskan).
- Belum dicek: kode v1/n8n yang memakai `SELECT *` atau `INSERT` tanpa daftar kolom pada tabel yang ditambah kolom.
