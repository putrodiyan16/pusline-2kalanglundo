# Deploy ke GitHub Pages

Aplikasi ini punya **dua mode build**:

- **Lovable / dev biasa** — pakai TanStack Start (SSR). Tidak berubah.
- **GitHub Pages** — pakai Vite + TanStack Router SPA dengan **hash routing** (`/#/dashboard`). Output di folder `dist-gh/`.

Database, autentikasi, dan semua fitur tetap jalan karena Lovable Cloud (Supabase) dipanggil langsung dari browser.

---

## Cara Deploy (sekali setup)

### 1. Push kode ke GitHub
Hubungkan project Lovable Anda ke GitHub (tombol GitHub di Lovable → Connect project), atau buat repo manual lalu push.

### 2. Aktifkan GitHub Pages
Di repo GitHub → **Settings → Pages → Source: GitHub Actions**.

### 3. Tambahkan Secrets di GitHub
Di repo → **Settings → Secrets and variables → Actions → New repository secret**, tambahkan 3 secret berikut (ambil nilainya dari file `.env` di project Lovable):

| Nama secret | Nilai |
|---|---|
| `VITE_SUPABASE_URL` | isi dari `VITE_SUPABASE_URL` di `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | isi dari `VITE_SUPABASE_PUBLISHABLE_KEY` di `.env` |
| `VITE_SUPABASE_PROJECT_ID` | isi dari `VITE_SUPABASE_PROJECT_ID` di `.env` |

> Catatan: kunci ini adalah **publishable key**, aman dipakai di browser. Keamanan data dijaga oleh Row-Level Security di database.

### 4. Tambahkan URL GitHub Pages ke Auth Redirect
Setelah Pages aktif, Anda akan dapat URL seperti `https://<username>.github.io/<nama-repo>/`. Tambahkan URL itu ke **Lovable Cloud → Auth → Redirect URLs** supaya signup/login email berfungsi.

### 5. Push / Run Workflow
Workflow otomatis jalan setiap push ke branch `main`, atau bisa di-trigger manual di tab **Actions → Deploy to GitHub Pages → Run workflow**.

Selesai. Setiap perubahan yang Anda push ke `main` akan otomatis ter-deploy.

---

## Build lokal (opsional)

```bash
bun install
bun run build:gh
# hasil di ./dist-gh — bisa dibuka pakai server statis apa saja
npx serve dist-gh
```

---

## Kenapa pakai hash routing?
GitHub Pages tidak punya konfigurasi SPA fallback (rewrite semua path ke `index.html`). Tanpa hash, URL seperti `/dashboard` akan kena 404 saat di-refresh. Hash router (`/#/dashboard`) menghindari masalah ini sepenuhnya — semua routing terjadi di browser.

## Kenapa `base: './'`?
Asset path jadi relatif, jadi aplikasi jalan di repo dengan nama apa pun (`username.github.io/perpustakaan/`, `username.github.io/sekolah-x/`, dll) tanpa harus mengedit config.

## File yang dipakai khusus untuk build ini
- `index.html` (root) — entry HTML SPA
- `src/main.tsx` — entry React SPA dengan hash router
- `vite.gh.config.ts` — config Vite tanpa SSR
- `public/.nojekyll` — disable Jekyll processing di GitHub Pages
- `.github/workflows/deploy.yml` — auto-deploy

Semua file lain (route, komponen, hook, supabase client) **dipakai bersama** oleh kedua mode build.