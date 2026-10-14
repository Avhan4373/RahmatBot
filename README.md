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
ADMIN_NUMBERS=6281234567890,6289876543210
PHONE_NUMBER=6281234567890   # nomor WA bot (untuk pairing code, tanpa +)
QRIS_IMAGE=./assets/qris.png
QRIS_LABEL=RahmatBot • QRIS Statis
USE_PAIRING_CODE=true
```

## Perintah pelanggan
- `halo`, `menu`, `start` → menu utama (klik tombol)
- `katalog` / `1` → daftar produk
- `keranjang` / `2` → isi keranjang
- `status` / `3` → status order kamu
- `batal` → batalkan keranjang / order terakhir
- `bantuan` → bantuan
- Kirim FOTO tanpa caption saat punya order menunggu bayar = bukti bayar.

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
- `/help` → daftar perintah admin

Format stok: tiap item dipisah koma. Saat ACC, 1 item stok diambil otomatis
dan dikirim ke pelanggan. Jika stok habis, admin dikasih tahu untuk `/kirim` manual.

## Struktur
```
src/index.js   → koneksi Baileys + pairing code + auto reconnect
src/handler.js → router pesan pelanggan + admin
src/menus.js   → teks menu + tombol/list interaktif + fallback angka
src/store.js   → JSON store: products, carts, orders
src/admin.js   → command admin
src/qris.js    → kirim invoice + QRIS
config.js      → baca .env
data/products.json → contoh Canva, Netflix, dll (EDIT SESUAI TOKO)
assets/qris.png    → GANTI dengan QRIS statis kamu
```

## Catatan QRIS statis
Bot TIDAK bisa verifikasi otomatis nominal QRIS statis (nominal tidak tertanam
di QR). Jadi verifikasi tetap manual via foto bukti. Kalau mau otomatis penuh,
butuh gateway (Tripay/Xendit/Midtrans QRIS dinamis) — bisa ditambah nanti.
