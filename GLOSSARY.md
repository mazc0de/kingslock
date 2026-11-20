# Kingslock

Aplikasi pribadi untuk menyimpan kredensial akun-akun milik satu orang di berbagai platform (Gmail, Instagram, Facebook, dll), dengan perlindungan 2FA di setiap aksi sensitif.

## Pengguna & Akses

**Owner**:
Satu-satunya orang yang memakai aplikasi ini dan memiliki Vault. Tidak ada pendaftaran publik.
_Avoid_: User, member, akun

**Vault**:
Seluruh koleksi Credential milik Owner, yang isinya hanya bisa dibaca oleh Owner.
_Avoid_: Brankas, database, dashboard

**Master Password**:
Satu-satunya password yang diketik Owner, dipakai sekaligus untuk login dan membuka Vault. Tidak bisa di-reset.
_Avoid_: Password login, PIN

**Vault Key**:
Kunci acak yang mengenkripsi seluruh isi Vault; ia sendiri hanya bisa dibuka dengan Master Password.
_Avoid_: Encryption key, master key

**Kode 2FA (TOTP)**:
Kode 6 digit dari aplikasi authenticator yang berganti tiap 30 detik, dipakai Owner untuk membuktikan identitas saat login dan verifikasi ulang.
_Avoid_: Google Auth, OTP, Google login

**Perangkat 2FA**:
Aplikasi authenticator yang terdaftar dan bisa menghasilkan Kode 2FA untuk Owner. Owner wajib punya minimal dua.
_Avoid_: Faktor, device

**Verifikasi Ulang**:
Permintaan Kode 2FA sebelum aksi sensitif (lihat password, edit, hapus) meskipun Owner sudah login.
_Avoid_: Re-auth, step-up, konfirmasi

**Terkunci**:
Keadaan ketika kunci Vault sudah dihapus dari memori. Terkunci selalu berarti Owner sudah logout dan harus login ulang lengkap.
_Avoid_: Locked screen, sleep

**Grace Window**:
Rentang waktu singkat setelah Verifikasi Ulang di mana aksi sensitif berikutnya tidak meminta Kode 2FA lagi.
_Avoid_: Sesi, timeout

## Isi Vault

**Platform**:
Layanan pihak ketiga tempat Owner memiliki akun, misalnya Instagram atau Gmail. Satu Platform bisa memiliki banyak Credential.
_Avoid_: Situs, site, aplikasi, akun

**Credential**:
Satu akun Owner di sebuah Platform: Identitas Login, password, dan catatan opsional. Vault tidak menyimpan rahasia 2FA milik Platform.
_Avoid_: Akun, entry, item, login

**Identitas Login**:
Apa pun yang dipakai untuk login di sebuah Platform: email, username, atau nomor HP.
_Avoid_: Email, username, user ID

**Password Sebelumnya**:
Satu password lama dari sebuah Credential yang disimpan otomatis saat password diubah, sebagai pengaman salah ketik.
_Avoid_: Riwayat, history, backup

## Keamanan & Pemulihan

**Log Aktivitas**:
Catatan kejadian penting (login, Verifikasi Ulang, lihat, ubah, hapus, export) yang hanya bisa bertambah dan tidak bisa diubah atau dihapus.
_Avoid_: Audit trail, history, riwayat

**Export Vault**:
File cadangan berisi seluruh Vault dalam keadaan tetap terenkripsi, hanya bisa dibuka dengan Master Password.
_Avoid_: Backup, dump, download
