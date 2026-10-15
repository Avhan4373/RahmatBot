import fs from 'fs';
import { config } from '../config.js';
import { learnFromMessage, isAdminJid, jidToNumber } from './lids.js';
import {
  getProducts, findProduct, findVariant, getCart, setCart, clearCart,
  createOrder, findOrder, updateOrder, userOrders, pendingPaymentOrder, getOrders,
} from './store.js';
import {
  MAIN_MENU_TEXT, HELP_TEXT, ADMIN_HELP_TEXT, mainMenuList, catalogList, catalogText,
  productQtyList, productQtyVariantList, productVariantList, productDetailText, cartText, cartActionList,
} from './menus.js';
import { sendInvoice, forwardProofToAdmins } from './qris.js';
import { handleAdminCommand } from './admin.js';
import { sendList, sendQuickReplies } from './lists.js';
import {
  groupAllowed, isBotMentioned, isReplyToBot, isInteractiveResponse, stripMentions,
  stripGroupPrefix, groupMainMenuText, groupCatalogText, groupProductText,
  groupRedirectText, groupHelp,
} from './group.js';

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
  if (!from) return;
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

  // ===== 0) PESAN GRUP =====
  // Bot hanya merespons bila di-tag, diawali prefix, menjawab pesan bot, atau
  // hasil klik tombol. Order tetap diarahkan ke chat pribadi.
  if (from.endsWith('@g.us')) {
    return handleGroupMessage(sock, msg, { from, content, text, reply });
  }

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
    return handleAdminCommand({ sock, from, text, reply, msg, content });
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

  // ===== Admin shortcut tanpa slash (/) & tanpa subcommand /menu =====
  // Contoh: "add Canva Pro 15000 invite 1 bulan stok:akun1,akun2"
  //         "edit P01 harga 30000" | "del P01" | "stok P01 akun1,akun2"
  if (admin && !text.startsWith('/')) {
    const cleaned = text.replace(/^[\.\s\/]+/, '').trim();
    const first = (cleaned.split(/\s+/)[0] || '').toLowerCase();
    const restAll = cleaned.split(/\s+/).slice(1).join(' ').trim();
    const alias = {
      add: '/menu add',
      tambah: '/menu add',
      del: '/menu del',
      hapus: '/menu hapus',
      delete: '/menu delete',
      edit: '/menu edit',
      variants: '/menu variants',
      varians: '/menu variants',
      variates: '/menu variants',
      stok: '/stok',
      tolak: '/tolak',
      kirim: '/kirim',
      set: '/set',
      setting: '/set',
      pengaturan: '/set',
    }[first];
    if (alias) {
      return handleAdminCommand({ sock, from, text: (restAll ? alias + ' ' + restAll : alias), reply, msg, content });
    }
  }

  // ===== 4) Detail produk: "detail P01" (opsi list katalog) / "#detail P01" / "P01" =====
  let mVar = /^(?:#?varian(?:t)?|variasi)\s+(P\d+)\s+(.+)$/i.exec(text);
  if (mVar) {
    const p = findProduct(mVar[1]);
    if (!p) return reply(`❌ Produk ${mVar[1]} tidak ditemukan.`);
    if (!(p.variants && p.variants.length)) {
      return reply(`Produk ${p.id} tidak punya variasi. Ketik *beli ${p.id}*.`);
    }
    const v = findVariant(p, mVar[2].trim());
    if (!v) return reply(`Variasi tidak ditemukan.\n` + (p.variants || []).map(x => `• ${x.name}`).join('\n'));
    return sendMenuPoll(sock, from, productQtyVariantList(p, v.name), msg);
  }

  let mDetail = /^(?:#?detail|info|lihat)\s+(P\d+)/i.exec(text);
  if (mDetail) {
    const p = findProduct(mDetail[1]);
    if (!p) return reply(`❌ Produk ${mDetail[1]} tidak ditemukan.`);
    if (Array.isArray(p.variants) && p.variants.length) {
      return sendMenuPoll(sock, from, productVariantList(p), msg);
    }
    return sendMenuPoll(sock, from, productQtyList(p), msg);
  }
  if (/^P\d+$/i.test(text)) {
    const p = findProduct(text.toUpperCase());
    if (!p) return reply('❌ Produk tidak ditemukan. Ketik *katalog*.');
    if (Array.isArray(p.variants) && p.variants.length) {
      return sendMenuPoll(sock, from, productVariantList(p), msg);
    }
    return sendMenuPoll(sock, from, productQtyList(p), msg);
  }

  // ===== 5) Beli: "beli P01" / "beli P01 2" / "#buy P01,2" (format SC) =====
  let mBuy = /^(?:#?beli|#?buy|order)\s+(P\d+)(?:\s+(.*))?$/i.exec(text);
  if (mBuy) {
    const pid = mBuy[1];
    let restBuy = (mBuy[2] || '').trim();
    let qty = 1;
    const qm = /\s+(\d+)\s*$/.exec(restBuy);
    if (qm) { qty = parseInt(qm[1], 10) || 1; restBuy = restBuy.slice(0, qm.index).trim(); }
    return addToCart(sock, from, reply, msg, pid, restBuy || null, qty);
  }

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
      detail.push({ id: p.id, name: it.name || p.name, variant: it.variant || null, price: (it.price != null ? it.price : p.price), qty: it.qty });
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

async function addToCart(sock, from, reply, quoted, productId, variant = null, qty = 1) {
  qty = Math.min(Math.max(qty || 1, 1), 99);
  const p = findProduct(productId);
  if (!p || p.active === false) {
    await reply(`❌ Produk ${productId} tidak tersedia. Ketik *katalog*.`);
    return;
  }
  if (Array.isArray(p.variants) && p.variants.length) {
    const v = findVariant(p, variant);
    if (!v) {
      const list = p.variants.map((x, i) => `${i + 1}. *${x.name}* - ${rupiah(x.price)} (stok ${x.stock?.length ?? 0})`).join('\n');
      await reply(`Pilih variasi terlebih dulu:\n${list}\n\nKetik: *beli ${p.id} <nama variasi> ${qty}*`);
      return;
    }
    variant = v.name;
    if ((v.stock?.length ?? 0) < qty) {
      await reply(`⚠️ Stok variasi *${v.name}* tinggal ${v.stock?.length ?? 0}.`);
    }
  } else if (variant) {
    variant = null;
  }

  const chosen = p.variants?.length ? findVariant(p, variant) : null;
  const price = chosen ? chosen.price : p.price;
  const itemName = chosen ? `${p.name} - ${chosen.name}` : p.name;

  const items = getCart(from);
  const ex = items.find(i => i.id.toLowerCase() === p.id.toLowerCase() && (i.variant || null) === (variant || null));
  if (ex) ex.qty = Math.min(ex.qty + qty, 99);
  else items.push({ id: p.id, variant: variant || null, name: itemName, price, qty });
  setCart(from, items);
  await reply(`✅ *${itemName}* x${qty} masuk keranjang!\n\n${cartText(from)}`);
  await sendMenuPoll(sock, from, cartActionList(), quoted);
}

// ===== Alur khusus GRUP =====
// Aturan: bot hanya aktif bila di-tag, diawali prefix, menjawab pesan bot, atau
// hasil klik tombol/list. PENTING: WhatsApp tidak mendukung tombol/list di grup,
// jadi SEMUA balasan grup memakai TEKS BIASA. Order diarahkan ke chat pribadi.
async function handleGroupMessage(sock, msg, { from, content, text, reply }) {
  if (!groupAllowed(from)) return;

  const interactive = isInteractiveResponse(content);
  const mentioned = isBotMentioned(sock, content);
  const replied = isReplyToBot(sock, content);
  const prefixed = stripGroupPrefix(text);

  // Tanpa pemicu apa pun → diam (tidak spam grup).
  if (!interactive && !mentioned && !replied && prefixed === null) return;

  // Bersihkan token mention, lalu buang prefix bila masih ada (mis. "@bot .menu").
  let body = stripMentions(prefixed === null ? text : prefixed, content).trim();
  const afterMention = stripGroupPrefix(body);
  if (afterMention !== null) body = afterMention;
  // Bila dipicu oleh mention/reply tanpa kata kunci → anggap minta menu.
  if (!body) body = 'menu';
  const t = lower(body);

  // Perintah admin TIDAK dijalankan di grup (hanya DM). Hanya perintah yang
  // benar-benar eksklusif admin (bukan alias katalog/menu grup).
  const firstWord = (body.split(/\s+/)[0] || '').toLowerCase();
  const ADMIN_ONLY = ['acc', 'tolak', 'stok', 'kirim'];
  if (body.startsWith('/') || ADMIN_ONLY.includes(firstWord)) {
    return reply('⛔ Perintah admin hanya berlaku di chat pribadi ya.');
  }

  // Sapaan / menu
  if (['halo', 'hallo', 'hai', 'hi', 'p', 'assalamualaikum', 'menu', 'start', 'mulai', '0', 'allmenu'].includes(t)) {
    return reply(groupMainMenuText(config.botName));
  }
  if (['help', 'bantuan', 'bantu', '?'].includes(t)) {
    return reply(groupHelp(config.botName));
  }
  if (['katalog', 'katalog produk', 'produk', 'pricelist', 'listproduk', '1'].includes(t)) {
    const ps = getProducts().filter(p => p.active !== false);
    if (!ps.length) return reply('📭 Katalog masih kosong. Coba lagi nanti ya.');
    return reply(groupCatalogText());
  }
  if (['caraorder', 'cara order', 'cara pesan', 'order', 'beli', 'checkout', 'bayar', 'keranjang', 'cart', 'status', '2', '3', '4'].includes(t)) {
    return reply(groupRedirectText());
  }

  // Detail produk: "detail P01" / "P01". Terima ID apa pun agar bisa beri pesan jelas.
  let mDetail = /^(?:#?detail|info|lihat)\s+(.+)$/i.exec(body);
  if (mDetail) {
    const p = findProduct(mDetail[1].trim());
    if (!p) return reply(`❌ Produk *${mDetail[1].trim()}* tidak ditemukan.\nKetik *${config.groupPrefix || '.'}katalog* untuk lihat daftar produk.`);
    return reply(groupProductText(p.id));
  }
  if (/^P\d+$/i.test(body)) {
    const p = findProduct(body.toUpperCase());
    if (!p) return reply('❌ Produk tidak ditemukan. Ketik *katalog*.');
    return reply(groupProductText(p.id));
  }

  // Fallback di grup: arahkan ke menu/chat pribadi (jangan bising).
  return reply(groupHelp(config.botName));
}
