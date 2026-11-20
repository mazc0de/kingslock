---
status: accepted
---

# Salt KDF diturunkan dari email Owner

Salt untuk Argon2id = SHA-256 dari email ternormalisasi, karena salt harus diketahui sebelum login (untuk menurunkan `authKey`) dan tabel di belakang RLS belum bisa dibaca saat itu. Untuk satu Owner ini lebih baik daripada endpoint publik "prelogin" yang membocorkan keberadaan akun.

## Consequences

Mengganti email Owner harus melewati alur yang sama dengan mengganti Master Password (turunkan ulang kunci, wrap ulang Vault Key, update password Supabase).
