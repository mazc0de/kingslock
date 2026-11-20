# Satu Master Password diturunkan menjadi dua kunci di browser

Browser menjalankan Argon2id atas Master Password, lalu memecah hasilnya dengan HKDF menjadi `authKey` (dikirim ke Supabase Auth sebagai "password") dan `encKey` (tidak pernah meninggalkan browser). Owner cukup mengetik satu password, sementara Supabase tidak pernah menerima password mentah yang bisa dipakai untuk menurunkan kunci enkripsi.

## Consequences

Password yang tersimpan di Supabase Auth bukan Master Password, jadi fitur bawaan Supabase seperti "reset password" atau login langsung dari dashboard tidak akan bekerja dan tidak boleh dipakai.

## Considered Options

- Master Password langsung jadi password Supabase: ditolak, merusak zero-knowledge (ADR-0001).
- Dua password terpisah (login + master): aman, tetapi Owner harus mengetik dua password.

## Key wrapping

`encKey` tidak mengenkripsi Credential secara langsung; ia hanya membungkus Vault Key acak yang mengenkripsi seluruh isi Vault. Mengganti Master Password cukup membungkus ulang satu Vault Key, bukan mengenkripsi ulang semua Credential.
