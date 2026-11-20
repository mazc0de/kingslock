# Enkripsi zero-knowledge di sisi client

Isi Vault dienkripsi di browser dengan kunci yang diturunkan dari master password Owner; Supabase hanya menyimpan ciphertext. Kami memilih ini agar kebocoran database, service_role key, atau akses dashboard Supabase tidak membuka satu password pun.

## Consequences

Lupa master password = seluruh Vault hilang permanen. Tidak ada fitur reset yang bisa memulihkan data, dan ini disengaja; jangan "diperbaiki" dengan menyimpan kunci di server.

## Considered Options

- Enkripsi sisi server (Supabase Vault / Edge Function dengan kunci di env): bisa di-reset, tetapi siapa pun yang memegang kunci server bisa membaca semua data.
- Plaintext + RLS: ditolak, satu miskonfigurasi RLS membocorkan semuanya.
