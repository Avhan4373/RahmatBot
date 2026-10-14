import { config } from '../config.js';
import { catalogText, productDetailText } from './menus.js';

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
  const wa = config.phoneNumber ? `https://wa.me/${config.phoneNumber}?text=menu` : null;
  return (
`🛍️ *ORDER LEWAT CHAT PRIBADI*
Supaya privasi & bukti bayar kamu aman, proses order (keranjang, QRIS, bukti)
dilakukan lewat chat pribadi ya 🙏

${wa ? `👉 Klik: ${wa}\n` : ''}Atau balas *.menu* lalu ikuti arahan.`);
}

export function groupMainMenuText(botName) {
  const p = config.groupPrefix || '.';
  return (
`🤖 *${botName} — KATALOG GRUP*
Saya aktif di grup ini untuk berbagi katalog produk digital 🛍️

*Ketik perintah berikut:*
1️⃣  *${p}katalog* — lihat daftar produk
2️⃣  *${p}detail P01* — detail produk
3️⃣  *${p}caraorder* — cara pesan (chat pribadi)
4️⃣  *${p}bantuan* — bantuan

💬 Order (keranjang, QRIS, bukti bayar) lewat chat pribadi ya.`);
}

export function groupCatalogText() {
  return (
catalogText() +
`\n\n💬 *Order lewat chat pribadi* — ketik *${config.groupPrefix || '.'}caraorder* untuk panduan.`);
}

export function groupProductText(id) {
  return (
productDetailText(id) +
`\n\n💬 Order lewat chat pribadi — ketik *${config.groupPrefix || '.'}caraorder*.`);
}

export function groupHelp(botName) {
  const p = config.groupPrefix || '.';
  return (
`❓ *Bantuan ${botName} (Grup)*

• Tag saya atau ketik *${p}menu* → menu
• *${p}katalog* → daftar produk digital
• *${p}detail P01* → detail produk
• *${p}caraorder* → cara order via chat pribadi

💬 Order (keranjang, QRIS, bukti bayar) dilakukan lewat *chat pribadi*.
⛔ Perintah admin (/acc, /menu, /stok, ...) hanya berlaku di chat pribadi.`);
}

// ===== Sambutan member baru / pamit =====

function pickName(memberJid) {
  return numOf(memberJid) || 'Member';
}

export function welcomeText(memberJid, groupName, botName) {
  if (config.groupWelcomeText) {
    return config.groupWelcomeText
      .replaceAll('{{member}}', '@' + pickName(memberJid))
      .replaceAll('{{group}}', groupName)
      .replaceAll('{{bot}}', botName);
  }
  return (
`👋 Selamat datang @${pickName(memberJid)} di *${groupName}*!

Ketik *${config.groupPrefix || '.'}katalog* atau tag saya untuk lihat produk digital.
Order lewat chat pribadi ya 🙏`);
}

export function goodbyeText(memberJid, groupName) {
  return `👋 @${pickName(memberJid)} telah keluar dari *${groupName}*. Sampai jumpa!`;
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
