import fs from 'fs';
import { resolveJid } from './lids.js';
import { config, rupiah } from '../config.js';
import {
  getProducts, saveProducts, findProduct, nextProductId, addStock,
  getOrders, findOrder, updateOrder, takeStock,
} from './store.js';

const fmt = (n) => Number(n).toLocaleString('id-ID');

// sog = send-or-get? handler passes { sock, from, reply }
export async function handleAdminCommand({ sock, from, text, reply }) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(' ').trim();
  const c = cmd.toLowerCase();

  if (c === '/acc') {
    if (!arg) return reply('Pakai: /acc ORDER-XXXX');
    const order = findOrder(arg);
    if (!order) return reply(`❌ Order ${arg} tidak ditemukan.`);
    if (order.status === 'LUNAS') return reply(`Order ${order.id} sudah lunas sebelumnya.`);
    updateOrder(order.id, { status: 'LUNAS', verifiedAt: new Date().toISOString() });

    // kirim produk digital otomatis dari stok (1 item per qty? sederhana: 1 item per baris produk)
    let delivered = [];
    for (const it of order.items) {
      for (let k = 0; k < it.qty; k++) {
        const item = takeStock(it.id);
        if (item) delivered.push(`• ${it.name}: ${item}`);
      }
    }
    const produkMsg = delivered.length
      ? `🎁 *Produk kamu:*\n${delivered.join('\n')}\n\nSimpan baik-baik ya. Komplain? Balas chat ini.`
      : `⚠️ Stok otomatis kosong, admin akan kirim manual segera. Tunggu ya 🙏.`;

    await sock.sendMessage(order.userJid, {
      text: `✅ *${order.id} LUNAS!* Terima kasih 🙏\n💰 ${rupiah(order.total)}\n\n${produkMsg}`,
    });
    if (delivered.length) updateOrder(order.id, { delivered });

    // kabari admin lain
    for (const adm of config.adminNumbers) {
      const jid = resolveJid(adm);
      if (jid !== from) {
        await sock.sendMessage(jid, { text: `✅ ${order.id} sudah di-ACC oleh ${from.split('@')[0]}.` }).catch(() => {});
      }
    }
    return reply(`✅ ${order.id} dilunaskan. Produk otomatis: ${delivered.length} item.`);
  }

  if (c === '/tolak') {
    const [id, ...reasonParts] = rest;
    if (!id) return reply('Pakai: /tolak ORDER-XXXX alasan');
    const order = findOrder(id);
    if (!order) return reply(`❌ Order ${id} tidak ditemukan.`);
    const reason = reasonParts.join(' ') || 'bukti tidak valid';
    updateOrder(order.id, { status: 'DITOLAK', note: reason });
    await sock.sendMessage(order.userJid, {
      text: `❌ *${order.id} DITOLAK*\nAlasan: ${reason}\n\nSilakan checkout ulang / kirim bukti yang benar. Ketik *menu*.`,
    });
    return reply(`OK, ${order.id} ditolak.`);
  }

  if (c === '/order') {
    if (!arg) {
      const last = getOrders().slice(-10).reverse();
      if (!last.length) return reply('Belum ada order.');
      return reply('📦 *10 order terakhir:*\n' + last.map(o =>
        `• ${o.id} — ${o.status} — ${fmt(o.total)} — ${o.userJid.split('@')[0]}`
      ).join('\n') + '\n\nDetail: /order ORDER-XXXX');
    }
    const o = findOrder(arg);
    if (!o) return reply('Tidak ditemukan.');
    return reply(`🧾 *${o.id}*\nStatus: ${o.status}\nUser: ${o.userName} (${o.userJid})\n` +
      o.items.map(i => `• ${i.name} x${i.qty} = ${fmt(i.price * i.qty)}`).join('\n') +
      `\nTotal: ${fmt(o.total)}\nDibuat: ${o.createdAt}`);
  }

  if (c === '/menu' || c === '/produk') {
    const sub = (rest[0] || 'list').toLowerCase();
    if (sub === 'list' || sub === '') {
      const ps = getProducts();
      if (!ps.length) return reply('📭 Belum ada produk.\nTambah: /menu add Nama | 25000 | deskripsi | stok:akun1,akun2');
      return reply('📋 *Daftar produk:*\n' + ps.map(p =>
        `• ${p.id} | ${p.name} | Rp${fmt(p.price)} | stok:${p.stock?.length ?? 0} | ${p.active === false ? 'NONAKTIF' : 'aktif'}`
      ).join('\n') + '\n\nLihat detail: /menu info P01\nTambah: /menu add Nama | 25000 | deskripsi | stok:a,b');
    }
    if (sub === 'info') {
      // /menu info P01 — detail lengkap + isi stok
      const id = rest[1];
      if (!id) return reply('Pakai: /menu info P01');
      const p = findProduct(id);
      if (!p) return reply(`❌ Produk ${id} tidak ditemukan. Lihat daftar: /menu`);
      const stok = p.stock || [];
      return reply(
`📦 *${p.name}* (${p.id})
💰 Harga: Rp${fmt(p.price)}
📝 ${p.desc || '-'}
📌 Status: ${p.active === false ? 'NONAKTIF' : 'aktif'}
📊 Stok digital (${stok.length}):
${stok.length ? stok.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : '  (kosong)'}

Ubah: /menu edit ${p.id} harga 30000
Stok: /stok ${p.id} akun-baru1,akun-baru2`);
    }
    if (sub === 'add') {
      // /menu add Nama | 25000 | deskripsi | stok:item1,item2
      // deskripsi & stok opsional, urutan bebas (bagian "stok:" dikenali otomatis)
      const payload = text.slice(text.toLowerCase().indexOf('add') + 3).trim();
      const parts = payload.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2) return reply('Format: /menu add Nama | 25000 | deskripsi | stok:a,b\nContoh: /menu add Canva Pro | 15000 | invite 1 bulan | stok:akun1,akun2');
      const [name, priceStr, ...others] = parts;
      let desc = '';
      let stok = [];
      for (const o of others) {
        const m = /^stok:(.*)$/is.exec(o);
        if (m) stok = m[1].split(',').map(s => s.trim()).filter(Boolean);
        else if (!desc) desc = o;
        else desc += ' | ' + o;
      }
      const price = parseInt(String(priceStr).replace(/\D/g, ''), 10);
      if (!name) return reply('❌ Nama produk wajib diisi.');
      if (!price || price <= 0) return reply('❌ Harga tidak valid. Contoh: 15000');
      const ps = getProducts();
      const id = nextProductId();
      ps.push({ id, name, price, desc, stock: stok, active: true });
      saveProducts(ps);
      return reply(`✅ Produk ditambah:\n• ID: ${id}\n• Nama: ${name}\n• Harga: Rp${fmt(price)}\n• Stok: ${stok.length} item\n\nLihat: /menu info ${id}`);
    }
    if (sub === 'del' || sub === 'hapus' || sub === 'delete') {
      const id = rest[1];
      if (!id) return reply('Pakai: /menu del P01');
      const p = findProduct(id);
      if (!p) return reply(`❌ Produk ${id} tidak ditemukan. Lihat daftar: /menu`);
      saveProducts(getProducts().filter(x => x.id !== p.id));
      return reply(`🗑️ Dihapus: ${p.id} — ${p.name} (stok ${p.stock?.length ?? 0} ikut terhapus)`);
    }
    if (sub === 'edit') {
      // /menu edit P01 harga 30000 | nama X | deskripsi X | on | off
      const [, id, fieldRaw, ...valParts] = rest;
      if (!id) return reply('Pakai: /menu edit P01 harga 30000');
      const p = findProduct(id);
      if (!p) return reply(`❌ Produk ${id} tidak ditemukan. Lihat daftar: /menu`);
      const field = (fieldRaw || '').toLowerCase();
      const val = valParts.join(' ').trim();
      const ps = getProducts();
      const t = ps.find(x => x.id === p.id);
      if (field === 'harga') {
        const price = parseInt(val.replace(/\D/g, ''), 10);
        if (!price || price <= 0) return reply('❌ Harga tidak valid.');
        t.price = price;
      }
      else if (field === 'nama') {
        if (!val) return reply('❌ Nama baru kosong.');
        t.name = val;
      }
      else if (field === 'deskripsi' || field === 'desk') {
        t.desc = val;
      }
      else if (field === 'on') t.active = true;
      else if (field === 'off') t.active = false;
      else return reply('Field: harga / nama / deskripsi / on / off\nContoh: /menu edit P01 harga 30000');
      saveProducts(ps);
      return reply(`✅ ${t.id} diupdate. Cek: /menu info ${t.id}`);
    }
    return reply('Subcommand: list / info / add / del / edit\nContoh: /menu info P01');
  }

  if (c === '/stok') {
    // Mendukung 2 urutan (bebas pilih):
    //   /stok P01 akun1,akun2   | /stok lihat P01 | /stok hapus P01 2 | /stok kosong P01
    //   /stok tambah P01 akun1,akun2 (bentuk panjang)
    const SUBS = ['lihat', 'list', 'info', 'tambah', 'add', 'hapus', 'del', 'delete', 'kosong', 'clear', 'reset'];
    let id, sub, args;
    if (SUBS.includes((rest[0] || '').toLowerCase())) {
      sub = rest[0].toLowerCase(); id = rest[1]; args = rest.slice(2);
    } else {
      id = rest[0]; sub = (rest[1] || '').toLowerCase(); args = rest.slice(1);
      // "/stok P01 akun1,akun2" → sub bukan keyword = mode tambah
      if (!SUBS.includes(sub)) { sub = 'tambah'; args = rest.slice(1); }
      else args = rest.slice(2);
    }
    if (!id) return reply('Pakai: /stok P01 akun1,akun2\nLihat: /stok lihat P01');
    const p = findProduct(id);
    if (!p) return reply(`❌ Produk ${id} tidak ditemukan. Lihat daftar: /menu`);
    if (['lihat', 'list', 'info'].includes(sub)) {
      const stok = p.stock || [];
      if (!stok.length) return reply(`📊 Stok ${p.id} (${p.name}) kosong.\nTambah: /stok ${p.id} akun1,akun2`);
      return reply(`📊 *Stok ${p.id} (${p.name}) — ${stok.length} item:*\n` +
        stok.map((s, i) => `${i + 1}. ${s}`).join('\n') +
        `\n\nHapus satu: /stok hapus ${p.id} <nomor>\nKosongkan: /stok kosong ${p.id}`);
    }
    if (['hapus', 'del', 'delete'].includes(sub)) {
      const no = parseInt(args[0], 10);
      const stok = p.stock || [];
      if (!no || no < 1 || no > stok.length) return reply(`❌ Nomor 1–${stok.length}. Lihat: /stok lihat ${p.id}`);
      const ps = getProducts();
      const t = ps.find(x => x.id === p.id);
      const [gone] = t.stock.splice(no - 1, 1);
      saveProducts(ps);
      return reply(`🗑️ Stok #${no} dihapus dari ${p.id}: ${gone}\nSisa: ${t.stock.length} item.`);
    }
    if (['kosong', 'clear', 'reset'].includes(sub)) {
      const ps = getProducts();
      ps.find(x => x.id === p.id).stock = [];
      saveProducts(ps);
      return reply(`🗑️ Semua stok ${p.id} dikosongkan.`);
    }
    // tambah: gabungkan sisa argumen, pisah koma
    const afterId = rest.join(' ').slice(rest.join(' ').toLowerCase().indexOf(id.toLowerCase()) + id.length).trim();
    const finalItems = afterId.split(',').map(s => s.trim()).filter(Boolean)
      .filter(s => !/^(tambah|add)$/i.test(s));
    if (!finalItems.length) return reply(`Pakai: /stok ${p.id} akun1,akun2`);
    if (!addStock(p.id, finalItems)) return reply('Produk tidak ditemukan.');
    return reply(`✅ Stok ${p.id} +${finalItems.length} item (total ${findProduct(p.id).stock.length}).\nLihat: /stok lihat ${p.id}`);
  }

  if (c === '/kirim') {
    // /kirim ORDER-XXXX isi produk manual
    const id = rest[0];
    const isi = rest.slice(1).join(' ');
    const o = findOrder(id);
    if (!o || !isi) return reply('Pakai: /kirim ORDER-XXXX isi-produk');
    updateOrder(id, { delivered: [isi], status: 'LUNAS' });
    await sock.sendMessage(o.userJid, { text: `🎁 *Produk ${id} dari admin:*\n${isi}` });
    return reply('Terkirim.');
  }

  if (c === '/help' || c === '/bantuan') {
    return reply(
`🛠️ *PERINTAH ADMIN*

*Order:*
/acc ORDER-XXXX — lunaskan + kirim stok otomatis
/tolak ORDER-XXXX alasan — tolak bukti
/order — 10 order terakhir
/order ORDER-XXXX — detail order
/kirim ORDER-XXXX isi — kirim produk manual

*Produk (CRUD):*
/menu — daftar produk
/menu info P01 — detail + isi stok
/menu add Nama | 25000 | deskripsi | stok:a,b
/menu edit P01 harga 30000 — (nama/deskripsi/on/off)
/menu del P01 — hapus produk
/produk — sama dengan /menu

*Stok digital:*
/stok P01 akun1,akun2 — tambah stok
/stok lihat P01 — tampilkan isi stok
/stok hapus P01 2 — hapus item nomor 2
/stok kosong P01 — hapus semua stok`);
  }

  return reply('Perintah admin tidak dikenal. Ketik /help');
}
