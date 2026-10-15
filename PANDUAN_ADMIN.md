# Panduan Admin RahmatBot

## Ringkas
Bot WhatsApp penjual produk digital. Admin mengelola produk, stok, order, dan pengaturan toko.

## Alur order
1. Pelanggan lihat `katalog` / `detail P01`
2. Pilih varian: `varian P01 1 Bulan`
3. Buat keranjang: `beli P01 1 Bulan 2`
4. Checkout: `checkout` / `bayar`
5. Bot kirim QRIS
6. Pelanggan kirim foto bukti bayar
7. Admin proses: `/acc ORDER-XXXX` atau `/tolak ORDER-XXXX alasan`

## Perintah admin

### Order
- `/acc ORDER-XXXX` → lunaskan + kirim stok otomatis
- `/tolak ORDER-XXXX alasan`
- `/order`
- `/order ORDER-XXXX`
- `status`
- `/kirim ORDER-XXXX isi`

### Produk
- `/menu` atau `/produk` → daftar produk
- `/menu info P01` → detail + stok
- `/menu add Nama | Harga | deskripsi | stok:a,b`
- `add Nama 25000 deskripsi stok:a,b`
- `add Canva Pro` → tambah produk tanpa harga (isi via varian)
- `/menu edit P01 harga 30000`
  - field: `harga`, `nama`, `deskripsi`, `on`, `off`
- Hapus:
  - `/menu del P01`
  - `/menu del P01,P02,P03`
  - `/menu del all confirm`
- Varian:
  - `/menu variants P01`
  - `/menu variants P01 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3`
  - `add varians 1 Bulan 1500 10; Canva Head 7000 22`
  - `add varians 1 Bulan:1500:akun1,akun2`
  - Catatan: command update/merge, varian yang tidak disebutkan tetap dipertahankan.

### Stok
- Biasa:
  - `/stok P01 akun1,akun2`
  - `/stok lihat P01`
  - `/stok hapus P01 2`
  - `/stok kosong P01`
- Varian:
  - `/stok lihat P01`
  - `/stok lihat P01 1 Bulan`
  - `/stok P01 1 Bulan:akun1,akun2`
  - `/stok kosong P01 1 Bulan`
  - `/stok hapus P01 1 Bulan 2`

### Pengaturan toko
- `/set`
- `/set bot Nama Baru`
- `/set toko Nama Toko`
- `/set qrislabel Label`
- `/set reset bot|toko|qrislabel`
- `/qris`
- `/qris ganti` lalu kirim foto caption `/qris`

### Detail produk (pelanggan)
- `detail P01` atau `P01`
- `varian P01 1 Bulan`
- `beli P01 1 Bulan 2`

## Tips aman
- Gunakan `/menu del all confirm` hanya jika yakin.
- Varian yang tidak punya stok akan tampil sebagai stok 0.
- Untuk multi-line deskripsi gunakan `/menu add` lalu edit deskripsi.
- Selalu cek stok dengan `/stok lihat P01`.
