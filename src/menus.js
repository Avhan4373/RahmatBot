import { getProducts, getCart, findProduct } from './store.js';
import { rupiah } from '../config.js';

// Pola tombol mengikuti SC UMKM: LIST MESSAGE
//   { text, buttonText: "Pilih disini", sections: [{ title, rows: [{ title, rowId, description }] }] }
// rowId = perintah teks biasa, jadi klik tombol == ketik perintah (fallback otomatis).

export const MAIN_MENU_TEXT =
`🤖 *{{BOT}} — Auto Order Produk Digital*
Pilih dengan klik tombol di bawah 👇 atau ketik angkanya:

1️⃣  Katalog produk  _(ketik: katalog)_
2️⃣  Keranjang saya  _(ketik: keranjang)_
3️⃣  Status order    _(ketik: status)_
4️⃣  Bantuan         _(ketik: bantuan)_

💳 Bayar via QRIS statis → kirim foto bukti → admin verifikasi.`;

// Menu utama sebagai POLL (bisa diklik) + teks bernomor (bisa diketik).
// options[].id = perintah yang dijalankan saat opsi diklik.
export function mainMenuList(botName, admin = false) {
  if (admin) {
    const text = `🤖 *${botName} — MODE ADMIN*
Pilih menu di bawah (klik tombol):

🛍️  Katalog produk
📋  Order pelanggan menunggu
🛒  Keranjang saya
🛠️  Fitur-fitur admin`;
    return {
      text,
      buttonText: 'Menu Admin',
      footer: botName,
      sections: [{
        title: 'Menu admin',
        rows: [
          { title: 'Katalog produk', rowId: 'katalog', description: 'Lihat produk digital' },
          { title: 'Order menunggu', rowId: 'status', description: 'Order pelanggan + ACC' },
          { title: 'Keranjang saya', rowId: 'keranjang', description: 'Order sebagai pembeli' },
          { title: 'Fitur admin', rowId: 'adminmenu', description: 'Perintah /acc /menu /stok' },
        ],
      }],
      fallback: text + '\n\n(Balas: katalog / status / keranjang / adminmenu)',
    };
  }
  const text = MAIN_MENU_TEXT.replace('{{BOT}}', botName);
  return {
    text,
    buttonText: 'Pilih disini',
    footer: botName,
    sections: [{
      title: 'Pilih sesuai kebutuhanmu',
      rows: [
        { title: 'Menu produk', rowId: 'katalog', description: 'Lihat produk digital yang tersedia' },
        { title: 'Keranjang saya', rowId: 'keranjang', description: 'Lihat & checkout belanjaan' },
        { title: 'Status order', rowId: 'status', description: 'Cek status pesanan kamu' },
        { title: 'Fitur bot', rowId: 'bantuan', description: 'Bantuan & cara order' },
      ],
    }],
    fallback: text + '\n\n(Balas: katalog / keranjang / status / bantuan)',
  };
}

export const ADMIN_HELP_TEXT =
`[ADMIN {{BOT}}]

*Order:*
/acc ORDER-XXXX — lunaskan + kirim stok otomatis
/tolak ORDER-XXXX alasan — tolak bukti
/order — 10 order terakhir
/order ORDER-XXXX — detail order
status — order pelanggan yang menunggu
/kirim ORDER-XXXX isi — kirim produk manual

*Produk:*
/menu — daftar • /menu info P01 — detail + stok
/menu add Nama | 25000 | deskripsi | stok:a,b
/menu edit P01 harga 30000 — (nama/deskripsi/on/off)
/menu del P01 — hapus produk

*Stok:*
/stok P01 akun1,akun2 — tambah
/stok lihat P01 — tampilkan isi
/stok hapus P01 2 — hapus 1 item
/stok kosong P01 — hapus semua`;

export const HELP_TEXT =
`❓ *Bantuan {{BOT}}*

*Pelanggan:*
• ketik *menu* → tampilkan tombol menu
• ketik *katalog* → lihat produk (bisa diklik)
• klik produk → pilih jumlah → *checkout*
• setelah checkout, bot kirim QRIS → kamu *kirim FOTO bukti bayar* ke chat ini
• ketik *status* → cek order kamu
• ketik *batal* → batalkan keranjang/order terakhir

*Contoh cepat:*
katalog → klik Canva → pilih 2 → checkout → bayar → kirim foto bukti → tunggu ACC admin ✅`;

// Katalog sebagai LIST (persis SC: rows per produk, rowId "detail P01")
export function catalogList() {
  const ps = getProducts().filter(p => p.active !== false);
  const rows = ps.map((p, i) => ({
    title: `${i + 1}. ${p.name.toUpperCase()}`.slice(0, 24),
    rowId: `detail ${p.id}`,
    description: `Harga ${rupiah(p.price)} | Stok ${p.stock?.length ?? 0}`.slice(0, 70),
  }));
  const text = 'Semua produk ready & bisa langsung diproses. Silakan pilih produk yang ingin kamu beli.';
  return {
    text,
    buttonText: 'Lihat Produk',
    footer: 'Klik tombol di bawah',
    sections: [{ title: 'Produk Tersedia', rows }],
    fallback: catalogText(),
  };
}

export function catalogText() {
  const ps = getProducts().filter(p => p.active !== false);
  if (!ps.length) return '📭 Katalog masih kosong. Coba lagi nanti ya.';
  let t = `🛍️ *KATALOG PRODUK DIGITAL*\nKlik list di atas atau ketik ID-nya (contoh: *detail P01*):\n`;
  for (const p of ps) {
    const stok = (p.stock?.length ?? 0) > 0 ? `✅ ready (${p.stock.length})` : '⚠️ stok menipis';
    t += `\n*${p.id}* — ${p.name}\n   ${rupiah(p.price)} • ${stok}\n   ${p.desc || ''}`;
  }
  return t;
}

// Detail produk + LIST pilih jumlah (persis SC: rowId "beli P01 2")
export function productQtyList(p) {
  const max = Math.min(Math.max(p.stock?.length ?? 1, 1), 10);
  const rows = [];
  for (let i = 1; i <= max; i++) {
    rows.push({ title: `${i}`, rowId: `beli ${p.id} ${i}`, description: `Beli ${i} item` });
  }
  const text = `📌 *${p.name.toUpperCase()}*\n\n> Harga : ${rupiah(p.price)}\n> Stok  : ${p.stock?.length ?? 0}\n> Deskripsi :\n${p.desc || 'Tidak ada deskripsi.'}\n\nPilih jumlah pembelian di bawah ini`;
  return {
    text,
    buttonText: 'Pilih Jumlah',
    footer: 'Klik tombol di bawah',
    sections: [{ title: 'Jumlah Pembelian', rows }],
    fallback: productDetailText(p.id) + `\n\nKetik: beli ${p.id} <jumlah>`,
  };
}

export function productDetailText(id) {
  const p = findProduct(id);
  if (!p) return `❌ Produk ${id} tidak ditemukan. Ketik *katalog* untuk lihat daftar.`;
  return (
`📦 *${p.name}* (${p.id})
💰 Harga: *${rupiah(p.price)}*
📝 ${p.desc || '-'}
📊 Stok digital: ${(p.stock?.length ?? 0) > 0 ? 'tersedia ✅' : 'kosong, tanya admin ⚠️'}

Ketik: *beli ${p.id}* atau *beli ${p.id} 2* untuk jumlah 2.
Ketik *katalog* untuk kembali.`);
}

export function cartText(jid) {
  const items = getCart(jid);
  if (!items.length) return '🛒 Keranjang masih kosong.\nKetik *katalog* untuk belanja.';
  let total = 0;
  let t = '🛒 *KERANJANG KAMU*\n';
  for (const it of items) {
    const p = findProduct(it.id);
    if (!p) continue;
    const sub = p.price * it.qty;
    total += sub;
    t += `\n• ${p.name} (${p.id}) x${it.qty} = *${rupiah(sub)}*`;
  }
  t += `\n\n💰 *Total: ${rupiah(total)}*`;
  t += `\n\nKetik: *checkout* untuk bayar • *hapus P01* untuk hapus item • *batal* untuk kosongkan.`;
  return t;
}

// Aksi keranjang sebagai LIST kecil (bisa diklik)
export function cartActionList() {
  const text = 'Pilih aksi keranjang (klik tombol) atau ketik: checkout / katalog / batal';
  return {
    text,
    buttonText: 'Pilih Aksi',
    footer: 'atau ketik perintahnya',
    sections: [{
      title: 'Keranjang',
      rows: [
        { title: 'Checkout / Bayar', rowId: 'checkout', description: 'Lanjut ke pembayaran QRIS' },
        { title: 'Tambah produk', rowId: 'katalog', description: 'Balik ke katalog' },
        { title: 'Kosongkan', rowId: 'batal', description: 'Hapus semua isi keranjang' },
      ],
    }],
    fallback: text,
  };
}

export function invoiceText(order, botName) {
  const lines = order.items.map(i => `• ${i.name} x${i.qty} = ${rupiah(i.price * i.qty)}`).join('\n');
  return (
`━━[ *PEMBAYARAN QRIS* ]━━

*⌬ Order ID:* ${order.id}
${lines}

💰 *Total Bayar: ${rupiah(order.total)}*
_(Bayar PAS sesuai nominal agar mudah diverifikasi)_

1. Scan QRIS di bawah dengan nominal *pas* ${rupiah(order.total)}
2. Screenshot bukti bayar & kirim ke chat ini
3. Admin akan verifikasi & memproses pesananmu 🙏`);
}

export function adminOrderText(order) {
  const lines = order.items.map(i => `• ${i.name} x${i.qty}`).join('\n');
  return (
`🔔 *ORDER BARU BUTUH VERIFIKASI*
🆔 ${order.id}
👤 ${order.userName || '-'} (${order.userJid.split('@')[0]})
${lines}
💰 Total: ${order.total} (${rupiah(order.total)})
📎 Bukti: foto di atas ⬆️

Konfirmasi:
• */acc ${order.id}* → lunas + kirim produk otomatis
• */tolak ${order.id} alasan* → tolak`);
}
