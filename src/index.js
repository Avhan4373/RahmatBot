import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { config } from '../config.js';
import { handleMessage } from './handler.js';
import { handleGroupParticipants } from './group.js';
import { enforceLicense, startHeartbeat } from './license.js';

const logger = pino({ level: 'warn' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// libsignal (dipakai Baileys) mencetak "Closing session: {…}" yang sangat panjang
// via console.info setiap kali sesi grup ditutup. Tidak berbahaya, tapi membanjiri
// terminal. Kita saring khusus baris ini (log kita sendiri pakai console.log).
const _origInfo = console.info.bind(console);
console.info = (...args) => {
  const first = args[0];
  if (typeof first === 'string' && first.startsWith('Closing session')) return;
  _origInfo(...args);
};

// Log aktivitas ke console + bot.log (untuk diagnosa: pesan masuk, balasan, error)
export function logLine(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
  console.log(line);
  try { fs.appendFileSync('./bot.log', line + '\n'); } catch {}
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] }));

  // Cache metadata grup: WAJIB untuk kirim ke grup agar tidak request ulang tiap
  // pesan (mencegah timeout/rate-limit). Diperbarui dari event grup di bawah.
  const groupCache = new Map();
  const cacheSet = (id, meta) => { if (id && meta) groupCache.set(id, meta); };

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: !config.usePairingCode,
    browser: [config.botName, 'Chrome', '1.0'],
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
  });

  // Sadap pengiriman pesan untuk log diagnosa (tipe pesan keluar tercatat di bot.log)
  const origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (jid, content, opt) => {
    logLine('[OUT send]', jid, Object.keys(content || {}).join(','));
    const r = await origSend(jid, content, opt);
    logLine('[SENT-ID]', jid, r?.key?.id || '?');
    return r;
  };
  const origRelay = sock.relayMessage.bind(sock);
  sock.relayMessage = async (jid, message, opt) => {
    logLine('[OUT relay]', jid, Object.keys(message || {}).join(','));
    const r = await origRelay(jid, message, opt);
    logLine('[SENT-ID]', jid, (opt && opt.messageId) || '?');
    return r;
  };

  // Pairing code (tanpa scan QR): nomor bot di .env PHONE_NUMBER.
  // requestPairingCode butuh koneksi terbuka — tunggu sebentar setelah socket dibuat.
  if (config.usePairingCode && !sock.authState.creds.registered) {
    if (!config.phoneNumber) {
      console.log('⚠️  Isi PHONE_NUMBER di .env untuk login pairing code, atau set USE_PAIRING_CODE=false untuk QR.');
    } else {
      await sleep(3000); // beri waktu socket connect dulu (hindari 428)
      try {
        const code = await sock.requestPairingCode(config.phoneNumber);
        console.log(`\n🔑 Pairing code untuk ${config.phoneNumber}: ${code}`);
        console.log('SEGERA masukkan di HP (berlaku ~60 detik):');
        console.log('WA > Pengaturan > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon.\n');
      } catch (e) {
        console.error('Gagal minta pairing code:', e.message, '(tunggu 10 detik, bot mencoba lagi)');
      }
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr && !config.usePairingCode) qrcode.generate(qr, { small: true });
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      logLine('[CONN] close, kode:', code);
      if (code === DisconnectReason.loggedOut) {
        console.log('❌ Logged out — hapus auth_info otomatis & minta login ulang...');
        try {
          fs.rmSync('./auth_info', { recursive: true, force: true });
          console.log('🧹 Folder auth_info dihapus. Menyiapkan login ulang...');
        } catch (e) {
          console.error('Gagal hapus auth_info:', e.message);
        }
        await sleep(3000);
        start();
        return;
      }
      // Backoff: jangan reconnect membabi-buta (bisa kena rate-limit → 401).
      // Selama pairing (belum registered), tunggu lebih lama agar user sempat input kode.
      const pairing = !sock.authState.creds.registered;
      await sleep(pairing ? 15000 : 5000);
      start();
    }
    if (connection === 'open') logLine('[CONN] ✅ ' + config.botName + ' terhubung!');
    if (connection === 'connecting') logLine('[CONN] connecting...');
  });

  // Pelacak status pengiriman: SERVER_ACK = sampai ke server WA,
  // DELIVERY_ACK = sampai ke HP penerima, READ = dibaca.
  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates || []) {
      if (update?.status != null) {
        logLine('[ACK]', key.remoteJid, key.id, 'status=' + update.status);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        const keys = msg.message ? Object.keys(msg.message).join(',') : '(no-message)';
        const preview = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').slice(0, 80);
        logLine('[IN]', msg.key.remoteJid, 'fromMe=' + !!msg.key.fromMe, 'type=' + keys, 'text=' + preview);
        await handleMessage(sock, { messages: [msg] });
        logLine('[HANDLED]', msg.key.remoteJid);
      } catch (e) {
        logLine('[HANDLER ERROR]', e?.stack || e?.message || e);
      }
    }
  });

  // ===== Sambutan member baru masuk / pamit keluar (khusus grup) =====
  sock.ev.on('group-participants.update', async (ev) => {
    try {
      await handleGroupParticipants(sock, ev);
      // Segarkan cache metadata grup agar pengiriman berikutnya lancar.
      if (ev?.id) {
        sock.groupMetadata(ev.id).then((m) => cacheSet(ev.id, m)).catch(() => {});
      }
    } catch (e) {
      logLine('[GROUP EVENT ERROR]', e?.stack || e?.message || e);
    }
  });

  // ===== Jaga cache metadata grup tetap hangat (untuk kirim ke grup) =====
  sock.ev.on('groups.upsert', (groups) => {
    for (const g of groups || []) cacheSet(g?.id, g);
  });
  sock.ev.on('groups.update', async (updates) => {
    for (const u of updates || []) {
      if (!u?.id) continue;
      try { cacheSet(u.id, await sock.groupMetadata(u.id)); } catch {}
    }
  });
  // Isi cache awal untuk semua grup yang diikuti bot.
  sock.groupFetchAllParticipating?.()
    .then((all) => { for (const g of Object.values(all || {})) cacheSet(g?.id, g); })
    .catch(() => {});

  // jauhkan auto-read agar centang biru tidak otomatis (opsional): biarkan default
}

// ===== Gerbang lisensi sebelum bot jalan =====
// Bila LICENSE_REQUIRED=true dan lisensi tidak valid → proses berhenti.
await enforceLicense({ botName: config.botName });

start().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});

// Heartbeat: server lisensi bisa mematikan bot dari jauh.
startHeartbeat({ botName: config.botName });
