---
status: accepted
---

# Rahasia Credential hanya bisa dibaca lewat RPC

Tabel `credential_secrets` sengaja tidak punya policy SELECT; password hanya bisa diambil lewat fungsi `reveal_secret` dan `export_vault` yang mengecek Verifikasi Ulang dan menulis Log Aktivitas. Postgres tidak punya trigger SELECT, jadi tanpa ini "lihat password" tidak bisa dicatat secara terjamin; jangan tambahkan policy SELECT "supaya lebih mudah".
