import fs from 'fs';
import { config } from '../config.js';
import { invoiceText, adminOrderText } from './menus.js';
import { resolveJid } from './lids.js';

function fwdLog(line) {
  console.log(line);
  try { fs.appendFileSync('./bot.log', `[${new Date().toISOString()}] ${line}\n`); } catch {}
}
import { generateStruk } from './struk.js';

// Kirim invoice + gambar QRIS statis + STRUK belanja ke pelanggan (pola SC)
export async function sendInvoice(sock, order, quoted) {
  const caption = invoiceText(order, config.botName, config.storeName) +
    `\n\n🏦 *${config.qrisLabel}* (scan gambar di bawah)`;

  const imgPath = config.qrisImage;
  const opt = quoted ? { quoted } : undefined;
  if (fs.existsSync(imgPath)) {
    await sock.sendMessage(order.userJid, {
      image: fs.readFileSync(imgPath),
      caption,
    }, opt);
  } else {
    await sock.sendMessage(order.userJid, {
      text: caption + `\n\n⚠️ (QRIS belum dipasang — admin hubungi pembeli. Simpan QRIS di ${imgPath})`,
    }, opt);
  }

  // Struk belanja (gambar) — seperti SC, lalu file sementara dihapus
  try {
    const strukPath = await generateStruk(order);
    await sock.sendMessage(order.userJid, {
      image: fs.readFileSync(strukPath),
      caption: `🧾 *STRUK PESANAN (${order.id})*\nStatus: *menunggu verifikasi admin*.\nKirim bukti bayar QRIS di atas ke chat ini ya 🙏`,
    }, opt);
    fs.unlinkSync(strukPath);
  } catch (e) {
    console.error('[struk] gagal dibuat/dikirim:', e.message);
  }
}

// Teruskan bukti bayar (foto) ke semua admin — pola SC: forward foto + caption,
// admin balas dengan perintah teks (terima/tolak), tanpa buttons.
// JID admin dipakai hasil belajar (@lid bila sudah dikenal) + hasil dicatat di log.
export async function forwardProofToAdmins(sock, order, proofMsg) {
  const results = [];
  for (const adm of config.adminNumbers) {
    const jid = resolveJid(adm);
    try {
      // teruskan foto bukti
      const fwd = await sock.sendMessage(jid, { forward: proofMsg });
      await sock.sendMessage(jid, { text: adminOrderText(order) });
      fwdLog(`[FORWARD] bukti ${order.id} -> admin ${adm} (${jid}) id=${fwd.key?.id} OK`);
      results.push({ adm, jid, ok: true });
    } catch (e) {
      fwdLog(`[FORWARD] bukti ${order.id} -> admin ${adm} (${jid}) GAGAL: ${e.message}`);
      results.push({ adm, jid, ok: false, error: e.message });
    }
  }
  return results;
}
