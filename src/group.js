import { config, rupiah } from '../config.js';
import { getProducts, findProduct, soldCount } from './store.js';

// ===== Identitas bot =====
// sock.user bisa berupa {id, lid, jid}. Ambil semua varian nomor (tanpa device ":x")
// agar mention/reply dari HP tetap terdeteksi walau WA memakai @lid.
export function botIdSet(sock) {
  const ids = new Set();
  const add = (j) => {
    if (!j) return;
    const base = String(j).split('@')[0].split(':')[0].replace(/\D/g, '');
    if (base) ids.add(base);
  };
  add(sock?.user?.id);
  add(sock?.user?.lid);
  add(sock?.user?.jid);
  return ids;
}

const numOf = (j) => String(j || '').split('@')[0].split(':')[0].replace(/\D/g, '');

// true bila bot di-@mention di pesan grup
export function isBotMentioned(sock, content = {}) {
  const ids = botIdSet(sock);
  if (!ids.size) return false;
  const mentioned =
    content.extendedTextMessage?.contextInfo?.mentionedJid ||
    content.imageMessage?.contextInfo?.mentionedJid ||
    content.videoMessage?.contextInfo?.mentionedJid ||
    content.documentMessage?.contextInfo?.mentionedJid ||
    [];
  return mentioned.some((j) => ids.has(numOf(j)));
}

// true bila pesan grup adalah BALASAN (reply) ke pesan bot
export function isReplyToBot(sock, content = {}) {
  const ids = botIdSet(sock);
  if (!ids.size) return false;
  const ctx = content.extendedTextMessage?.contextInfo;
  if (!ctx || !ctx.quotedMessage) return false;
  const participants = [ctx.participant, ctx.remoteJid].filter(Boolean);
  return participants.some((j) => ids.has(numOf(j)));
}

// true bila pesan adalah hasil KLIK tombol/list bot (pasti interaksi dgn bot)
export function isInteractiveResponse(content = {}) {
  return !!(
    content.listResponseMessage ||
    content.buttonsResponseMessage ||
    content.templateButtonReplyMessage ||
    content.interactiveResponseMessage
  );
}

// Hapus token mention "@<nomor>" dari teks agar perintah bisa diparse.
export function stripMentions(text = '', content = {}) {
  const ctx =
    content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.documentMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  let out = String(text);
  for (const j of mentioned) {
    const n = numOf(j);
    if (n) out = out.replace(new RegExp('@' + n, 'g'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Grup diizinkan? (fitur aktif + whitelist bila diisi)
export function groupAllowed(jid) {
  if (!config.groupEnabled) return false;
  if (config.groupWhitelist.length && !config.groupWhitelist.includes(jid)) return false;
  return true;
}

// Prefix pemicu di grup: prefix yang dikonfigurasi + "/" (umum dipakai user).
// Return teks tanpa prefix, atau null bila tidak berawalan prefix.
export function stripGroupPrefix(text = '') {
  const p = config.groupPrefix || '.';
  for (const pre of [p, '/']) {
    if (pre && text.startsWith(pre)) return text.slice(pre.length).trim();
  }
  return null;
}

// ===== Konten khusus grup =====
// PENTING: WhatsApp TIDAK mendukung tombol/list interaktif di chat grup
// (server menolak dengan error 479 / smax-invalid). Jadi di grup SEMUA balasan
// memakai TEKS BIASA. Order diarahkan ke chat pribadi.

export function groupRedirectText() {
  const p = config.groupPrefix || '.';
  const wa = config.phoneNumber ? `https://wa.me/${config.phoneNumber}?text=menu` : null;
  return (
`🛒 *CARA ORDER — PANDUAN*

Order & pembayaran dilakukan di *chat pribadi*
biar aman & privasi kamu terjaga 🔒

*Langkah-langkah:*
1️⃣ Buka chat pribadi dengan saya
2️⃣ Pilih produk & ketik *beli <ID>*
3️⃣ Bayar via *QRIS* (nominal pas)
4️⃣ Kirim *foto bukti* bayar
5️⃣ Admin verifikasi → produk dikirim otomatis ✅

${wa ? `👉 *Klik untuk chat pribadi:*\n   ${wa}\n` : ''}
━━━━━━━━━━━━━━━━━━
⛔ Order TIDAK bisa dilakukan di dalam grup ini.
📋 Lihat produk dulu: *${p}katalog*`);
}

export function groupMainMenuText(botName) {
  const p = config.groupPrefix || '.';
  return (
`🤖 *${botName} — PUSAT PRODUK DIGITAL*

Selamat datang! Di grup ini saya menyediakan berbagai
produk digital murah & bergaransi ✅

*📋 MENU:*
┃ 🔍  *${p}katalog*      — lihat semua produk
┃ 🧾  *${p}detail P01*   — rincian 1 produk
┃ 🛒  *${p}caraorder*    — cara beli
┃ ❓  *${p}bantuan*      — panduan

━━━━━━━━━━━━━━━━━━
💬 Order & bayar dilakukan di *chat pribadi* ya
   biar aman & privasi terjaga 🙏`);
}

// Helper: badge stok yang jelas
function stockBadge(p) {
  const n = p.stock?.length ?? 0;
  return n > 0 ? `✅ Ready (${n})` : `⏳ Stok habis`;
}

export function groupCatalogText() {
  const p = config.groupPrefix || '.';
  const ps = getProducts().filter((x) => x.active !== false);
  if (!ps.length) return '📭 Katalog masih kosong. Coba lagi nanti ya 🙏';

  let t =
`🛍️ *KATALOG PRODUK DIGITAL*
_Semua produk READY & BERGARANSI ✅_

Halo 👋 berikut daftar produk yang tersedia.
Lihat detail dengan ketik *${p}detail <ID>* (cth: *${p}detail P01*).

━━━━━━━━━━━━━━━━━━`;

  ps.forEach((prod, i) => {
    const ready = (prod.stock?.length ?? 0) > 0;
    const sold = soldCount(prod.id);
    t +=
`\n╭──────────────
┊・${i + 1}. ${prod.name}
┊・Stok Terjual : ${sold}
╰──────────────
   💰 *${rupiah(prod.price)}* • 📦 ${stockBadge(prod)}
   🔖 ID: *${prod.id}*${ready ? `  ➜ ketik *${p}detail ${prod.id}*` : ''}`;
  });

  t +=
`\n
━━━━━━━━━━━━━━━━━━
💬 *Mau order?*
Order & pembayaran dilakukan di *chat pribadi* ya
biar aman & privasi terjaga 🙏

👉 Ketik *${p}caraorder* untuk panduan lengkap.`;

  return t;
}

export function groupProductText(id) {
  const p = config.groupPrefix || '.';
  const prod = findProduct(id);
  if (!prod) {
    return `❌ Produk *${id}* tidak ditemukan.\nKetik *${p}katalog* untuk lihat daftar produk.`;
  }
  const ready = (prod.stock?.length ?? 0) > 0;
  const sold = soldCount(prod.id);
  const desc = (prod.desc || '').trim() || 'Tidak ada deskripsi.';
  return (
`╭──────────────
┊・Produk : ${prod.name}
┊・Stok Terjual : ${sold}
╰──────────────

${desc}

━━━━━━━━━━━━━━━━━━
🔖 ID Produk : *${prod.id}*
💰 Harga     : *${rupiah(prod.price)}*
📦 Stok      : ${stockBadge(prod)}
${prod.variants?.length ? '\nVarian tersedia:\n' + prod.variants.map((v,i)=>`${i+1}. ${v.name} - ${rupiah(v.price)} (stok ${v.stock?.length ?? 0})`).join('\n') + '\n\n🛒 Cara beli varian:\n3️⃣ Di chat pribadi ketik *beli ${prod.id} <nama varian> <jumlah>*' : ''}

🛒 *CARA ORDER:*
1️⃣ Ketik *${p}caraorder* untuk buka chat pribadi
2️⃣ Di chat pribadi ketik *beli ${prod.id}*
3️⃣ Bayar via QRIS & kirim bukti bayar
4️⃣ Admin verifikasi → produk dikirim otomatis ✅

${ready ? '💡 Produk ini ready, bisa diproses cepat!' : '⚠️ Stok sedang habis, tanya admin dulu ya.'}

➜ Lihat produk lain: *${p}katalog*`);
}

export function groupHelp(botName) {
  const p = config.groupPrefix || '.';
  return (
`❓ *BANTUAN ${botName.toUpperCase()}*

Saya bot penjualan produk digital di grup ini 🤖
Tugas saya: menampilkan katalog & mengarahkan
kamu untuk order dengan aman.

*📋 PERINTAH TERSEDIA:*
┃ 🔍  *${p}katalog*      — semua produk
┃ 🧾  *${p}detail P01*   — rincian produk
┃ 🛒  *${p}caraorder*     — cara beli
┃ 🤖  *${p}menu*         — menu utama

━━━━━━━━━━━━━━━━━━
🔒 *Kenapa order di chat pribadi?*
Supaya data pembayaran & produk kamu aman,
tidak terlihat member grup lain.

💬 Ketik *${p}caraorder* untuk mulai 🙏`);
}

// ===== Sambutan member baru / pamit =====

function pickName(memberJid) {
  return numOf(memberJid) || 'Member';
}

export function welcomeText(memberJid, groupName, botName) {
  const p = config.groupPrefix || '.';
  if (config.groupWelcomeText) {
    return config.groupWelcomeText
      .replaceAll('{{member}}', '@' + pickName(memberJid))
      .replaceAll('{{group}}', groupName)
      .replaceAll('{{bot}}', botName);
  }
  return (
`👋 *Selamat datang* @${pickName(memberJid)} di
*${groupName}*! 🎉

Butuh produk digital murah & bergaransi?
Saya siap bantu 🤖

🔍 Lihat katalog: ketik *${p}katalog*
🛒 Cara order  : ketik *${p}caraorder*

Semoga betah ya 🙏`);
}

export function goodbyeText(memberJid, groupName) {
  return `👋 @${pickName(memberJid)} telah keluar dari *${groupName}*.\nSampai jumpa & terima kasih! 🙏`;
}

// ===== Tangani event member grup (join/leave) =====// ev = { id, author, participants: string[], action: 'add'|'remove'|... }
export async function handleGroupParticipants(sock, ev) {
  const { id: groupJid, participants = [], action } = ev || {};
  if (!groupJid || !groupAllowed(groupJid)) return;
  if (!config.groupWelcome) return;
  if (action !== 'add' && action !== 'remove') return;
  if (!participants.length) return;

  // Jangan sambut bot sendiri saat baru ditambahkan ke grup.
  const botIds = botIdSet(sock);
  const members = participants.filter((m) => !botIds.has(numOf(m)));
  if (!members.length) return;

  // Ambil nama grup (opsional, jangan gagal bila error).
  let groupName = 'Grup';
  try {
    const meta = await sock.groupMetadata(groupJid);
    if (meta?.subject) groupName = meta.subject;
  } catch {}

  for (const member of members) {
    const text =
      action === 'add'
        ? welcomeText(member, groupName, config.botName)
        : goodbyeText(member, groupName);
    try {
      await sock.sendMessage(groupJid, { text, mentions: [member] });
    } catch (e) {
      // Diamkan kegagalan sambutan agar tidak mengganggu alur lain.
    }
  }
}
