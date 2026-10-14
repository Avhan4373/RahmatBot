# 🛡️ Proteksi Kode & Lisensi

Dokumen ini menjelaskan cara melindungi kode RahmatBot sebelum di-deploy ke
server milik orang lain (mis. Pterodactyl), agar mereka **tidak mudah**
mencuri, memodifikasi, atau mengintip kode.

---

## ⚠️ Kenyataan yang harus dipahami dulu

**JavaScript yang berjalan di server orang lain tidak bisa diamankan 100%.**
Kalau kodenya jalan di mesin mereka, mereka punya akses ke runtime-nya:

- Node.js mengeksekusi source/bytecode yang bisa dibaca pemilik mesin.
- Obfuscation hanya **menaikkan effort** pencuri — bukan menghentikan total.
- Enkripsi source pun percuma: kunci dekripsi harus ada di mesin itu juga.

**Satu-satunya proteksi yang benar-benar kuat** adalah menaruh logika berharga
di server milikmu. Tapi itu mengubah arsitektur total.

Solusi di repo ini (**obfuscation + license check**) adalah **kompromi praktis
terbaik**: menaikkan bar secara signifikan untuk pencurian kasual, dan
memberimu **kill-switch** untuk mematikan bot dari jauh bila disalahgunakan.

---

## 🔒 Lapisan proteksi yang dipasang

| Lapisan | Fungsi | File |
|---|---|---|
| **Obfuscation** | Bundle + samarkan seluruh kode (string terenkripsi RC4, control-flow flattening, self-defending) | `scripts/build.mjs` |
| **License gate** | Bot menolak jalan tanpa lisensi valid | `src/license.js` |
| **HMAC signature** | Balasan server lisensi ditandatangani → server palsu ditolak | `src/license.js` + `license-server/server.js` |
| **Machine fingerprint** | Lisensi diikat ke identitas mesin (hostname, machine-id) | `src/license.js` |
| **Heartbeat** | Cek lisensi berkala → bisa dimatikan dari jauh | `src/license.js` |
| **Offline grace** | Tetap jalan saat server lisensi down (default 72 jam) | `src/license.js` |

---

## 🚀 Alur deploy (ringkas)

### 1. Di komputermu (development)
```bash
npm install
npm run build:secure      # hasilkan dist/bot.mjs (ter-obfuscate)
```

### 2. Jalankan server lisensi (di VPS/domain MILIKMU)
> ✅ **Sudah terpasang** di VPS Biznet: `https://lisensi.avhanapp.my.id`
> Detail & cara kelola: lihat `license-server/README.md`.

```bash
cd license-server
bash deploy/lisensi.sh list                  # lihat lisensi
bash deploy/lisensi.sh new 30 "Toko Si A"    # buat lisensi 30 hari
bash deploy/lisensi.sh new 0  "Toko Si B"    # lisensi selamanya
bash deploy/lisensi.sh revoke RB-xxxx-...    # cabut / matikan
```

### 3. Kirim ke server klien
Kirim folder project **TANPA** `src/`, `scripts/`, `license-server/`, tapi
**DENGAN**:
```
dist/bot.mjs          ← kode ter-obfuscate (yang dijalankan)
node_modules/         ← dependency
assets/               ← qris.png, logo
data/                 ← products.json
package.json
.env                  ← konfigurasi (isi LICENSE_KEY & LICENSE_SERVER)
```

`.env` di server klien:
```env
LICENSE_KEY=RB-xxxx-xxxx-xxxx-xxxx        # key yang kamu berikan
LICENSE_SERVER=https://lisensi.domainmu.com
LICENSE_REQUIRED=true                      # WAJIB true!
LICENSE_SECRET=SECRET-ACAK-MILIKMU         # samakan dengan server
```

### 4. Jalankan di server klien
```bash
node dist/bot.mjs
```

---

## 🧪 Hasil pengujian (sudah diverifikasi)

| Skenario | Hasil |
|---|---|
| Build obfuscate | ✅ `dist/bot.mjs` (~245 KB), teks sumber tersembunyi |
| Bot ter-obfuscate jalan & connect WA | ✅ |
| Key valid | ✅ Diterima, bot jalan |
| Key salah | ⛔ Ditolak — "Key tidak dikenal" |
| Key kosong + `LICENSE_REQUIRED=true` | ⛔ Ditolak |
| Server palsu (signature beda) | ⛔ Ditolak — "signature invalid" |
| Key dicabut (revoke) | ⛔ Ditolak — "Key dicabut" |
| Server down + cache fresh | ✅ Jalan (grace period 72 jam) |
| Server down + cache kadaluarsa | ⛔ Ditolak |

---

## 🎛️ Kill-switch dari jauh

Kapan pun kamu mau mematikan bot yang sudah di-deploy:
```bash
cd license-server
node server.js revoke RB-xxxx-xxxx-xxxx-xxxx
```
Dalam ≤ `LICENSE_HEARTBEAT_MIN` menit (default 30), bot akan mati sendiri.

---

## 🔑 Ganti SECRET

`LICENSE_SECRET` default hanyalah contoh. **Ganti** dengan string acak, dan
pastikan **sama** di `license-server` dan di `.env` bot. Buat string acak:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 💡 Saran tambahan

1. **Jangan taruh source asli di server klien** — hanya `dist/` + `node_modules/`.
2. **Gunakan HTTPS** untuk `LICENSE_SERVER` (pakai reverse proxy + Let's Encrypt).
3. **Backup** `license-server/licenses.json` secara berkala.
4. Kalau mau proteksi maksimal, pertimbangkan memindahkan logika inti
   (order/QRIS/stok) ke API di server-mu, dan bot di server klien hanya
   klien tipis.
