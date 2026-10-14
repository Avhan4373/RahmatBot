import { createHash } from 'crypto';
import fs from 'fs';

// Mekanisme tombol yang dipakai: POLLING + teks bernomor.
// BUKTI dari bot.log: 11x kirim tombol list/interaktif → 0 ACK dari server
// (tidak tampil di HP). 1x kirim polling → ACK status=3 (sampai) + 6 vote
// diterima dari user. Jadi yang dirender WA saat ini hanya polling.

// pollId (message id) -> [{ label, id }], dipersist ke disk agar selamat dari restart
const FILE = './data/polls.json';
const activePolls = new Map();
try {
  const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  for (const [k, v] of Object.entries(saved || {})) activePolls.set(k, v);
} catch {}

function persist() {
  try {
    const obj = {};
    for (const [k, v] of activePolls) obj[k] = v;
    fs.writeFileSync(FILE, JSON.stringify(obj));
  } catch {}
}

const hashOf = (name) => createHash('sha256').update(name).digest().toString();

export async function sendPoll(sock, jid, { name, options }, quoted) {
  // Batas WA: maks 12 opsi per polling
  const list = options.slice(0, 12);
  const sent = await sock.sendMessage(jid, {
    poll: { name, values: list.map(o => o.label), selectableCount: 1 },
  }, quoted ? { quoted } : undefined);
  activePolls.set(sent.key.id, list);
  while (activePolls.size > 200) {
    activePolls.delete(activePolls.keys().next().value);
  }
  persist();
  return sent;
}

// Kembalikan { voter, optionId } dari vote user, atau { unknown: true } bila
// polling tidak dikenal, atau null bila bukan vote.
export function parsePollVote(msg, log) {
  const upd = msg.message?.pollUpdateMessage;
  const sel = upd?.vote?.selectedOptions;
  if (!upd || !sel?.length) return null;
  const pollId = upd.pollUpdateMessageKey?.id;
  const options = activePolls.get(pollId);
  const picked = sel[0].toString();
  if (!options) {
    log?.(`[VOTE] unknown-poll ${pollId} (bot restart sebelum persist? atau polling lain)`);
    return { unknown: true };
  }
  const hit = options.find(o => hashOf(o.label) === picked);
  if (!hit) {
    log?.(`[VOTE] unknown-option di ${pollId}`);
    return { unknown: true };
  }
  log?.(`[VOTE] ${msg.key?.remoteJid} -> ${hit.id}`);
  return { voter: msg.key?.remoteJid, optionId: hit.id };
}
