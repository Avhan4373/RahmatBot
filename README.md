# RahmatBot — WA Auto Order Produk Digital + QRIS Statis

Bot WhatsApp auto order untuk produk digital (Canva, Netflix, dll) memakai
Baileys (Node.js), pembayaran QRIS statis, verifikasi bukti manual oleh admin.

## Fitur
- Menu BISA DIKLIK model SC UMKM (List Message: tombol "Pilih disini / Lihat Produk / Pilih Jumlah") + fallback ketik angka/perintah.
- ⚠️ Hasil riset penting: tombol list/interaktif WAJIB dikirim dengan **binary node `biz` + `bot`** di `relayMessage` (lihat `src/lists.js`), kalau tidak server terima tapi HP tidak menampilkan tombol. Tombol `buttons:`/`list:` lawas via `sendMessage` sudah mati (Baileys #56, wontfix).
- Katalog produk digital dari `data/products.json` (bisa dikelola admin via chat).
- Keranjang (cart) per pelanggan: tambah, lihat, hapus, checkout.
- Checkout → total + gambar QRIS statis + ID order → pelanggan kirim FOTO bukti.
- **Struk belanja otomatis** (gambar, gaya SC UMKM via `src/struk.js`) dikirim tiap checkout. Logo opsional: taruh `assets/logo.jpg`.
- Bukti otomatis diteruskan ke admin → admin `/acc` / `/tolak`.
- Setelah ACC → status lunas + barang digital terkirim otomatis (akun/kode dari stok).
- Admin: notifikasi order, kelola menu, kelola stok, lihat order.
- **Aktif di grup**: bot bisa diundang ke grup untuk pamer katalog. Di grup bot hanya
  merespons saat di-@mention, pesan diawali prefix (default `.`), menjawab pesan bot,
  atau saat tombol diklik. Karena WA tidak mendukung tombol di grup, balasan grup
  memakai teks biasa. Order (keranjang/QRIS/bukti) diarahkan ke chat pribadi.
  Sambutan otomatis member baru masuk/pamit keluar (bisa dimatikan).

## Alur order
```
Pelanggan: halo/menu
Bot: [Tombol] 🛍️ Katalog | 🛒 Keranjang | 📦 Status | ❓ Bantuan
Pelanggan: klik Katalog → klik produk → klik Beli → jumlah
Bot: keranjang + tombol Checkout
Pelanggan: klik Checkout → input nama (opsional)
Bot: Invoice ORDER-XXXX + total + gambar QRIS + "balas dengan FOTO bukti bayar"
Pelanggan: kirim foto bukti
Bot: "Bukti diterima, menunggu verifikasi admin 🙏"
Admin: terima foto + tombol ACC/Tolak → /acc ORDER-XXXX
Bot ke pelanggan: "Lunas ✅, ini produk kamu: ..." (otomatis dari stok)
```

## Instalasi
```bash
npm install
cp .env.example .env
# edit .env (nomor admin, nomor bot untuk pairing)
# taruh gambar QRIS di assets/qris.png
npm start
# masukkan pairing code yang muncul di terminal ke WA: Pengaturan >
# Perangkat Tertaut > Tautkan Perangkat > Tautkan dg nomor telepon
# PENTING: kode hanya berlaku ~60 detik — siapkan HP sebelum npm start.
# Kalau kedaluwarsa, bot otomatis minta kode baru (tunggu ~15 detik).
# Sukses ditandai: ✅ RahmatBot terhubung!
```

## Konfigurasi (.env)
```
BOT_NAME=RahmatBot
STORE_NAME=Digital Store     # nama toko (struk & invoice)
ADMIN_NUMBERS=6281234567890,6289876543210
PHONE_NUMBER=6281234567890   # nomor WA bot (untuk pairing code, tanpa +)
QRIS_IMAGE=./assets/qris.png
QRIS_LABEL=RahmatBot • QRIS Statis
USE_PAIRING_CODE=true
```
> `BOT_NAME`, `STORE_NAME`, `QRIS_IMAGE`, `QRIS_LABEL` bisa diubah admin lewat
> chat (`/set bot`, `/set toko`, `/qris`) tanpa restart — disimpan di `data/settings.json`.

## Perintah pelanggan
- `halo`, `menu`, `start` → menu utama (klik tombol)
- `katalog` / `1` → daftar produk
- `keranjang` / `2` → isi keranjang
- `status` / `3` → status order kamu
- `batal` → batalkan keranjang / order terakhir
- `bantuan` → bantuan
- Kirim FOTO tanpa caption saat punya order menunggu bayar = bukti bayar.

## Fitur grup
Bot dapat diundang ke grup untuk menampilkan katalog. Aturan:

- Bot **hanya merespons** bila: di-@mention, pesan diawali prefix (`GROUP_PREFIX`,
  default `.`; `/` juga diterima), menjawab (reply) pesan bot, atau menekan tombol
  bot (bila ada).
- Perintah grup: `.menu` / tag bot → menu grup; `.katalog` → daftar produk rapi
  (harga + badge stok); `.detail P01` → rincian produk + langkah order;
  `.caraorder` → panduan order; `.bantuan` → bantuan.
- ⚠️ **WhatsApp tidak mendukung tombol/list interaktif di chat grup** (server
  menolak stanza dengan error `479`/`smax-invalid`). Karena itu semua balasan di
  grup memakai **teks biasa**. (Referensi SC UMKM pun menolak `menu` di grup dan
  menyuruh buka chat pribadi.)
- **Order tetap di chat pribadi** (keranjang, QRIS, bukti bayar). Di grup hanya
  katalog + arahan. Perintah admin (`/acc`, `/menu`, `/stok`, ...) tidak jalan di grup.
- Sambutan otomatis member baru masuk + pamit keluar (matikan: `GROUP_WELCOME=false`).
- Metadata grup di-cache (`cachedGroupMetadata`) agar pengiriman ke grup tidak
  timeout/kena rate-limit.

Konfigurasi grup di `.env`:
```
GROUP_ENABLED=true          # matikan total dengan false
GROUP_PREFIX=.              # prefix perintah di grup ("/" selalu diterima juga)
GROUP_WHITELIST=            # kosong = semua grup; isi ID @g.us untuk membatasi
GROUP_WELCOME=true          # sambutan member baru/keluar
GROUP_WELCOME_TEXT=         # opsional: {{member}} {{group}} {{bot}}
```

## Perintah admin (hanya nomor di ADMIN_NUMBERS)
- `/acc ORDER-XXXX` → konfirmasi lunas + kirim produk otomatis
- `/tolak ORDER-XXXX alasan` → tolak bukti
- `/order` → 10 order terakhir
- `/order ORDER-XXXX` → detail order
- `status` → ringkasan order pelanggan yang menunggu verifikasi
- `/menu` → list produk + ID (`/produk` sama)
- `/menu info P01` → detail produk + isi stok
- `/menu add Nama | 25000 | deskripsi | stok:akun1,akun2` → tambah produk
- `/menu edit P01 harga 30000` → ubah harga (nama/deskripsi/on/off)
- `/menu del P01` → hapus produk
- `/stok P01 akun1,akun2` → tambah stok digital
- `/stok lihat P01` → tampilkan isi stok bernomor
- `/stok hapus P01 2` → hapus 1 item stok • `/stok kosong P01` → hapus semua
- `/kirim ORDER-XXXX isi manual` → kirim manual jika stok kosong
- `/set` → lihat pengaturan toko (nama bot, nama toko, label QRIS)
- `/set bot Nama Baru` → ganti nama bot
- `/set toko Nama Toko` → ganti nama toko (tampil di struk & invoice)
- `/set qrislabel Label` → ganti label QRIS
- `/set reset bot|toko|qrislabel` → kembalikan ke default `.env`
- `/qris` → lihat gambar QRIS saat ini
- `/qris ganti` → instruksi ganti QRIS
- Kirim FOTO QRIS dengan caption `/qris` (atau reply foto + `/qris`) → ganti gambar QRIS
- `/help` → daftar perintah admin

**Pengaturan runtime:** perubahan `/set` & `/qris` disimpan di `data/settings.json`
dan **langsung berlaku tanpa restart** (menimpa nilai `.env`).

Format stok: tiap item dipisah koma. Saat ACC, 1 item stok diambil otomatis
dan dikirim ke pelanggan. Jika stok habis, admin dikasih tahu untuk `/kirim` manual.

## Struktur
```
src/index.js   → koneksi Baileys + pairing code + auto reconnect + event grup
src/handler.js → router pesan pelanggan + admin + grup
src/group.js   → logika grup: pemicu mention/prefix, katalog grup, sambutan member
src/menus.js   → teks menu + tombol/list interaktif + fallback angka
src/store.js   → JSON store: products, carts, orders
src/admin.js   → command admin
src/settings.js → pengaturan runtime (/set, ganti QRIS) di data/settings.json
src/qris.js    → kirim invoice + QRIS
config.js      → baca .env
data/products.json → contoh Canva, Netflix, dll (EDIT SESUAI TOKO)
assets/qris.png    → GANTI dengan QRIS statis kamu
```

## Catatan QRIS statis
Bot TIDAK bisa verifikasi otomatis nominal QRIS statis (nominal tidak tertanam
di QR). Jadi verifikasi tetap manual via foto bukti. Kalau mau otomatis penuh,
butuh gateway (Tripay/Xendit/Midtrans QRIS dinamis) — bisa ditambah nanti.
