import fs from 'fs';
import { resolveJid, jidToNumber } from './lids.js';
import { config, rupiah } from '../config.js';
import { getSetting, setSetting, clearSetting, allSettings } from './settings.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import {
  getProducts, saveProducts, findProduct, nextProductId, addStock,
  findVariant, getOrders, findOrder, updateOrder, takeStock,
} from './store.js';

const fmt = (n) => Number(n).toLocaleString('id-ID');

// Path QRIS yang dipakai bot (bisa hasil upload admin).
const qrisPath = () => config.qrisImage;
const qrisExists = () => { try { return fs.existsSync(qrisPath()); } catch { return false; } };

// sog = send-or-get? handler passes { sock, from, reply, msg, content }
export async function handleAdminCommand({ sock, from, text, reply, msg, content }) {
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
        const item = takeStock(it.id, it.variant || null);
        if (item) delivered.push(`• ${it.name}: ${item}`);
      }
    }
    const produkMsg = delivered.length
      ? `🎁 *Produk kamu:*\n${delivered.join('\n')}\n\nSimpan baik-baik ya. Komplain? Balas chat ini.`
      : `⚠️ Stok otomatis kosong, admin akan kirim manual segera. Tunggu ya 🙏.`;

    const paidAt = new Date().toLocaleString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).replace('.', ':');

    const detailLines = delivered.length
      ? delivered.map((d, i) => `${i + 1}.\n${String(d).replace(/^•\\s*/, '• ')}`).join('\n')
      : '• (stok kosong, admin kirim manual)';

    const successMsg =
`╭────〔 TRANSAKSI SUKSES 〕─

┊・Pay ID : ${order.id}
┊・Kode Unik : ${order.id}
┊・Nama Produk : ${order.items.map(i => i.name).join(', ')}
┊・Nama Variasi : ${order.items.map(i => i.variant || '(tanpa varians)').join(', ')}
┊・Catatan Variasi : -
┊・ID Buyer : ${jidToNumber(order.userJid)}
┊・Jumlah Beli : ${order.items.reduce((a, b) => a + b.qty, 0)}
┊・Berhasil Dipenuhi : ${delivered.length} pcs
┊・Total Dibayar : ${rupiah(order.total)}
┊・Methode Pay : QRIS (Acc admin)
┊・Tanggal/Jam Transaksi : ${paidAt}
╰┈┈┈┈┈┈┈┈

〔 〔 PRODUCT DETAIL 〕 〕

${detailLines}`;

    await sock.sendMessage(order.userJid, { text: successMsg });
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
        `• ${o.id} — ${o.status} — ${fmt(o.total)} — ${jidToNumber(o.userJid)}`
      ).join('\n') + '\n\nDetail: /order ORDER-XXXX');
    }
    const o = findOrder(arg);
    if (!o) return reply('Tidak ditemukan.');
    return reply(`🧾 *${o.id}*\nStatus: ${o.status}\nUser: ${o.userName} (${jidToNumber(o.userJid)})\n` +
      o.items.map(i => `• ${i.name} x${i.qty} = ${fmt(i.price * i.qty)}`).join('\n') +
      `\nTotal: ${fmt(o.total)}\nDibuat: ${o.createdAt}`);
  }

  if (c === '/menu' || c === '/produk') {
    const sub = (rest[0] || 'list').toLowerCase();

    // Tambah variasi langsung: /menu add varians 1 Bulan 1500 10; Canva Head 7000 22
    if (sub === 'add' && /^(varians|varian|variasi|variant)$/i.test(rest[1] || '')) {
      const lastId = getSetting('lastProduct');
      if (!lastId) return reply('Buat produk dulu contoh: /menu add Canva Pro');
      const p = findProduct(lastId);
      if (!p) return reply(`❌ Produk terakhir ${lastId} tidak ditemukan.`);
      const kw = rest[1];
      const payload = text.slice(text.toLowerCase().indexOf(kw.toLowerCase()) + kw.length).trim().replace(/^set\\s+/i, '');
      if (!payload) return reply(`Pakai: /menu add varians 1 Bulan 1500 10; Canva Head 7000 22;...\natau dengan stok akun: /menu variants ${p.id} 1 Bulan:1500:akun1,akun2`);
      const segments = payload.split(';').map(s => s.trim()).filter(Boolean);
      const variants = [];
      for (const seg of segments) {
        if (seg.includes(':')) {
          const [name, priceStr, stockStr] = seg.split(':');
          const price = parseInt(String(priceStr || '').replace(/\\D/g, ''), 10);
          const stock = stockStr ? stockStr.split(',').map(s => s.trim()).filter(Boolean) : [];
          if (name && price > 0) variants.push({ name: name.trim(), price, stock });
        } else {
          const toks = seg.split(/\s+/).filter(Boolean);
          let stockCount = 0;
          let price = 0;
          if (toks.length >= 2 && /^\d[\d.]*$/.test(toks[toks.length-1].replace(/[^\d.]/g,'')) && /^\d[\d.]*$/.test(toks[toks.length-2].replace(/[^\d.]/g,''))) {
            stockCount = parseInt(toks.pop() || '0', 10);
            price = parseInt(toks.pop() || '0', 10);
          } else {
            price = parseInt(toks.pop() || '0', 10);
          }
          const name = toks.join(' ').trim();
          const stock = (stockCount > 0) ? Array.from({ length: stockCount }, (_, i) => `stok-${i + 1}`) : [];
          if (name && price > 0) variants.push({ name, price, stock });
        }
      }
      if (!variants.length) return reply('Format varian tidak valid.');
      const ps = getProducts();
      const t = ps.find(x => x.id === p.id);
      const existing = t.variants || [];
      for (const nv of variants) {
        const ev = existing.find(x => (x.name || "").toLowerCase() === (nv.name || "").toLowerCase());
        if (ev) {
          if (nv.price > 0) ev.price = nv.price;
          ev.stock = [...(ev.stock || []), ...(nv.stock || [])];
        } else existing.push(nv);
      }
      t.variants = existing;
      t.price = existing.length ? Math.min(...existing.map(v => v.price)) : t.price;
      t.stock = [];
      saveProducts(ps);
      return reply(`✅ Variasi ${t.id} diset:\n` + existing.map((v, i) => `${i + 1}. ${v.name} - Rp${fmt(v.price)} (stok ${v.stock.length})`).join('\n'));
    }
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
${(p.variants||[]).length ? '🧩 Variasi:\n' + p.variants.map((v,i)=>`  ${i+1}. ${v.name} - Rp${fmt(v.price)} (stok ${v.stock?.length ?? 0})`).join('\n') + '\n' : ''}📌 Status: ${p.active === false ? 'NONAKTIF' : 'aktif'}
📊 Stok digital (${stok.length}):
${stok.length ? stok.map((s, i) => `  ${i + 1}. ${s}`).join('\n') : '  (kosong)'}

Ubah: /menu edit ${p.id} harga 30000
Stok: /stok ${p.id} akun-baru1,akun-baru2`);
    }
    if (sub === 'add') {
      // Mendukung 2 format:
      //   /menu add Nama | 25000 | deskripsi | stok:a,b
      //   /menu add Nama 25000 deskripsi (stok:a,b)   <- spasi, tanpa |
      const payload = text.slice(text.toLowerCase().indexOf('add') + 3).trim();
      let name = '', priceStr = '', desc = '', stok = [], allowZeroPrice = false;

      if (payload.includes('|')) {
        const parts = payload.split('|').map(x => x.trim()).filter(Boolean);
        if (parts.length < 2) return reply('Format: /menu add Nama | 25000 | deskripsi | stok:a,b\nContoh: /menu add Canva Pro | 15000 | invite 1 bulan | stok:akun1,akun2');
        const [n, p, ...others] = parts;
        name = n;
        priceStr = p;
        for (const o of others) {
          const m = /^stok:(.*)$/is.exec(o);
          if (m) stok = m[1].split(',').map(x => x.trim()).filter(Boolean);
          else if (!desc) desc = o;
          else desc += ' | ' + o;
        }
      } else {
        const tokens = payload.split(/\s+/).filter(Boolean);
        const priceIdx = tokens.findIndex(t => /^\d[\d.]*$/.test(t.replace(/[^\d.]/g, '')) && /\d/.test(t));
        if (priceIdx === 0) return reply('Format: /menu add Nama Harga deskripsi (stok:a,b)\nContoh: /menu add Canva Pro 15000 invite 1 bulan stok:akun1,akun2');
        if (priceIdx < 0) {
          name = payload;
          priceStr = '0';
          desc = '';
          stok = [];
        allowZeroPrice = true;
        } else {
          if (priceIdx < 1) return reply('Format: /menu add Nama Harga deskripsi (stok:a,b)\nContoh: /menu add Canva Pro 15000 invite 1 bulan stok:akun1,akun2');
          name = tokens.slice(0, priceIdx).join(' ');
          priceStr = tokens[priceIdx];
          const priceToken = tokens[priceIdx];
          const afterPrice = payload.slice(payload.toLowerCase().indexOf(priceToken.toLowerCase()) + priceToken.length).trim();
          const stokMatch = /(?:^|\s)stok:(.+)$/is.exec(afterPrice);
          if (stokMatch) {
            const seg = stokMatch[1].trim();
            stok = stok.concat(seg.split(',').map(x => x.trim()).filter(Boolean));
            desc = afterPrice.slice(0, stokMatch.index).trim();
          } else {
            desc = afterPrice.trim();
          }
        }
      }

      const price = parseInt(String(priceStr).replace(/\D/g, ''), 10);
      if (!name) return reply('❌ Nama produk wajib diisi.');
      if (!allowZeroPrice && (!price || price <= 0)) return reply('❌ Harga tidak valid. Contoh: 15000');
      const ps = getProducts();
      const id = nextProductId();
      ps.push({ id, name, price, desc, stock: stok, active: true, variants: [] });
      saveProducts(ps);
      setSetting('lastProduct', id);
      return reply(`✅ Produk ditambah:\n• ID: ${id}\n• Nama: ${name}\n• Harga: Rp${fmt(price)}\n• Deskripsi: ${desc || '-'}\n• Stok: ${stok.length} item\n\nLihat: /menu info ${id}`);
    }
    if (sub === 'variants' || sub === 'variasi' || sub === 'variant') {
      const id = rest[1];
      if (!id) return reply('Pakai: /menu variants P01\nSet: /menu variants P01 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3,akun4');
      const p = findProduct(id);
      if (!p) return reply(`\u274c Produk ${id} tidak ditemukan.`);
      const afterId = text.slice(text.toLowerCase().indexOf(id.toLowerCase()) + id.length).trim();
      if (!afterId || afterId.toLowerCase() === 'list') {
        const vs = p.variants || [];
        if (!vs.length) return reply(`\u1f4cb Variasi ${p.id} masih kosong.\nSet: /menu variants ${p.id} 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3`);
        return reply(`\u1f4cb *Variasi ${p.id} (${p.name}):*\n` + vs.map((v, i) => `${i + 1}. ${v.name} - Rp${fmt(v.price)} (stok ${v.stock?.length ?? 0})`).join('\n'));
      }
      const spec = afterId.replace(/^set\\s+/i, '').trim();
      const segments = spec.split('|').map(s => s.trim()).filter(Boolean);
      const variants = [];
      for (const seg of segments) {
        const [name, priceStr, stockStr] = seg.split(':');
        const price = parseInt(String(priceStr || '').replace(/\\D/g, ''), 10);
        const stock = stockStr ? stockStr.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (name && price > 0) variants.push({ name: name.trim(), price, stock });
      }
      if (!variants.length) return reply('Format: /menu variants P01 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3,akun4');
      const ps = getProducts();
      const t = ps.find(x => x.id === p.id);
      const existing = t.variants || [];
      for (const nv of variants) {
        const ev = existing.find(x => (x.name || "").toLowerCase() === (nv.name || "").toLowerCase());
        if (ev) {
          if (nv.price > 0) ev.price = nv.price;
          ev.stock = [...(ev.stock || []), ...(nv.stock || [])];
        } else existing.push(nv);
      }
      t.variants = existing;
      t.price = existing.length ? Math.min(...existing.map(v => v.price)) : t.price;
      t.stock = [];
      saveProducts(ps);
      return reply(`\u2705 Variasi ${t.id} diset:\n` + existing.map((v, i) => `${i + 1}. ${v.name} - Rp${fmt(v.price)} (stok ${v.stock.length})`).join('\n'));
    }
    if (sub === 'del' || sub === 'hapus' || sub === 'delete') {
      const raw = (rest[1] || '').trim();
      if (!raw) return reply('Pakai: /menu del P01\nHapus banyak: /menu del P01,P02,P03\nHapus semua: /menu del all confirm');

      // Bersihkan produk (semua) dengan konfirmasi eksplisit.
      if (/^(all|semua)$/.test(raw.toLowerCase())) {
        if ((rest[2] || '').toLowerCase() !== 'confirm') {
          const n = getProducts().length;
          return reply(`⚠️ Hapus semua produk? (${n} produk)\nKonfirmasi: /menu del all confirm`);
        }
        const removed = getProducts();
        saveProducts([]);
        return reply(`🗑️ Semua produk dihapus (${removed.length} item).`);
      }

      const ids = raw.split(',').map(x => x.trim()).filter(Boolean);
      if (!ids.length) return reply('Pakai: /menu del P01');

      const ps = getProducts();
      const found = [];
      const missing = [];
      for (const id of ids) {
        const p = ps.find(x => x.id.toLowerCase() === id.toLowerCase());
        if (p) found.push(p);
        else missing.push(id);
      }
      const foundIds = found.map(p => p.id.toLowerCase());
      const next = ps.filter(x => !foundIds.includes(x.id.toLowerCase()));
      saveProducts(next);
      const lines = found.map(p => `🗑️ ${p.id} — ${p.name} (stok ${(p.stock?.length ?? 0) + (p.variants || []).reduce((a, v) => a + (v.stock?.length ?? 0), 0)} ikut terhapus)`);
      if (missing.length) lines.push('Tidak ditemukan: ' + missing.join(', '));
      lines.push(`Sisa produk: ${next.length}`);
      return reply(lines.join('\n'));
    }
    if (sub === 'edit') {
      // /menu edit P01 harga 30000 | nama X | deskripsi X | on | off
      const [, id, fieldRaw, ...valParts] = rest;
      if (!id) return reply('Pakai: /menu edit P01 harga 30000');
      const p = findProduct(id);
      if (!p) return reply(`❌ Produk ${id} tidak ditemukan. Lihat daftar: /menu`);
      const field = (fieldRaw || '').toLowerCase();
      // Untuk deskripsi, pertahankan spasi & baris baru (format multi-baris) —
      // bukan gabung token (yang menghapus newline).
      let val = valParts.join(' ').trim();
      if (field === 'deskripsi' || field === 'desk') {
        const key = fieldRaw || '';
        const i = text.toLowerCase().indexOf(key.toLowerCase());
        if (i >= 0) val = text.slice(i + key.length).trim();
      }
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
    // Varian-aware stock management
    if (Array.isArray(p.variants) && p.variants.length) {
      const isLihat = ['lihat','list','info'].includes(sub);
      if (isLihat) {
        const variantQuery = args.join(' ').trim();
        if (!variantQuery) {
          return reply('📊 *Stok varians ' + p.id + ' (' + p.name + ') — ' + p.variants.reduce((a,v)=>a+v.stock.length,0) + ' item:*\n' +
            p.variants.map(v => '• ' + v.name + ': ' + v.stock.length + ' item').join('\n') +
            '\n\nLihat detail: /stok lihat ' + p.id + ' <varian>\nTambah stok: /stok ' + p.id + ' <varian>:akun1,akun2');
        }
        const v = findVariant(p, variantQuery);
        if (!v) return reply('❌ Variasi tidak ditemukan.');
        if (!(v.stock||[]).length) return reply('📊 Stok ' + v.name + ' kosong.\nTambah: /stok ' + p.id + ' ' + v.name + ':akun1,akun2');
        return reply('📊 Stok ' + v.name + ' — ' + v.stock.length + ' item:\n' + v.stock.map((s,i)=> (i+1)+'. '+s).join('\n') +
          '\n\nHapus: /stok hapus ' + p.id + ' ' + v.name + ' <nomor>');
      }
      if (['kosong','clear','reset'].includes(sub)) {
        const variantQuery = args.join(' ').trim();
        const ps = getProducts();
        const t = ps.find(x => x.id.toLowerCase() === p.id.toLowerCase());
        if (variantQuery) {
          const v = findVariant(t, variantQuery);
          if (!v) return reply('❌ Variasi tidak ditemukan.');
          v.stock = [];
          saveProducts(ps);
          return reply('🗑️ Semua stok ' + v.name + ' dikosongkan.');
        }
        (t.variants||[]).forEach(v => v.stock = []);
        saveProducts(ps);
        return reply('🗑️ Semua stok variasi ' + p.id + ' dikosongkan.');
      }
      if (['hapus','del','delete'].includes(sub)) {
        const no = parseInt(args[args.length-1], 10);
        const variantQuery = !no || Number.isNaN(no) ? args.join(' ') : args.slice(0,-1).join(' ');
        if (!no || no < 1) return reply('Pakai: /stok hapus ' + p.id + ' <varian> <nomor>');
        const ps = getProducts();
        const t = ps.find(x => x.id.toLowerCase() === p.id.toLowerCase());
        const v = findVariant(t, variantQuery);
        if (!v) return reply('❌ Variasi tidak ditemukan.');
        if (no > (v.stock||[]).length) return reply('❌ Nomor 1–' + (v.stock||[]).length);
        const [gone] = v.stock.splice(no-1, 1);
        saveProducts(ps);
        return reply('🗑️ Stok #' + no + ' dihapus dari ' + v.name + ': ' + gone + '\nSisa: ' + v.stock.length + ' item.');
      }
      // default add
      const afterId = rest.join(' ').slice(rest.join(' ').toLowerCase().indexOf(id.toLowerCase()) + id.length).trim();
      let cleaned = afterId;
      if (/^(tambah|add)/i.test(cleaned)) cleaned = cleaned.replace(/^(tambah|add)\s+/i, '');
      let variantQuery = '', items = [];
      const colonIdx = cleaned.indexOf(':');
      if (colonIdx >= 0) {
        variantQuery = cleaned.slice(0, colonIdx).trim();
        items = cleaned.slice(colonIdx+1).split(',').map(s => s.trim()).filter(Boolean);
      } else {
        const commaIdx = cleaned.indexOf(',');
        if (commaIdx >= 0) {
          variantQuery = cleaned.slice(0, commaIdx).trim();
          items = cleaned.slice(commaIdx).split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      if (!variantQuery || !items.length) return reply('Pakai: /stok ' + p.id + ' <varian>:akun1,akun2');
      if (!addStock(p.id, items, variantQuery)) return reply('❌ Variasi tidak ditemukan');
      const np = findProduct(p.id);
      const nv = findVariant(np, variantQuery) || {}
      return reply('✅ Stok ' + (variantQuery||'(varian)') + ' +'+items.length+' item (total '+(nv.stock||[]).length+').\nLihat: /stok lihat '+p.id+' '+variantQuery);
    }
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

  // ===== PENGATURAN (nama bot / toko / label QRIS) =====
  if (c === '/set' || c === '/setting' || c === '/pengaturan') {
    // /set                  → lihat semua
    // /set bot Nama Baru    → ganti nama bot
    // /set toko Nama Toko   → ganti nama toko
    // /set qrislabel Label  → ganti label QRIS
    // /set reset <field>    → kembalikan ke default .env
    const sub = (rest[0] || '').toLowerCase();
    if (!sub || sub === 'lihat' || sub === 'list' || sub === 'info') {
      const s = allSettings();
      return reply(
`⚙️ *PENGATURAN TOKO*

🤖 Nama bot   : *${config.botName}*${s.botName ? ' _(kustom)_' : ''}
🏬 Nama toko  : *${config.storeName}*${s.storeName ? ' _(kustom)_' : ''}
🏦 Label QRIS : *${config.qrisLabel}*${s.qrisLabel ? ' _(kustom)_' : ''}
🖼️ Gambar QRIS: ${qrisExists() ? '✅ terpasang' : '⚠️ belum ada'}

*Ubah:*
/set bot Nama Baru
/set toko Nama Toko
/set qrislabel Nama QRIS
/qris — lihat & ganti gambar QRIS
/set reset bot|toko|qrislabel — kembalikan default`);
    }
    if (sub === 'reset') {
      const field = (rest[1] || '').toLowerCase();
      const map = { bot: 'botName', botname: 'botName', namabot: 'botName', toko: 'storeName', store: 'storeName', namatoko: 'storeName', qrislabel: 'qrisLabel', label: 'qrisLabel' };
      const key = map[field];
      if (!key) return reply('Pakai: /set reset bot | /set reset toko | /set reset qrislabel');
      clearSetting(key);
      return reply(`↩️ *${field}* dikembalikan ke default: *${config[key]}*`);
    }

    const val = rest.slice(1).join(' ').trim();
    const map = {
      bot: 'botName', botname: 'botName', namabot: 'botName',
      toko: 'storeName', store: 'storeName', namatoko: 'storeName', shop: 'storeName',
      qrislabel: 'qrisLabel', label: 'qrisLabel', labelqris: 'qrisLabel',
    };
    const key = map[sub];
    if (!key) return reply('Field: *bot* / *toko* / *qrislabel*\nContoh: /set bot RahmatStore');
    if (!val) return reply(`Pakai: /set ${sub} <nilai baru>`);
    if (val.length > 40) return reply('❌ Maksimal 40 karakter.');
    setSetting(key, val);
    const label = key === 'botName' ? 'Nama bot' : key === 'storeName' ? 'Nama toko' : 'Label QRIS';
    return reply(`✅ ${label} diubah menjadi *${val}*.\n\nLihat: /set`);
  }

  // ===== GANTI GAMBAR QRIS =====
  // /qris           → kirim gambar QRIS saat ini
  // /qris ganti     → minta kirim foto QRIS baru
  // (kirim/reply FOTO dengan caption "/qris" juga langsung mengganti)
  if (c === '/qris') {
    const sub = (rest[0] || '').toLowerCase();
    // Foto bisa dari pesan ini (caption /qris) atau dari pesan yang di-reply.
    const quotedImage = content?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    const photoMsg = content?.imageMessage
      ? msg
      : (quotedImage ? { key: msg.key, message: content.extendedTextMessage.contextInfo.quotedMessage } : null);
    if (photoMsg || sub === 'set' || sub === 'simpan') {
      if (!photoMsg) return reply('📷 Kirim FOTO QRIS dengan caption */qris* untuk menggantinya.');
      try {
        const buf = await downloadMediaMessage(photoMsg, 'buffer', {});
        if (!buf || !buf.length) throw new Error('gambar kosong');
        fs.mkdirSync('./assets', { recursive: true });
        const dest = './assets/qris-upload.png';
        fs.writeFileSync(dest, buf);
        setSetting('qrisImage', dest);
        return reply(`✅ Gambar QRIS berhasil diganti (${Math.round(buf.length / 1024)} KB).\n\nCek: /qris`);
      } catch (e) {
        return reply('❌ Gagal menyimpan gambar QRIS: ' + e.message);
      }
    }
    if (sub === 'ganti' || sub === 'ubah' || sub === 'change') {
      return reply('📷 Kirim FOTO QRIS baru ke chat ini dengan caption */qris*\natau balas (reply) foto QRIS dengan */qris*.');
    }
    // default: kirim gambar QRIS sekarang
    if (!qrisExists()) {
      return reply('⚠️ Belum ada gambar QRIS.\nKirim FOTO QRIS dengan caption */qris* untuk memasang.');
    }
    try {
      await sock.sendMessage(from, {
        image: fs.readFileSync(qrisPath()),
        caption: `🏦 *${config.qrisLabel}*\n\nIni QRIS yang dipakai bot saat ini.\nGanti: kirim foto QRIS baru dengan caption */qris*`,
      }, { quoted: msg });
      return;
    } catch (e) {
      return reply('❌ Gagal mengirim gambar QRIS: ' + e.message);
    }
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
/menu edit P01 harga 30000 — nama/deskripsi/on/off
/menu del P01 | P01,P02,P03 | all confirm
/menu variants P01 — list varian
/menu variants P01 1 Bulan:1500:akun1,akun2 | Canva Head:7000:akun3
add varians 1 Bulan 1500 10; Canva Head 7000 22
add varians 1 Bulan:1500:akun1,akun2
/produk — sama dengan /menu

*Stok digital:*
/stok P01 akun1,akun2 — tambah stok biasa
/stok P01 1 Bulan:akun1,akun2 — tambah stok varian
/stok lihat P01 — tampilkan isi stok
/stok hapus P01 2 — hapus 1 item
/stok kosong P01 — kosongkan stok

*Pengaturan toko:*
/set — lihat pengaturan
/set bot Nama Baru — ganti nama bot
/set toko Nama Toko — ganti nama toko
/set qrislabel Label — ganti label QRIS
/set reset bot|toko|qrislabel — kembalikan default
/qris — lihat / ganti gambar QRIS`);
  }

  return reply('Perintah admin tidak dikenal. Ketik /help');
}
