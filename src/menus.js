import { getProducts, getCart, findProduct, findVariant, soldCount } from './store.js';
import { jidToNumber } from './lids.js';
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
⚙️  Pengaturan toko (nama & QRIS)
🖼️  Ganti gambar QRIS
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
          { title: 'Pengaturan toko', rowId: '/set', description: 'Nama bot, toko, label QRIS' },
          { title: 'Ganti gambar QRIS', rowId: '/qris', description: 'Lihat / ganti QRIS' },
          { title: 'Fitur admin', rowId: 'adminmenu', description: 'Daftar semua perintah' },
        ],
      }],
      fallback: text + '\n\n(Balas: katalog / status / keranjang / /set / /qris / adminmenu)',
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
atau langsung: add Nama 25000 deskripsi stok:a,b
/menu variants P01 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3
atau langsung: add varians 1 Bulan 1500 10; Canva Head 7000 22
/menu variants P01 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3
atau langsung: add varians 1 Bulan 1500 10; Canva Head 7000 22
/menu edit P01 harga 30000 — (nama/deskripsi/on/off)
/menu del P01 — hapus produk
/menu del P01,P02,P03 — hapus banyak
/menu del all confirm — hapus semua produk

*Stok:*
/stok P01 akun1,akun2 — tambah
/stok lihat P01 — tampilkan isi
/stok hapus P01 2 — hapus 1 item
/stok kosong P01 — hapus semua

*Pengaturan toko:*
/set — lihat pengaturan
/set bot Nama Baru — ganti nama bot
/set toko Nama Toko — ganti nama toko
/set qrislabel Label — ganti label QRIS
/set reset bot|toko|qrislabel — kembalikan default
/qris — lihat / ganti gambar QRIS`;

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
    title: p.name.toUpperCase().slice(0, 24),
    rowId: `detail ${p.id}`,
    description: (p.variants?.length
      ? `Pilih variasi (${p.variants.length})`
      : `Harga ${rupiah(p.price)} | Stok ${p.stock?.length ?? 0}`).slice(0, 70),
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
  let t = `🛍️ *KATALOG PRODUK DIGITAL*\nKlik list di atas atau ketik *detail P01* untuk lihat daftar lengkap:\n`;
  for (const p of ps) {
    const sold = soldCount(p.id);
    const stok = (p.stock?.length ?? 0) > 0 ? `✅ ready (${p.stock.length})` : '⚠️ stok menipis';
    t += `\n╭──────────────\n┊・Produk : ${p.name}\n┊・Stok Terjual : ${sold}\n╰──────────────`;
    if (p.desc) t += `\n${p.desc}`;
    t += `\n💰 ${rupiah(p.price)} • 📦 ${stok}\n🔖 ID: *${p.id}*`;
  }
  return t;
}

export function productVariantList(p) {
  const rows = (p.variants || []).map((v, i) => ({
    title: `${i + 1}. ${v.name}`.slice(0, 24),
    rowId: `varian ${p.id} ${v.name}`,
    description: `${rupiah(v.price)} | stok ${v.stock?.length ?? 0}`.slice(0, 70),
  }));
  const text = `Pilih variasi ${p.name} yang ingin dibeli.`;
  return {
    text,
    buttonText: 'Pilih Variasi',
    footer: 'Ketik: varian ' + p.id + ' <nama>',
    sections: [{ title: `Variasi ${p.name}`, rows }],
    fallback: text + '\n' + (p.variants || []).map(v => `${v.name}: ${rupiah(v.price)} (stok ${v.stock?.length ?? 0})`).join('\n') + `\n\nKetik: varian ${p.id} <nama variasi>`,
  };
}

export function productQtyVariantList(p, variantName) {
  const v = findVariant(p, variantName);
  if (!v) return productVariantList(p);
  const max = Math.min(Math.max(v.stock?.length ?? 1, 1), 10);
  const rows = [];
  for (let i = 1; i <= max; i++) {
    rows.push({ title: `${i}`, rowId: `beli ${p.id} ${v.name} ${i}`, description: `Beli ${i} item ${v.name}` });
  }
  const text = `📌 *${p.name} × ${v.name}*

> Harga : ${rupiah(v.price)}
> Stok  : ${v.stock?.length ?? 0}
${p.desc ? `\n${p.desc}` : ''}

Pilih jumlah pembelian di bawah ini`;
  return {
    text,
    buttonText: 'Pilih Jumlah',
    footer: 'Klik tombol di bawah',
    sections: [{ title: `Jumlah ${v.name}`, rows }],
    fallback: `Ketik: beli ${p.id} ${v.name} <jumlah>`,
  };
}


export function productQtyList(p) {
  const max = Math.min(Math.max(p.stock?.length ?? 1, 1), 10);
  const rows = [];
  for (let i = 1; i <= max; i++) {
    rows.push({ title: `${i}`, rowId: `beli ${p.id} ${i}`, description: `Beli ${i} item` });
  }
  const sold = soldCount(p.id);
  const desc = (p.desc || '').trim() || 'Tidak ada deskripsi.';
  const text = `╭──────────────
┊・Produk : ${p.name}
┊・Stok Terjual : ${sold}
╰──────────────

${desc}

━━━━━━━━━━━━━━━━━━
💰 Harga : ${rupiah(p.price)}
📦 Stok  : ${p.stock?.length ?? 0}

Pilih jumlah pembelian di bawah ini`;
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
  const ready = (p.stock?.length ?? 0) > 0;
  const sold = soldCount(p.id);
  const desc = (p.desc || '').trim() || 'Tidak ada deskripsi.';
  return (
`╭──────────────
┊・Produk : ${p.name}
┊・Stok Terjual : ${sold}
╰──────────────

${desc}

━━━━━━━━━━━━━━━━━━
🔖 ID Produk : *${p.id}*
💰 Harga     : *${rupiah(p.price)}*
📦 Stok      : ${ready ? 'tersedia ✅' : 'kosong, tanya admin ⚠️'}

Ketik: *beli ${p.id}* atau *beli ${p.id} 2* untuk jumlah 2.
${p.variants?.length ? 'Variasi: *beli ' + p.id + ' <nama variasi> <jumlah>*' : ''}
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
    const name = it.name || p.name;
    const price = (it.price != null) ? it.price : p.price;
    const sub = price * it.qty;
    total += sub;
    t += `\n• ${name} (${p.id}) x${it.qty} = *${rupiah(sub)}*`;
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

export function invoiceText(order, botName, storeName = '') {
  const lines = order.items.map(i => `• ${i.name} x${i.qty} = ${rupiah(i.price * i.qty)}`).join('\n');
  return (
`━━[ *PEMBAYARAN QRIS* ]━━
${storeName ? `🏬 *${storeName}*\n` : ''}
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
👤 ${order.userName || '-'} (${jidToNumber(order.userJid)})
${lines}
💰 Total: ${order.total} (${rupiah(order.total)})
📎 Bukti: foto di atas ⬆️

Konfirmasi:
• */acc ${order.id}* → lunas + kirim produk otomatis
• */tolak ${order.id} alasan* → tolak`);
}
