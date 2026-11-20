# Kingslock

Password manager pribadi untuk **satu orang**, yang Anda host sendiri di atas Supabase.

Semua isi Vault (nama Platform, email/username, password, catatan) **dienkripsi di browser** sebelum dikirim ke server. Supabase hanya menyimpan ciphertext. Kalau database, backup, atau akses dashboard Supabase bocor, tidak ada satu password pun yang bisa dibaca (zero-knowledge).

Login memerlukan **Master Password + Kode 2FA (TOTP)**. Setiap aksi sensitif (lihat, ubah, hapus, export) meminta Kode 2FA lagi, dan aturan ini ditegakkan di database, bukan hanya di UI.

> **Penting:** Master Password **tidak bisa di-reset**. Kalau lupa, isi Vault hilang permanen. Ini disengaja: server memang tidak pernah memegang kunci Anda.

---

## Daftar isi

- [Fitur](#fitur)
- [Cara kerja keamanan](#cara-kerja-keamanan)
- [Tech stack](#tech-stack)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Deploy ke Cloudflare Pages](#deploy-ke-cloudflare-pages)
- [Pengujian](#pengujian)
- [Struktur proyek](#struktur-proyek)
- [Batasan yang diketahui](#batasan-yang-diketahui)
- [Dokumentasi lanjutan](#dokumentasi-lanjutan)

---

## Fitur

### Vault
- **Dashboard Platform**: kartu per layanan (Gmail, Instagram, dll.) beserta jumlah akun di dalamnya, dilengkapi pencarian.
- **Credential**: simpan Email/Username, password, dan catatan opsional. Satu Platform bisa berisi banyak Credential.
- **Generator password**: default 20 karakter (huruf besar/kecil, angka, simbol) dari `crypto.getRandomValues` tanpa bias modulo.
- **View / Edit / Delete**: password ditampilkan tersamar (••••). Tombol *Reveal* menyembunyikan otomatis setelah 30 detik, dan *Copy* mengosongkan clipboard setelah 30 detik.
- **Password Sebelumnya**: saat password diubah, satu password lama disimpan otomatis untuk berjaga-jaga kalau salah ketik.
- **Pindah Platform**: Credential bisa dipindah ke Platform lain lewat Edit.
- **Peringatan duplikat** untuk Platform + Identitas Login yang sama.

### Keamanan
- **Enkripsi zero-knowledge** di browser: Argon2id → HKDF → AES-KW (key wrapping) → AES-GCM 256 dengan AAD yang terikat ke id baris.
- **2FA TOTP wajib** dengan minimal **dua Perangkat 2FA** sebagai jalur pemulihan (pengganti recovery codes).
- **Verifikasi Ulang**: aksi sensitif meminta Kode 2FA lagi, dengan *Grace Window* 2 menit. Aturan ini ditegakkan oleh RLS/RPC di Postgres.
- **Auto-lock** saat idle (1 / 5 / 15 menit). Refresh atau tutup tab langsung mengunci Vault.
- **Tidak ada data di storage browser**: sesi dan kunci hanya disimpan di memori.
- **Log Aktivitas** yang hanya bisa bertambah: login, lihat password, ubah, hapus, export/import, perubahan 2FA.
- **Single-owner**: database menolak pembuatan Vault kedua.
- **CSP ketat**, tanpa script pihak ketiga, analytics, atau CDN (font di-bundle).

### Settings
- **2FA Devices**: tambah perangkat (perlu kode dari perangkat terdaftar), hapus perangkat (perlu kode dari perangkat *lain*, minimal 2 harus tersisa).
- **Change Master Password**: Vault Key di-*rewrap*, lalu sesi lain dikeluarkan.
- **Export Vault**: unduh file JSON yang tetap terenkripsi, untuk cadangan.
- **Import Vault**: pulihkan dari file export dengan Master Password file tersebut.
- **Auto-lock** dan **Activity Log**.

---

## Cara kerja keamanan

```
Master Password ──Argon2id(salt dari email)──► master key
                                                │
                     ┌──────── HKDF ────────────┴──────── HKDF ────────┐
                     ▼                                                  ▼
                 authKey (hex)                                    encKey (AES-KW)
       dikirim ke Supabase Auth sebagai "password"          hanya ada di memori browser
                                                                        │
                                                          unwrap  Vault Key (AES-GCM 256)
                                                                        │
                                              enkripsi/dekripsi semua isi Vault di browser
```

- Master Password mentah **tidak pernah** dikirim ke mana pun; Supabase hanya menerima `authKey`.
- Client hanya boleh `SELECT` (dibatasi RLS). Semua operasi tulis berjalan lewat RPC `security definer` yang mengecek level sesi `aal2` dan kesegaran Kode 2FA.
- Tabel `credential_secrets` tidak bisa dibaca langsung. Password hanya bisa diambil lewat RPC `reveal_secret`, yang selalu tercatat di Log Aktivitas.

Detail lengkap ada di [`docs/adr/`](docs/adr) dan [`HANDOFF.md`](HANDOFF.md).

---

## Tech stack

| Bagian | Teknologi |
|---|---|
| Frontend | React 19, Vite, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui (Radix), lucide-react, sonner |
| Backend | Supabase (Auth + MFA TOTP, Postgres, Row Level Security, RPC) |
| Kriptografi | WebCrypto (HKDF, AES-KW, AES-GCM), `hash-wasm` (Argon2id) |
| Kekuatan password | `@zxcvbn-ts` |
| Test & lint | Vitest, oxlint |
| Hosting | Cloudflare Pages (atau static host lain) |

---

## Prasyarat

- **Node.js 22+** dan npm
- Akun **[Supabase](https://supabase.com)** (paket gratis cukup)
- Aplikasi authenticator di **dua perangkat** (Google Authenticator, Aegis, 1Password, Bitwarden Authenticator, dll.)
- *(Opsional, untuk test)* **Docker** dan **Supabase CLI**

---

## Instalasi

### 1. Clone & install dependency

```bash
git clone https://github.com/mazc0de/kingslock.git
cd kingslock
npm install
```

### 2. Siapkan project Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, lalu jalankan dua file ini **berurutan**:
   1. `supabase/migrations/20261120000001_init.sql`: tabel, RLS, RPC, Log Aktivitas.
   2. `supabase/migrations/20261120000002_min_two_2fa_devices.sql`: trigger "minimal dua Perangkat 2FA". Lewati file ini kalau project Anda menolak trigger di skema `auth`; aturannya tetap berlaku, tetapi hanya di UI.
3. **Authentication → Sign In / Providers → Email**:
   - Kosongkan **Password requirements**. Yang dikirim ke Supabase adalah `authKey` hex 64 karakter, bukan Master Password Anda.
   - Email confirmation boleh aktif.
4. **Authentication → URL Configuration**: isi **Site URL** dan **Redirect URLs** dengan URL aplikasi, misalnya `http://localhost:4343` untuk lokal dan domain produksi Anda.
5. **Authentication → Multi-Factor**: pastikan **TOTP** aktif (default-nya sudah aktif).
6. **Jangan** pakai fitur reset password atau magic link, karena keduanya merusak model keamanan.

### 3. Isi environment variable

```bash
cp .env.example .env.local
```

Isi `.env.local` dengan nilai dari **Project Settings → API Keys**:

```env
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

> Gunakan **publishable / anon key**. Jangan pernah memasukkan `sb_secret_...` atau `service_role` key.

### 4. Jalankan

```bash
npm run dev
```

Buka **http://localhost:4343**, lalu:

1. Klik **Create your Vault**, isi email dan Master Password (minimal 14 karakter dan harus cukup kuat).
2. Konfirmasi email kalau diminta.
3. Daftarkan **dua** Perangkat 2FA dengan memindai QR di dua aplikasi authenticator yang berbeda.
4. Vault terbuka dan siap dipakai.

### 5. Tutup pendaftaran

Setelah Vault dibuat, buka **Authentication → Sign In / Providers** dan **matikan "Allow new users to sign up"**. Database memang sudah menolak Vault kedua, tetapi signup yang terbuka tetap tidak perlu.

---

## Deploy ke Cloudflare Pages

| Pengaturan | Nilai |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Sebelum deploy, edit `public/_headers` dan ganti `<PROJECT_REF>` dengan project ref Supabase Anda (dipakai di CSP `connect-src`). Setelah deploy:

- Tambahkan domain produksi ke **Site URL / Redirect URLs** di Supabase.
- Cek header keamanan di [securityheaders.com](https://securityheaders.com).

Static host lain juga bisa dipakai, asalkan header di `public/_headers` dipasang dengan cara yang setara.

---

## Pengujian

```bash
npm test           # unit test modul kripto (Vitest)
npm run lint       # oxlint
npm run test:sql   # migrasi + tes keamanan RLS/RPC di Postgres sementara (butuh Docker)
npm run test:e2e   # tes end-to-end ke Supabase lokal (jalankan `npx supabase start` dulu)
```

---

## Struktur proyek

```
src/
  crypto/              KDF, key wrapping, AES-GCM + AAD, generator (murni, tanpa React)
  vault/api.ts         Semua akses Supabase; hanya ciphertext yang keluar
  session/             State login/setup/lock, Vault Key di memori, auto-lock
  components/          StepUpProvider (Verifikasi Ulang), komponen UI
  features/auth/       Setup, sign in, verifikasi & pendaftaran 2FA
  features/vault/      Dashboard, halaman Platform, form Credential
  features/settings/   2FA devices, ganti Master Password, export/import, auto-lock, log
supabase/
  migrations/          Skema, RLS, RPC, trigger dua perangkat
  tests/               Tes SQL (Docker) dan e2e
docs/adr/              Catatan keputusan arsitektur
public/_headers        CSP & header keamanan
```

---

## Batasan yang diketahui

- **Satu Owner saja**: aplikasi ini tidak dirancang untuk multi-user atau berbagi Vault.
- **Lupa Master Password = data hilang.** Kehilangan **kedua** Perangkat 2FA juga berarti tidak bisa login.
- **TOTP replay**: Supabase menerima kode yang sama lebih dari sekali selama masa berlakunya.
- **Ganti Master Password tidak atomik.** Ada rollback, tetapi tetap **lakukan Export Vault sebelum mengganti Master Password**.
- Login yang gagal tidak tercatat di Log Aktivitas.
- Tidak melindungi dari malware atau keylogger di perangkat Anda sendiri.

---

## Dokumentasi lanjutan

- [`GLOSSARY.md`](GLOSSARY.md): istilah domain (Owner, Vault, Credential, Verifikasi Ulang, dll.)
- [`docs/adr/`](docs/adr): alasan di balik keputusan arsitektur
- [`HANDOFF.md`](HANDOFF.md): spesifikasi teknis lengkap, model ancaman, dan status implementasi

## Aturan kontribusi

- Tanpa script pihak ketiga, analytics, atau CDN.
- Dilarang `dangerouslySetInnerHTML` dan `console.*` (dicek oxlint).
- Plaintext Vault tidak boleh masuk storage browser, URL, log, atau pesan error.
- Versi dependency di-pin dan lockfile di-commit.
