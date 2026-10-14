import fs from 'fs';

// Petakan nomor HP <-> JID @lid (privasi WA baru).
// Pesan masuk dari @lid membawa key.senderPn (nomor asli) — simpan agar
// bot bisa MEMBALAS/MENERUSKAN ke alamat @lid yang benar, bukan menebak
// @s.whatsapp.net yang belum tentu terkirim.
const FILE = './data/lids.json';

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function save(m) {
  try { fs.writeFileSync(FILE, JSON.stringify(m)); } catch {}
}

// msg = pesan mentah Baileys. Kembalikan JID pengirim terbaik.
export function learnFromMessage(msg) {
  try {
    const key = msg.key || {};
    const remote = key.remoteJid || '';
    const pn = key.senderPn || key.participantPn || '';
    const lid = key.senderLid || key.participantLid || '';
    const numOf = (j) => (j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
    const map = load();
    let changed = false;
    if (remote.endsWith('@lid') && pn) {
      const n = numOf(pn);
      if (n && map[n] !== remote) { map[n] = remote; changed = true; }
    }
    if (lid && pn) {
      const n = numOf(pn);
      if (n && map[n] !== lid) { map[n] = lid; changed = true; }
    }
    if (changed) save(map);
    return map;
  } catch { return load(); }
}

// Nomor HP (628xx) -> JID terbaik yang dikenal (prioritas @lid hasil belajar)
export function resolveJid(number) {
  const n = String(number || '').replace(/\D/g, '');
  const map = load();
  if (map[n]) return map[n];
  return n + '@s.whatsapp.net';
}

// true bila pengirim adalah admin (bisa dikenali via nomor, @lid, atau senderPn)
export function isAdminJid(jid, key, adminNumbers) {
  const n = jidToNumber(jid, key);
  return adminNumbers.includes(n);
}
export function jidToNumber(jid, key) {
  const numOf = (j) => (j || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (key?.senderPn || key?.participantPn) return numOf(key.senderPn || key.participantPn);
  const map = load();
  for (const [num, lj] of Object.entries(map)) {
    if (lj === jid || lj.split(':')[0] === jid.split(':')[0]) return num;
  }
  return numOf(jid);
}
