# Dua Perangkat 2FA sebagai jalur pemulihan, bukan recovery codes

Owner wajib mendaftarkan minimal dua Perangkat 2FA saat setup. Supabase Auth MFA mendukung beberapa faktor TOTP secara native tetapi tidak menyediakan recovery codes, dan membangun recovery codes sendiri menambah kode keamanan kustom yang rawan bug.
