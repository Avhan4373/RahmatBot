import fs from 'fs';
import { config } from '../config.js';
import { learnFromMessage, isAdminJid, jidToNumber } from './lids.js';
import {
  getProducts, findProduct, getCart, setCart, clearCart,
  createOrder, findOrder, updateOrder, userOrders, pendingPaymentOrder, getOrders,
} from './store.js';
import {
  MAIN_MENU_TEXT, HELP_TEXT, ADMIN_HELP_TEXT, mainMenuList, catalogList, catalogText,
  productQtyList, productDetailText, cartText, cartActionList,
} from './menus.js';
import { sendInvoice, forwardProofToAdmins } from './qris.js';
import { handleAdminCommand } from './admin.js';
import { sendList, sendQuickReplies } from './lists.js';

const norm = (s = '') => s.trim();
const lower = (s = '') => s.trim().toLowerCase();

// Kirim menu model SC: LIST yang bisa diklik (tombol "Pilih ...").
// Byte identik dengan SC (terverifikasi). Gagal → fallback teks bernomor.
async function sendMenuPoll(sock, jid, listObj, quoted) {
  return sendList(sock, jid, listObj, quoted);
}



async function sendMainMenu(sock, jid, quoted, admin = false) {
  return sendMenuPoll(sock, jid, mainMenuList(config.botName, admin), quoted);
}
const adminHelp = () => ADMIN_HELP_TEXT.replace('{{BOT}}', config.botName);
const userHelp = () => HELP_TEXT.replace('{{BOT}}', config.botName);

async function sendCatalog(sock, jid, quoted) {
  const ps = getProducts().filter(p => p.active !== false);
  if (!ps.length) {
    return sock.sendMessage(jid, { text: '📭 Katalog masih kosong. Coba lagi nanti ya.' });
  }
  return sendMenuPoll(sock, jid, catalogList(), quoted);
}

export async function handleMessage(sock, m) {
  const msg = m.messages?.[0];
  if (!msg || msg.key.fromMe) return;
  const from = msg.key.remoteJid;
  if (!from || from.endsWith('@g.us')) return; // abaikan grup
  if (from === 'status@broadcast') return;

  const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: msg });

  // ===== Ambil teks ala SC (index.js baris 90 & 127-132) =====
  // mendukung: conversation, caption gambar/video, extendedText,
  // buttonsResponseMessage.selectedButtonId,
  // listResponseMessage.singleSelectReply.selectedRowId,
  // templateButtonReplyMessage.selectedId
  const content = msg.message || {};
  const type = Object.keys(content)[0] || '';
  const listRowId = content.listResponseMessage?.singleSelectReply?.selectedRowId || '';
  const buttonId =
    content.buttonsResponseMessage?.selectedButtonId ||
    content.templateButtonReplyMessage?.selectedId || '';
  let text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    listRowId ||
    buttonId || '';

  // interactiveResponseMessage (native flow) -> paramsJson {"id": "..."}
  const paramsJson = content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (!text && paramsJson) {
    try {
      const p = JSON.parse(paramsJson);
      text = p.id || paramsJson;
    } catch { text = paramsJson; }
  }
  text = norm(text);

  learnFromMessage(msg); // ingat pasangan nomor <-> @lid untuk balasan/forward
  const admin = isAdminJid(from, msg.key, config.adminNumbers);
  const hasImage = !!content.imageMessage;


  // ===== 1) GAMBAR = bukti bayar (pelanggan, non-admin) — pola SC =====
  if (hasImage && !admin) {
    const pending = pendingPaymentOrder(from);
    if (!pending) {
      await reply('📸 Foto diterima, tapi kamu tidak punya order menunggu bayar.\nKetik *menu* untuk mulai order.');
      return;
    }
    if (pending.status === 'PENDING_VERIF') {
      await reply(`⏳ Bukti ${pending.id} sudah diteruskan ke admin, mohon tunggu. Jangan kirim ulang ya 🙏.`);
      return;
    }
    updateOrder(pending.id, { status: 'PENDING_VERIF', proof: { at: new Date().toISOString() } });
    await reply(
`✅ Bukti bayar diterima & diteruskan ke owner.\nOrder ID: ${pending.id}\nPesananmu diproses setelah owner verifikasi 🙏`);
    await forwardProofToAdmins(sock, { ...pending, status: 'PENDING_VERIF' }, msg);
    return;
  }

  // ===== 2) Command admin (/...) =====
  if (text.startsWith('/')) {
    if (!admin) return reply('⛔ Perintah khusus admin.');
    return handleAdminCommand({ sock, from, text, reply });
  }

  const t = lower(text);
  const pushName = msg.pushName || '';


  // ===== Perintah diagnosa tombol: "tesbtn" → kirim 2 quick_reply =====
  if (t === 'tesbtn' || t === 'testombol') {
    try {
      await sendQuickReplies(sock, from, {
        text: 'Tes tombol quick_reply — klik salah satu:',
        footer: config.botName,
        buttons: [
          { id: 'test_ok', display: 'Tes OK' },
          { id: 'katalog', display: 'Katalog' },
        ],
      }, msg);
    } catch (e) {
      await reply('quick_reply gagal dikirim: ' + e.message);
    }
    return;
  }
  if (t === 'test_ok') {
    return reply('Tombol quick_reply TAMPIL & berfungsi! Klik tercatat oleh bot.');
  }

  // ===== 3) Sapaan / menu utama (rowId "menu" tidak ada; SC pakai sambutan sekali,
  // kita kirim tiap diminta agar simpel) =====
  if (['halo', 'hallo', 'hai', 'hi', 'p', 'assalamualaikum', 'menu', 'start', 'mulai', '0', '#allmenu', 'allmenu'].includes(t)) {
    return sendMainMenu(sock, from, msg, admin);
  }
  if (['1', 'katalog', 'katalog produk', 'produk', 'order', 'beli', '#pricelist', 'pricelist', 'listproduk'].includes(t)) {
    return sendCatalog(sock, from, msg);
  }
  if (['2', 'keranjang', 'cart'].includes(t)) {
    await reply(cartText(from));
    const items = getCart(from);
    if (items.length) await sendMenuPoll(sock, from, cartActionList(), msg);
    return;
  }
  if (['3', 'status', 'cek', 'cek order', 'order saya'].includes(t)) {
    if (admin) {
      // Owner/admin: yang dicek = order PELANGGAN yang butuh verifikasi
      const all = getOrders();
      const need = all.filter(o => ['PENDING_VERIF', 'MENUNGGU_BAYAR'].includes(o.status));
      if (!need.length) return reply('✅ Tidak ada order pelanggan yang menunggu.\nDetail: /order ORDER-XXXX');
      return reply('📋 *ORDER PELANGGAN MENUNGGU (' + need.length + ')*\n' + need.slice(-15).reverse().map(o =>
        `• ${o.id} — ${o.status}\n  ${(o.userName || '-')} (${jidToNumber(o.userJid)}) — Rp${Number(o.total).toLocaleString('id-ID')}\n  ACC: /acc ${o.id}`
      ).join('\n') + '\n\nDetail: /order ORDER-XXXX');
    }
    const list = userOrders(from);
    if (!list.length) return reply('📦 Belum ada order. Ketik *katalog* untuk mulai.');
    return reply('📦 *Order kamu:*\n' + list.map(o => `• ${o.id} — ${o.status} — Rp${Number(o.total).toLocaleString('id-ID')}`).join('\n'));
  }
  if (['4', 'bantuan', 'help', 'bantu', '?', '#hubown', 'hubown'].includes(t)) {
    return reply(admin ? adminHelp() : userHelp());
  }
  if (t === 'adminmenu') {
    if (!admin) return reply(userHelp());
    return reply(adminHelp());
  }

  // ===== 4) Detail produk: "detail P01" (opsi list katalog) / "#detail P01" / "P01" =====
  let mDetail = /^(?:#?detail|info|lihat)\s+(P\d+)/i.exec(text);
  if (mDetail) {
    const p = findProduct(mDetail[1]);
    if (!p) return reply(`❌ Produk ${mDetail[1]} tidak ditemukan.`);
    return sendMenuPoll(sock, from, productQtyList(p), msg);
  }
  if (/^P\d+$/i.test(text)) {
    const p = findProduct(text.toUpperCase());
    if (!p) return reply('❌ Produk tidak ditemukan. Ketik *katalog*.');
    return sendMenuPoll(sock, from, productQtyList(p), msg);
  }

  // ===== 5) Beli: "beli P01" / "beli P01 2" / "#buy P01,2" (format SC) =====
  let mBuy = /^(?:#?beli|#?buy|order)\s+(P\d+)(?:[\s,]+(\d+))?/i.exec(text);
  if (mBuy) return addToCart(sock, from, reply, msg, mBuy[1], parseInt(mBuy[2] || '1', 10));

  let mHapus = /^(?:hapus|remove|del)\s+(P\d+)/i.exec(text);
  if (mHapus) {
    const items = getCart(from).filter(i => i.id.toLowerCase() !== mHapus[1].toLowerCase());
    setCart(from, items);
    return reply('🗑️ Item dihapus.\n\n' + cartText(from));
  }

  if (['checkout', 'bayar', 'co'].includes(t)) {
    const items = getCart(from);
    if (!items.length) return reply('🛒 Keranjang kosong. Ketik *katalog* dulu.');
    const detail = [];
    let total = 0;
    for (const it of items) {
      const p = findProduct(it.id);
      if (!p) continue;
      detail.push({ id: p.id, name: p.name, price: p.price, qty: it.qty });
      total += p.price * it.qty;
    }
    if (!detail.length) return reply('❌ Produk di keranjang tidak valid.');
    const order = createOrder({ userJid: from, userName: pushName, items: detail, total });
    clearCart(from);
    await sendInvoice(sock, order, msg);
    return;
  }

  if (t === 'batal' || t === 'cancel') {
    clearCart(from);
    const pending = pendingPaymentOrder(from);
    if (pending && pending.status === 'MENUNGGU_BAYAR') {
      updateOrder(pending.id, { status: 'BATAL' });
      return reply(`🚫 Order ${pending.id} dibatalkan + keranjang dikosongkan.`);
    }
    return reply('🚫 Keranjang dikosongkan. Ketik *menu* untuk mulai lagi.');
  }

  // ===== 6) fallback =====
  await reply(
`Maaf, saya tidak paham "${text}".\nKetik *menu* untuk tombol yang bisa diklik, atau *bantuan*.`);
}

async function addToCart(sock, from, reply, quoted, productId, qty = 1) {
  qty = Math.min(Math.max(qty || 1, 1), 99);
  const p = findProduct(productId);
  if (!p || p.active === false) {
    await reply(`❌ Produk ${productId} tidak tersedia. Ketik *katalog*.`);
    return;
  }
  const items = getCart(from);
  const ex = items.find(i => i.id.toLowerCase() === p.id.toLowerCase());
  if (ex) ex.qty = Math.min(ex.qty + qty, 99);
  else items.push({ id: p.id, qty });
  setCart(from, items);
  await reply(`✅ *${p.name}* x${qty} masuk keranjang!\n\n${cartText(from)}`);
  await sendMenuPoll(sock, from, cartActionList(), quoted);
}
