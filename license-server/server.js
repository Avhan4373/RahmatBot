import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// =====================================================================
//  SERVER LISENSI (jalankan di VPS/domain MILIKMU, bukan di server orang)
// =====================================================================
// Menyimpan daftar key & masa aktif, lalu menjawab bot dengan balasan
// bertanda tangan HMAC. Kamu bisa:
//   - membuat lisensi baru  : node license-server/server.js keygen <hari> <nama>
//   - mencabut (matikan)    : node license-server/server.js revoke <KEY>
//   - melihat daftar        : node license-server/server.js list
//
// SECRET harus SAMA dengan LICENSE_SECRET di bot.
// =====================================================================

const SECRET = process.env.LICENSE_SECRET || 'GANTI-DENGAN-SECRET-ACAK-KAMU-9f2a7c';
const PORT = Number(process.env.PORT || 8787);
const DB = process.env.LICENSE_DB || path.join(process.cwd(), 'licenses.json');

const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; } };
const save = (d) => fs.writeFileSync(DB, JSON.stringify(d, null, 2));

const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
const mk = (prefix, len = 20) =>
  prefix + '-' + crypto.randomBytes(len).toString('hex').match(/.{4}/g).slice(0, 4).join('-');

// ---------- CLI ----------
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'keygen') {
  const days = Number(a1 || 30);
  const name = a2 || 'customer';
  const db = load();
  const key = mk('RB');
  db[key] = {
    name,
    created: Date.now(),
    exp: days > 0 ? Date.now() + days * 86400e3 : 0, // 0 = selamanya
    revoked: false,
    lastSeen: null,
    lastFp: null,
  };
  save(db);
  console.log('✅ Lisensi dibuat untuk', name);
  console.log('KEY :', key);
  console.log('EXP :', days > 0 ? new Date(db[key].exp).toISOString() : 'selamanya');
  process.exit(0);
}
if (cmd === 'revoke') {
  const db = load();
  if (!db[a1]) { console.error('❌ Key tidak ditemukan'); process.exit(1); }
  db[a1].revoked = true; save(db);
  console.log('🚫 Dicabut:', a1);
  process.exit(0);
}
if (cmd === 'list') {
  const db = load();
  const rows = Object.entries(db).map(([k, v]) =>
    `${v.revoked ? '🚫' : '✅'} ${k}  ${v.name}  exp=${v.exp ? new Date(v.exp).toISOString() : '∞'}  fp=${v.lastFp || '-'}`);
  console.log(rows.length ? rows.join('\n') : '(belum ada lisensi)');
  process.exit(0);
}

// ---------- HTTP API ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));   // body kecil saja (anti abuse)

// Rate-limit sederhana per IP (anti brute-force key)
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || '?';
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60_000) { rec.n = 0; rec.t = now; }
  rec.n++;
  hits.set(ip, rec);
  if (rec.n > 60) return res.status(429).json({ ok: false, exp: 0, msg: 'Too many requests', sig: '' });
  next();
});

app.post('/api/verify', (req, res) => {
  const { key, fp, bot } = req.body || {};
  const db = load();
  const rec = db[key];
  let ok = false;
  let msg = '';
  let exp = 0;

  if (!rec) { msg = 'Key tidak dikenal.'; }
  else if (rec.revoked) { msg = 'Key dicabut.'; }
  else if (rec.exp && rec.exp < Date.now()) { msg = 'Key kedaluwarsa.'; }
  else { ok = true; exp = rec.exp; msg = 'OK'; }

  if (rec) {
    rec.lastSeen = Date.now();
    rec.lastFp = fp || rec.lastFp;
    rec.lastBot = bot || rec.lastBot;
    save(db);
  }

  const payload = `${ok ? 1 : 0}|${exp || 0}|${msg}`;
  res.json({ ok, exp, msg, sig: sign(payload) });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, t: Date.now() }));
app.get('/', (_req, res) => res.json({ service: 'rahmatbot-license', status: 'up' }));

app.listen(PORT, () => console.log(`🔐 Server lisensi jalan di port ${PORT}`));
