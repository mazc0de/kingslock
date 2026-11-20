# Verifikasi Ulang 2FA ditegakkan di database, bukan UI

Aksi sensitif (lihat password, edit, hapus, export, ganti Master Password, ubah pengaturan) memerlukan Kode 2FA yang diverifikasi oleh Supabase Auth MFA dalam Grace Window 2 menit terakhir. Pengecekan dilakukan di database dengan membaca timestamp `totp` dari klaim `amr` di JWT, sehingga tidak bisa di-bypass dengan memanipulasi React lewat DevTools.

Implementasinya: client hanya punya hak SELECT pada tabel (dibatasi RLS ke Owner + aal2); semua operasi tulis berjalan lewat fungsi `security definer` yang memanggil `private.require_owner(p_require_fresh)`. Policy RLS INSERT/UPDATE/DELETE sengaja tidak ada — `UPDATE` yang ditolak RLS hanya menghasilkan "0 baris" tanpa error, sementara RPC memberi kode error eksplisit (`STEP_UP_REQUIRED`) dan bisa menulis Log Aktivitas secara atomik.

## Considered Options

- Wajib Kode 2FA di setiap aksi tanpa grace window: ditolak, kode TOTP yang sama tidak bisa dipakai ulang dalam 30 detik sehingga aksi beruntun memaksa Owner menunggu.
- Policy RLS per operasi tulis: ditolak, kegagalan diam-diam (0 baris) dan logging tidak atomik.
- Cek di client saja: ditolak, tidak memberi perlindungan nyata.
