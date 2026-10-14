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

  if (c === '/menu') {
    const sub = (rest[0] || 'list').toLowerCase();
    if (sub === 'list' || sub === '') {
      const ps = getProducts();
      return reply('📋 *Daftar produk:*\n' + ps.map(p =>
        `• ${p.id} | ${p.name} | ${fmt(p.price)} | stok:${p.stock?.length ?? 0} | ${p.active === false ? 'NONAKTIF' : 'aktif'}`
      ).join('\n') + '\n\nTambah: /menu add Nama | 25000 | deskripsi | stok:a,b');
    }
    if (sub === 'add') {
      // /menu add Nama | 25000 | deskripsi | stok:item1,item2
      const payload = text.slice(text.toLowerCase().indexOf('add') + 3).trim();
      const parts = payload.split('|').map(s => s.trim());
      if (parts.length < 2) return reply('Format: /menu add Nama | 25000 | deskripsi | stok:a,b');
      const [name, priceStr, desc = '', stokStr = ''] = parts;
      let stok = [];
      const m = /stok:(.*)/i.exec(stokStr || desc || '');
      if (m) stok = m[1].split(',').map(s => s.trim()).filter(Boolean);
      const price = parseInt(String(priceStr).replace(/\D/g, ''), 10);
      if (!name || !price) return reply('Nama/harga tidak valid.');
      const ps = getProducts();
      const id = nextProductId();
      ps.push({ id, name, price, desc: stokStr.startsWith('stok:') ? desc : desc, stock: stok, active: true });
      saveProducts(ps);
      return reply(`✅ Produk ditambah: ${id} — ${name} — ${fmt(price)} (stok ${stok.length})`);
    }
    if (sub === 'del') {
      const id = rest[1];
      const ps = getProducts().filter(p => p.id.toLowerCase() !== String(id).toLowerCase());
      saveProducts(ps);
      return reply(`🗑️ ${id} dihapus.`);
    }
    if (sub === 'edit') {
      // /menu edit P01 harga 30000  | /menu edit P01 nama X | /menu edit P01 deskripsi X
      const [, id, field, ...valParts] = rest;
      const p = findProduct(id);
      if (!p) return reply('Produk tidak ditemukan.');
      const val = valParts.join(' ');
      const ps = getProducts();
      const t = ps.find(x => x.id === p.id);
      if (field === 'harga') t.price = parseInt(val.replace(/\D/g, ''), 10);
      else if (field === 'nama') t.name = val;
      else if (field === 'deskripsi') t.desc = val;
      else if (field === 'on') t.active = true;
      else if (field === 'off') t.active = false;
      else return reply('Field: harga/nama/deskripsi/on/off');
      saveProducts(ps);
      return reply(`✅ ${id} diupdate.`);
    }
    return reply('Subcommand: list/add/del/edit');
  }

  if (c === '/stok') {
    // /stok P01 item1,item2,item3
    const id = rest[0];
    const items = rest.slice(1).join(' ').split(',').map(s => s.trim()).filter(Boolean);
    if (!id || !items.length) return reply('Pakai: /stok P01 akun1,akun2');
    if (!addStock(id, items)) return reply('Produk tidak ditemukan.');
    return reply(`✅ Stok ${id} +${items.length} item.`);
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
`/acc ORDER-XXXX — lunaskan + kirim stok otomatis
/tolak ORDER-XXXX alasan — tolak
/order — 10 order terakhir
/order ORDER-XXXX — detail
/menu — list produk
/menu add Nama | harga | deskripsi | stok:a,b
/menu del P01
/menu edit P01 harga 30000
/stok P01 item1,item2
/kirim ORDER-XXXX isi manual`);
  }

  return reply('Perintah admin tidak dikenal. Ketik /help');
}
