# Handoff: Kingslock

Dokumen serah-terima. Semua keputusan produk disepakati Owner lewat sesi tanya jawab (2026-11-20). **Status: v1 sudah diimplementasikan** — lihat §11 untuk peta kode, cara menjalankan, dan hal yang masih terbuka.

Baca dulu, berurutan:
1. `GLOSSARY.md`: bahasa domain. Pakai istilahnya persis (Credential, bukan "akun"; Platform, bukan "situs"; Owner, bukan "user").
2. `docs/adr/`: keputusan yang sulit dibalik. Jangan "perbaiki" tanpa membaca alasannya.
3. Dokumen ini: spesifikasi teknis + urutan kerja.

---

## 1. Ringkasan produk

Password manager pribadi untuk **satu Owner**. Dashboard berisi kartu Platform (Instagram, Gmail, ...); tiap Platform berisi banyak Credential yang ditampilkan dalam tabel:

| EMAIL / USERNAME | PASSWORD | CREATED AT | ACTION |
|---|---|---|---|
| daffa@gmail.com | •••••••• | 2026-11-20 | View · Edit · Delete |

Login = email + Master Password + Kode 2FA (TOTP). Aksi sensitif (View, Edit, Delete, Export) meminta Kode 2FA lagi (Verifikasi Ulang), dengan Grace Window 2 menit.

**Stack:** React + Vite, Supabase (Auth, Postgres, RLS), Tailwind CSS, shadcn/ui. Hosting frontend: Cloudflare Pages. UI berbahasa **Inggris**.

## 2. Model ancaman (kenapa desainnya begini)

| Ancaman | Mitigasi |
|---|---|
| Database / backup Supabase bocor | Zero-knowledge: semua konten terenkripsi di browser (ADR-0001) |
| service_role key / akses dashboard Supabase bocor | Sama; server tidak pernah memegang kunci atau Master Password (ADR-0004) |
| Laptop ditinggal dalam keadaan login | Verifikasi Ulang + Grace Window 2 menit (ADR-0002), auto-lock idle |
| Penyerang mem-bypass UI via DevTools | Aturan ditegakkan di RLS / RPC, bukan di React |
| Password lemah ditebak offline setelah DB bocor | Argon2id + Master Password minimal 14 karakter & zxcvbn ≥ 3 |
| XSS / dependency jahat mencuri kunci dari memori | CSP ketat, tanpa script pihak ketiga, dependency minimal & di-pin |
| Penyerang menukar ciphertext antar baris | AES-GCM dengan AAD terikat id baris |
| HP authenticator hilang | Wajib ≥ 2 Perangkat 2FA (ADR-0003) |
| Supabase project ter-pause/terhapus | Export Vault terenkripsi |

**Di luar cakupan:** malware/keylogger di perangkat Owner, Owner kehilangan Master Password (data hilang, disengaja), kehilangan kedua Perangkat 2FA.

## 3. Desain kriptografi

Semua operasi memakai **WebCrypto** (`crypto.subtle`), kecuali Argon2id (`hash-wasm`). Tidak ada kripto buatan sendiri.

### 3.1 Penurunan kunci (ADR-0004, ADR-0006)

```
salt        = SHA-256("password-vault/salt/v1:" + lowercase(trim(email)))[0..16]
master      = Argon2id(MasterPassword, salt, m=64 MiB, t=3, p=1, len=32)
authKey     = HKDF-SHA256(master, info="password-vault/auth/v1") → 32 byte → hex (64 char)
encKey      = HKDF-SHA256(master, info="password-vault/enc/v1")  → AES-KW 256, non-extractable
```

- `authKey` (hex) adalah "password" yang dikirim ke Supabase Auth. Master Password mentah **tidak pernah** dikirim ke mana pun.
- `encKey` tidak pernah meninggalkan memori browser.
- Parameter KDF diberi versi (`kdf_version = 1`) supaya bisa dinaikkan nanti.
- Salt diturunkan dari email karena salt harus diketahui **sebelum** login (lihat ADR-0006). Konsekuensi: mengganti email = alur yang sama dengan mengganti Master Password.

### 3.2 Vault Key & key wrapping

- Saat setup: `vaultKey = generateKey(AES-GCM 256, extractable: true)` → `wrapKey("raw", vaultKey, encKey, "AES-KW")` → simpan `wrapped_vault_key` di DB → buang versi extractable.
- Saat login: `unwrapKey(..., extractable: false)` → `vaultKey` hidup di memori (state React / module closure) sampai Terkunci.
- Saat ganti Master Password: unwrap ulang dengan `extractable: true` sementara, wrap dengan `encKey` baru, update `authKey` di Supabase, lalu `signOut({ scope: "others" })`.

### 3.3 Format ciphertext

```
blob = base64( version(1 byte = 0x01) || iv(12 byte acak) || AES-GCM ciphertext+tag )
AAD  = "<tabel>:<id baris>:v1"     // contoh "credential_secrets:5f1c...:v1"
```

- IV **selalu** baru tiap enkripsi (`crypto.getRandomValues`).
- AAD wajib: mencegah penyerang dengan akses tulis DB menukar password Credential A ke Credential B.
- Plaintext tiap blob = JSON:
  - `platforms.enc_data` → `{ name, url? }`
  - `credentials.enc_summary` → `{ login }` (Identitas Login)
  - `credential_secrets.enc_secret` → `{ password, notes?, previousPassword? }`

### 3.4 Modul

Satu modul murni `src/crypto/` tanpa dependensi React, diuji dengan Vitest (test vector + round-trip + tamper test: ubah 1 byte → dekripsi harus gagal; tukar AAD → gagal).

## 4. Supabase

### 4.1 Konfigurasi project

- Auth → MFA TOTP **enabled** (default aktif).
- Setelah setup Owner selesai: **matikan "Allow new users to sign up"**.
- Email confirmation: biarkan aktif (default). Alur setup harus menangani langkah konfirmasi email.
- Jangan pakai fitur reset password / magic link Supabase (merusak ADR-0004).
- supabase-js: `createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: true } })`. Sesi hanya di memori, sehingga refresh halaman = Terkunci otomatis.

### 4.2 Skema

```sql
-- Profil Vault: satu baris, satu Owner
create table public.vault_profile (
  owner_id           uuid primary key references auth.users on delete cascade,
  kdf_version        smallint not null default 1,
  wrapped_vault_key  text not null,               -- base64
  auto_lock_minutes  smallint not null default 5 check (auto_lock_minutes in (1,5,15)),
  created_at         timestamptz not null default now()
);

create table public.platforms (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  enc_data    text not null,                       -- {name, url?}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.credentials (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users on delete cascade,
  platform_id  uuid not null references public.platforms on delete restrict,  -- Platform berisi Credential tidak bisa dihapus
  enc_summary  text not null,                      -- {login}
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.credential_secrets (
  credential_id uuid primary key references public.credentials on delete cascade,
  owner_id      uuid not null references auth.users on delete cascade,
  enc_secret    text not null,                     -- {password, notes?, previousPassword?}
  updated_at    timestamptz not null default now()
);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null references auth.users on delete cascade,
  event       text not null,   -- 'credential.create' | 'credential.reveal' | 'credential.update' | 'credential.delete' | 'platform.create' | 'platform.delete' | 'vault.export' | 'vault.import' | 'master_password.change' | ...
  target_id   uuid,            -- id Credential/Platform; BUKAN nama (nama terenkripsi)
  user_agent  text,
  created_at  timestamptz not null default now()
);
```

Catatan: id baris dibuat **di client** (`crypto.randomUUID()`) sebelum insert, karena AAD butuh id saat enkripsi.

### 4.3 Single-owner guard

Kolom `vault_profile.singleton boolean unique check (singleton)` menjamin hanya ada satu baris, dan `create_vault_profile` menolak dengan `VAULT_EXISTS`. Semua akses lain mensyaratkan pemanggil punya `vault_profile`, sehingga user kedua yang lolos signup tetap tidak bisa apa-apa.

### 4.4 Fungsi kesegaran 2FA (ADR-0002)

```sql
create schema if not exists private;

create function private.is_aal2() returns boolean language sql stable as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
$$;

create function private.totp_fresh(max_age_seconds int default 120) returns boolean language sql stable as $$
  select coalesce(
    (select max((e->>'timestamp')::bigint)
       from jsonb_array_elements(auth.jwt()->'amr') e
      where e->>'method' = 'totp'), 0
  ) >= extract(epoch from now())::bigint - max_age_seconds
$$;
```

⚠️ **Wajib diverifikasi di spike (§7)**: apakah memanggil `mfa.challenge` + `mfa.verify` lagi saat sudah aal2 benar-benar menerbitkan JWT baru dengan timestamp `totp` yang diperbarui. **Fallback** kalau tidak: fungsi `security definer` yang membaca `auth.mfa_challenges.verified_at` terbaru untuk faktor milik `auth.uid()`.

### 4.5 Akses tabel & RPC (sesuai implementasi)

Client **hanya boleh SELECT** — dibatasi RLS ke `owner_id = auth.uid()` + aal2 + Owner punya `vault_profile`. Tidak ada policy INSERT/UPDATE/DELETE sama sekali; semua tulis lewat RPC `security definer` yang memanggil `private.require_owner(fresh)` (ADR-0002).

| Tabel | SELECT oleh client |
|---|---|
| vault_profile | ✓ (baris sendiri, aal2) |
| platforms / credentials / activity_log | ✓ (aal2 + Owner) |
| credential_secrets | **✗ tidak ada grant & policy** (ADR-0005) |

| RPC | Syarat | Log |
|---|---|---|
| `vault_initialized()` | anon | – |
| `create_vault_profile(wrapped, kdf)` | aal2 + ≥ 2 Perangkat 2FA terverifikasi + belum ada Vault | vault.create |
| `create_platform`, `create_credential` | aal2 | ✓ |
| `update_credential`, `delete_credential`, `delete_platform` | aal2 + Grace Window | ✓ |
| `reveal_secret(id)`, `export_vault()` | aal2 + Grace Window | ✓ |
| `change_wrapped_vault_key`, `update_vault_settings` | aal2 + Grace Window | ✓ |
| `log_client_event(event)` | aal2; whitelist `auth.login`, `vault.import`, `2fa.add`, `2fa.remove` | ✓ |

Kode error stabil: `NOT_AUTHENTICATED`, `MFA_REQUIRED`, `NO_VAULT`, `STEP_UP_REQUIRED`, `NEED_TWO_2FA_DEVICES`, `VAULT_EXISTS`, `PLATFORM_NOT_EMPTY`, `NOT_FOUND`, `MIN_TWO_2FA_DEVICES`, `INVALID_EVENT`.

Migrasi kedua memasang trigger `before delete` pada `auth.mfa_factors` yang menolak `unenroll` jika sisa Perangkat 2FA terverifikasi < 2 (setelah Vault ada).

## 5. Alur aplikasi

### 5.1 Setup (hanya jika belum ada Owner)
1. Owner mengisi email + Master Password (min 14 karakter, zxcvbn ≥ 3, konfirmasi ulang). Tampilkan peringatan tegas: *lupa Master Password = data hilang permanen*.
2. Turunkan `authKey`/`encKey` → `signUp(email, authKey)` → konfirmasi email → `signInWithPassword(email, authKey)`.
3. Daftarkan **Perangkat 2FA #1** (`mfa.enroll` → QR → `challenge` + `verify`) → sesi naik ke aal2.
4. Daftarkan **Perangkat 2FA #2** (wajib, tidak bisa di-skip). Anjurkan simpan QR/secret cadangan offline.
5. Buat Vault Key → wrap → insert `vault_profile`.
6. Tampilkan instruksi: matikan signup di dashboard Supabase.

### 5.2 Login
email + Master Password → derive → `signInWithPassword(email, authKey)` → layar Kode 2FA → `challenge` + `verify` (aal2) → ambil `vault_profile` → unwrap Vault Key → dashboard.

### 5.3 Terkunci
Dipicu oleh: tombol Lock/Logout, idle `auto_lock_minutes` (tanpa mouse/keyboard/touch), refresh, atau tutup tab. Aksi: buang Vault Key & semua plaintext dari state → `signOut()` → layar login. Tidak ada layar "unlock" parsial.

### 5.4 Verifikasi Ulang
Komponen `StepUpDialog`: sebelum View/Edit/Delete/Export, jika verifikasi terakhir > 2 menit, minta Kode 2FA → `challenge` + `verify` → lanjutkan aksi. Client hanya menebak kesegaran demi UX; **otoritasnya tetap RLS/RPC**. Jika server menolak karena kedaluwarsa, tampilkan dialog lagi.

### 5.5 Dashboard & Credential
- Dashboard: grid kartu Platform (nama + jumlah Credential), pencarian di client setelah dekripsi, tombol **+ Add Credential**.
- Add Credential: field Platform dengan saran Platform yang sudah ada (case-insensitive, di client); Platform baru dibuat otomatis. Field Identitas Login (teks bebas, label "Email / Username"), password (+ tombol **Generate**: default 20 karakter, huruf besar/kecil, angka, simbol, `crypto.getRandomValues`, tanpa bias modulo), catatan opsional.
- Duplikat (Platform + Identitas Login sama): boleh, tampilkan peringatan.
- Halaman Platform: tabel EMAIL / USERNAME | PASSWORD (••••) | CREATED AT | ACTION.
- **View**: Verifikasi Ulang → `reveal_secret` → dekripsi → masked, tombol Reveal (auto-hide 30 detik) dan Copy (clipboard dikosongkan setelah 30 detik, best effort; hanya kosongkan jika isinya masih sama).
- **Edit**: Verifikasi Ulang → bisa ubah Platform (memindah Credential), Identitas Login, password, catatan. Jika password berubah, password lama disimpan sebagai `previousPassword` (hanya satu, menimpa yang lama).
- **Delete**: Verifikasi Ulang → dialog konfirmasi → hapus permanen (secret ikut cascade).
- Hapus Platform: hanya jika kosong (FK `restrict`); tampilkan pesan yang jelas jika ditolak.

### 5.6 Settings
- **Change Master Password**: Master Password lama + Kode 2FA → rewrap Vault Key → update password Supabase (`authKey` baru) → logout sesi lain.
- **2FA Devices**: tambah (perlu Kode 2FA dari perangkat terdaftar); hapus (perlu Kode 2FA dari perangkat **lain**; tolak jika sisa < 2).
- **Export Vault**: Verifikasi Ulang → `export_vault()` → unduh JSON `{ format_version, kdf_version, salt, wrapped_vault_key, platforms[], credentials[], secrets[] }`, semuanya tetap ciphertext.
- **Import Vault**: unggah file → minta Master Password file tersebut → validasi dengan unwrap → insert (id dipertahankan karena terikat AAD).
- **Activity Log**: daftar kejadian; nama Platform/Identitas Login didekripsi di client dengan mencocokkan `target_id`.
- **Auto-lock**: 1 / 5 / 15 menit (default 5). Grace Window tetap 2 menit dan tidak bisa diubah.

## 6. Aturan proyek (wajib)

- Tidak ada script pihak ketiga: tanpa analytics, tanpa widget, font di-bundle (bukan Google Fonts CDN).
- Tidak pernah `dangerouslySetInnerHTML` (pasang lint rule `react/no-danger`).
- Plaintext Credential tidak pernah masuk `localStorage`/`sessionStorage`/IndexedDB, `console.log`, URL, atau pesan error.
- Dependency minimal, versi di-pin, lockfile di-commit.
- Cloudflare Pages `public/_headers`:
  ```
  /*
    Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src https://<PROJECT>.supabase.co wss://<PROJECT>.supabase.co; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
    Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
    Permissions-Policy: camera=(), microphone=(), geolocation=()
  ```
  `'wasm-unsafe-eval'` dibutuhkan Argon2 WASM; `style-src 'unsafe-inline'` kemungkinan dibutuhkan Radix/shadcn (cek, hapus jika tidak perlu).

## 7. Urutan kerja

Kerjakan per irisan vertikal; tiap langkah harus bisa dites sebelum lanjut.

0. **Spike** (dijalankan 2026-11-20 di Supabase lokal, `supabase/tests/e2e-spike.mjs`):
   - [x] Step-up memperbarui timestamp `totp` di `amr` → pendekatan utama valid, fallback tidak diperlukan.
   - [x] Kode 2FA yang sama **diterima dua kali** oleh Supabase → risiko sisa, lihat §11.
   - [x] `auth.audit_log_entries` tidak dipakai; login dicatat lewat `log_client_event('auth.login')`. Login **gagal** tidak tercatat.
   - [ ] Waktu Argon2id di HP kelas menengah — belum diukur (di laptop < 1 detik).
1. **Scaffold**: Vite + React + TypeScript, Tailwind, shadcn/ui, supabase-js, `hash-wasm`, `@zxcvbn-ts/core`, Vitest, ESLint (`react/no-danger`).
2. **`src/crypto/`** + unit test (§3.4).
3. **Migrasi SQL**: tabel, guard single-owner, fungsi `private.*`, RLS, RPC, trigger log. Tes RLS (pgTAP atau skrip SQL): lihat checklist §8.
4. **Setup flow** (§5.1).
5. **Login + Terkunci + idle auto-lock** (§5.2–5.3).
6. **Dashboard, Platform, Add Credential, generator** (§5.5).
7. **Verifikasi Ulang + View/Edit/Delete** (§5.4–5.5).
8. **Settings** (§5.6).
9. **Deploy**: Cloudflare Pages + `_headers`, matikan signup, cek header dengan securityheaders.com.

## 8. Checklist penerimaan keamanan

- [ ] Dump seluruh DB: tidak ada satu pun nama Platform, Identitas Login, password, atau catatan dalam plaintext.
- [ ] Master Password mentah tidak pernah muncul di network tab (hanya `authKey` hex).
- [ ] `select * from credential_secrets` dengan JWT Owner aal2 → 0 baris (hanya bisa lewat RPC).
- [ ] Update/delete Credential dengan JWT aal1, atau aal2 tanpa Verifikasi Ulang < 2 menit → ditolak oleh DB.
- [ ] `reveal_secret` dan `export_vault` selalu menambah baris `activity_log`; `activity_log` tidak bisa di-update/delete dari client.
- [ ] Signup user kedua → tidak bisa membuat `vault_profile`.
- [ ] Mengubah 1 byte ciphertext atau memindah ciphertext ke baris lain → dekripsi gagal dengan pesan aman.
- [ ] Refresh halaman → kembali ke login; tidak ada sesi/kunci tersisa di storage.
- [ ] Menghapus Perangkat 2FA saat hanya tersisa 2 → ditolak.
- [ ] Response header produksi sesuai §6.

## 9. Keputusan teknis tambahan (dikonfirmasi Owner 2026-11-20)

1. **Salt dari email** (ADR-0006, *proposed*): salt harus diketahui sebelum login, dan untuk satu Owner cara ini menghindari endpoint publik "prelogin" yang membocorkan keberadaan akun.
2. **Rahasia hanya lewat RPC** (ADR-0005, *proposed*): agar setiap "lihat password" pasti tercatat di Log Aktivitas.
3. **TypeScript**, bukan JavaScript murni: kode kripto dan bentuk data terenkripsi terlalu mudah salah tanpa tipe.
4. **Platform kosong tidak dihapus otomatis** setelah Credential terakhirnya dipindah/dihapus; Owner menghapusnya manual.
5. **Email confirmation Supabase tetap aktif.**

## 11. Status implementasi (2026-11-20)

### Peta kode

| Path | Isi |
|---|---|
| `src/crypto/` | KDF, key wrapping, AES-GCM+AAD, generator — murni, tanpa React; `crypto.test.ts` |
| `src/vault/api.ts` | Semua akses Supabase (hanya ciphertext keluar), export/import |
| `src/session/SessionProvider.tsx` | State machine login/setup/lock, Vault Key di ref, idle auto-lock |
| `src/components/StepUpProvider.tsx` | `withStepUp()` — dialog Verifikasi Ulang + retry saat `STEP_UP_REQUIRED` |
| `src/features/auth/*` | Setup, Sign in, verifikasi 2FA, pendaftaran perangkat |
| `src/features/vault/*` | Dashboard, halaman Platform (tabel), form & dialog Credential |
| `src/features/settings/*` | Perangkat 2FA, ganti Master Password, export/import, auto-lock, Log Aktivitas |
| `supabase/migrations/` | Skema, RLS, RPC, trigger dua perangkat |
| `supabase/tests/` | `run.sh` + `rls_test.sql` (Postgres + stub auth), `e2e-spike.mjs` (Supabase asli) |
| `public/_headers` | CSP & header keamanan Cloudflare Pages |

### Sudah diverifikasi
- Unit test kripto (12): round-trip, salah password, tamper 1 byte, pindah ciphertext antar baris/tabel, generator.
- Tes keamanan SQL (38 asersi) di Postgres 17 + skema `auth` stub.
- E2E di Supabase lokal asli: semua cek di skrip lulus, termasuk Grace Window kedaluwarsa → `STEP_UP_REQUIRED` → step-up → berhasil lagi; trigger dua perangkat; `updateUser` dengan `authKey` hex.
- Uji manual di browser: setup 3 langkah, Add/View/Edit (Password Sebelumnya), dialog Verifikasi Ulang setelah 2 menit, Lock → login ulang, refresh = terkunci, tidak ada data aplikasi di storage, DB hanya berisi ciphertext.
- Checklist §8: semua butir terpenuhi kecuali header produksi (belum deploy).

### Masih terbuka / risiko sisa
1. **TOTP replay**: Supabase menerima kode yang sama dipakai ulang dalam jendelanya. Penyerang yang sudah tahu Master Password *dan* melihat kode Anda bisa memakainya dalam ±30–90 detik. Tidak bisa diperbaiki dari sisi aplikasi tanpa memverifikasi TOTP sendiri.
2. **Ganti Master Password tidak atomik** (Auth password lalu wrapped key). Ada rollback, tetapi jika rollback juga gagal (mis. koneksi putus tepat di tengah), Vault bisa tidak terbuka. **Export Vault sebelum mengganti Master Password.**
3. Pesan error saat trigger dua perangkat menolak `unenroll` dari GoTrue generik ("Unexpected failure"); UI sudah mencegah kasus ini.
4. Login gagal tidak tercatat di Log Aktivitas.
5. Bundle utama ~715 KB (radix + supabase + hash-wasm); zxcvbn di-lazy-load.
6. Warning oxlint `only-export-components` / `set-state-in-effect` (non-blocking).

## 10. Referensi

- `GLOSSARY.md` (istilah domain)
- `docs/adr/0001` zero-knowledge · `0002` Verifikasi Ulang ditegakkan di database · `0003` dua Perangkat 2FA · `0004` satu password → dua kunci + key wrapping · `0005` rahasia hanya via RPC · `0006` salt dari email
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- OWASP Password Storage (parameter Argon2id): https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
