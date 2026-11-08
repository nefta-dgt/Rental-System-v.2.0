# Rental System v2

Sistem rental baru: React + login.

## Menjalankan di komputer sendiri

Pertama kali (atau setelah clone), pasang dependensi untuk akar, `server/`, dan `web/`:

```bash
npm run install:all
```

Siapkan `server/.env` dengan menyalin `server/.env.example`, lalu isi nilainya (file ini tidak masuk git).

Jalankan server (port 3200) dan web (port 5173) sekaligus dari akar repo:

```bash
npm run dev
```

Lalu buka http://localhost:5173. Bisa juga dijalankan terpisah: `npm run dev` di dalam `server/` dan di dalam `web/`.

Catatan perencanaan ada di `docs/Rental-System-v2-Planning.md`.
