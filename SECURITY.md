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
npm run pack              # hasilkan release/rahmatbot-client/ (siap kirim)
```

> Saat `build:secure`, **LICENSE_SECRET & LICENSE_SERVER di-"bake"** ke dalam
> kode ter-obfuscate. Jadi klien tidak perlu (dan tidak bisa) melihat/mengubah
> rahasia itu. Enforcement lisensi juga dipaksa aktif — klien tidak bisa
> mematikannya lewat `.env`.

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

### 3. Kirim ke klien
Cukup kirim **folder `release/rahmatbot-client/`** (atau zip-nya):
```
dist/bot.mjs          ← kode ter-obfuscate (yang dijalankan)
assets/               ← qris.png, logo
data/products.json    ← katalog contoh
package.json          ← versi bersih (tanpa script dev)
.env                  ← template, klien isi sendiri
README-KLIEN.md       ← panduan untuk klien
start.sh              ← launcher
```
Klien cukup: `npm install --omit=dev` → isi `.env` (termasuk `LICENSE_KEY`) → `npm start`.

> **`src/`, `scripts/`, `license-server/`, `config.js` TIDAK PERNAH ikut** —
> kode asli & rahasia tetap aman di komputermu.

Kalau server klien sulit compile `canvas`, pakai `PACK_WITH_DEPS=true npm run pack`
untuk ikut menyertakan `node_modules` (pastikan versi Node klien sama).

### 3. Kirim ke server klien
Kirim folder project **TANPA** `src/`, `scripts/`, `license-server/`, tapi
**DENGAN**:
```
dist/bot.mjs          ← kode ter-obfuscate (yang dijalankan)
node_modules/         ← dependency
assets/               ← qris.png, logo
data/                 ← products.json
package.json
.env                  ← konfigurasi (isi LICENSE_KEY)
```

`.env` di server klien:
```env
LICENSE_KEY=RB-xxxx-xxxx-xxxx-xxxx        # key yang kamu berikan
```
> ⚠️ `LICENSE_SERVER` & `LICENSE_SECRET` **tidak perlu** diisi — keduanya sudah
> tertanam di dalam kode ter-obfuscate (dibakar saat build).

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
| **SECRET/URL tersembunyi di dist** | ✅ Tidak terbaca plaintext |
| **Klien set `LICENSE_REQUIRED=false`** | ⛔ Tetap dipaksa (server di-bake) |
| **Klien ganti `LICENSE_SERVER` ke palsu** | ⛔ Diabaikan (pakai server di-bake) |
| **Folder rilis jalan di lingkungan bersih** | ✅ Lisensi valid + connect |

---

## 📦 Packaging (`npm run pack`)

Perintah `npm run pack` otomatis: build ter-obfuscate → susun folder
`release/rahmatbot-client/` yang **siap dikirim** ke klien.

Yang **disertakan**: `dist/`, `assets/`, `data/products.json`, `package.json`
(bersih), `.env` (template), `README-KLIEN.md`, `start.sh`.

Yang **TIDAK pernah disertakan**: `src/`, `scripts/`, `license-server/`,
`config.js`, `.git/`, `auth_info/`, `*.log`.

```bash
npm run pack                          # ringan (~400 KB, tanpa node_modules)
PACK_WITH_DEPS=true npm run pack      # ikut node_modules (~119 MB)
```

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
