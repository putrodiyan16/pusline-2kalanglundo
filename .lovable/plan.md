
# Rencana: Membuat Aplikasi Kompatibel dengan GitHub Pages

## Konteks Penting (harap dibaca)

GitHub Pages **hanya bisa menyajikan file statis** (HTML, CSS, JS, gambar). Tidak ada server Node.js, tidak ada Cloudflare Worker, tidak ada server function. Aplikasi Anda saat ini dibangun di atas **TanStack Start (SSR + server functions)** yang membutuhkan runtime server. Jadi untuk bisa jalan di GitHub Pages, kita harus mengubah arsitektur menjadi **Single Page Application (SPA) murni di browser**.

Kabar baiknya: semua fitur (login guru/siswa, katalog buku, peminjaman, manajemen) **tetap bisa jalan** karena Lovable Cloud (Supabase) sudah punya REST API + Auth yang dipanggil langsung dari browser. RLS yang sudah kita pasang akan menjaga keamanan.

## Yang Akan Diubah

### 1. Routing: TanStack Start → TanStack Router SPA
- Hapus mode SSR (`shellComponent`, `HeadContent`, `Scripts` di `__root.tsx`).
- Ganti entry point ke `index.html` + `src/main.tsx` standar Vite.
- File routing di `src/routes/*` tetap dipakai (TanStack Router file-based routing jalan di SPA juga).
- Buat custom 404 di GitHub Pages yang redirect ke `index.html` (trik standar SPA di GH Pages) supaya deep link seperti `/dashboard` tidak error 404.

### 2. Hapus Semua Kode Server
- Tidak ada `createServerFn` di codebase saat ini (semua query Supabase sudah dipanggil dari client) — bagus, tidak perlu migrasi data layer.
- Hapus file: `src/server.ts`, `src/start.ts`, `src/integrations/supabase/auth-middleware.ts`, `src/integrations/supabase/auth-attacher.ts`, `src/integrations/supabase/client.server.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `wrangler.jsonc`.
- Sisakan hanya `src/integrations/supabase/client.ts` (client browser) — ini yang dipakai semua halaman.

### 3. Konfigurasi Vite
- Ganti `vite.config.ts` ke konfigurasi Vite + React + Tailwind standar (tanpa plugin TanStack Start / Cloudflare).
- Set `base: '/nama-repo/'` agar asset (JS/CSS/gambar) bisa di-load dari URL `username.github.io/nama-repo/`.
- Tambah `bun add -D gh-pages` dan script `"deploy": "vite build && gh-pages -d dist"` di `package.json`.

### 4. Environment Variables
- `.env` di mesin Anda tetap pakai `VITE_SUPABASE_URL` & `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Untuk GitHub Pages: nilai-nilai ini di-*bundle* ke JS saat build (aman karena kunci publishable memang untuk publik; RLS yang menjaga data).
- Tambahkan workflow `.github/workflows/deploy.yml` yang membaca env dari **GitHub Actions Secrets** saat build.

### 5. Auth Redirect URL
- Setelah deploy, perlu **menambahkan URL GitHub Pages ke daftar Redirect URL di Lovable Cloud Auth settings** agar login email berhasil. Saya akan beri instruksi setelah deploy.

## Yang TIDAK Berubah
- Semua tabel database, RLS policies, trigger.
- Komponen UI, halaman, design system (Akademik Klasik).
- Logika peminjaman, manajemen buku/siswa, dashboard.

## Konsekuensi yang Perlu Anda Tahu
1. **SEO lebih lemah** — tidak ada SSR, jadi crawler hanya lihat HTML kosong dulu (untuk app internal sekolah biasanya tidak masalah).
2. **Tidak ada `process.env` server** — semua secret yang sensitif (service role key) tidak bisa dipakai di sisi browser. Saat ini Anda tidak menggunakannya, jadi aman.
3. **Pengaturan repo GitHub**: repo harus public (atau pakai GitHub Pro untuk private + Pages), dan Anda harus mengaktifkan Pages di Settings → Pages → source: GitHub Actions.

## Langkah Eksekusi (saat Anda klik Implement)
1. Tulis ulang `vite.config.ts`, hapus file server/wrangler.
2. Tulis ulang `src/routes/__root.tsx` (hapus SSR shell).
3. Buat `index.html` + `src/main.tsx` baru sebagai entry SPA.
4. Update `package.json` (script build, deploy, dependency `gh-pages`).
5. Buat `.github/workflows/deploy.yml`.
6. Buat `public/404.html` (SPA fallback).
7. Buat `README-DEPLOY.md` berisi langkah deploy + cara set GitHub Secrets + cara isi Auth Redirect URL.

## Yang Perlu Saya Konfirmasi Sebelum Mulai

**Nama repository GitHub Anda** sangat menentukan `base` path di Vite. Contoh: jika repo `perpustakaan-sekolah`, maka URL jadi `username.github.io/perpustakaan-sekolah/` dan `base: '/perpustakaan-sekolah/'`.

Silakan beri tahu **nama repo GitHub** yang akan dipakai, atau konfirmasi jika Anda mau pakai custom domain (base = `/`).
