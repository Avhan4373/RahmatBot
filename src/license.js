import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

// =====================================================================
//  LISENSI — gerbang proteksi sebelum bot dijalankan di server orang lain
// =====================================================================
// Cara kerja:
//  1. Bot mengirim LICENSE_KEY + fingerprint mesin ke LICENSE_SERVER.
//  2. Server-mu menjawab { ok, exp, msg, sig }.
//  3. Balasan diverifikasi dengan HMAC (SECRET) agar server palsu ditolak.
//  4. Bila server tak terjangkau, bot pakai cache terakhir (grace period).
//  5. Bila lisensi tidak valid & grace habis → bot MENOLAK jalan.
//
// Catatan jujur: pemilik mesin tetap bisa mem-patch kode (itu sifat JS).
// Modul ini menaikkan effort secara signifikan + kamu bisa MEMATIKAN bot
// dari jauh (hapus/expire key di server lisensi).
// =====================================================================

// SECRET dipakai untuk verifikasi tanda tangan balasan server.
//
// PENTING: saat `npm run build:secure`, nilai di bawah di-"BAKE" ke dalam kode
// ter-obfuscate oleh scripts/build.mjs (lihat __LICENSE_SECRET__/__LICENSE_SERVER__).
// Jadi klien TIDAK perlu (dan tidak seharusnya) menaruh SECRET di .env mereka —
// rahasia tersembunyi di dalam kode ter-obfuscate. Di mode dev (tanpa build),
// baris `typeof` di bawah aman karena identifier-nya tak didefinisikan.
const BAKED_SECRET = typeof __LICENSE_SECRET__ !== 'undefined' ? __LICENSE_SECRET__ : '';
const BAKED_SERVER = typeof __LICENSE_SERVER__ !== 'undefined' ? __LICENSE_SERVER__ : '';
const SECRET = BAKED_SECRET || process.env.LICENSE_SECRET || 'GANTI-DENGAN-SECRET-ACAK-KAMU-9f2a7c';

const CACHE_FILE = './data/.lic';
// Berapa lama bot boleh jalan tanpa berhasil kontak server (jam).
const GRACE_HOURS = Number(process.env.LICENSE_GRACE_HOURS || 72);
// Interval heartbeat (menit). Server bisa "mematikan" bot saat heartbeat gagal-valid.
const HEARTBEAT_MIN = Number(process.env.LICENSE_HEARTBEAT_MIN || 30);

const now = () => Date.now();
const log = (...a) => console.log(`[${new Date().toISOString()}] [LICENSE]`, ...a);

// ---- Fingerprint mesin (stabil di server yang sama) ----
export function fingerprint() {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()?.[0]?.model || '',
    os.totalmem(),
    // machine-id (Linux) bila ada
    (() => { try { return fs.readFileSync('/etc/machine-id', 'utf8').trim(); } catch { return ''; } })(),
  ].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// ---- Verifikasi tanda tangan HMAC balasan server ----
function verifySig(payload, sig) {
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(String(sig)));
  } catch { return false; }
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return null; }
}
function writeCache(obj) {
  try {
    fs.mkdirSync('./data', { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj));
  } catch {}
}

// ---- Panggil server lisensi ----
async function callServer({ key, server, fp, bot }) {
  const body = JSON.stringify({ key, fp, bot, t: now() });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(server.replace(/\/+$/, '') + '/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'rahmatbot-license/1' },
      body,
      signal: ctrl.signal,
    });
    const data = await res.json();
    // Balasan wajib: { ok, exp, msg, sig } dengan sig = HMAC(payloadString)
    const payload = `${data.ok ? 1 : 0}|${data.exp || 0}|${data.msg || ''}`;
    if (!data.sig || !verifySig(payload, data.sig)) {
      return { ok: false, offline: false, msg: 'Balasan server tidak sah (signature invalid).' };
    }
    return { ok: !!data.ok, exp: Number(data.exp || 0), msg: data.msg || '', offline: false };
  } catch (e) {
    return { ok: false, offline: true, msg: 'Server lisensi tidak terjangkau: ' + (e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Validasi utama ----
export async function checkLicense({ botName = 'RahmatBot' } = {}) {
  const key = (process.env.LICENSE_KEY || '').trim();
  // Server: pakai yang di-bake saat build bila ada (klien tak bisa ganti),
  // kalau tidak ada baru baca .env (mode dev).
  const server = (BAKED_SERVER || process.env.LICENSE_SERVER || '').trim();

  // Mode "dev": bila LICENSE_KEY kosong DAN LICENSE_REQUIRED != true → izinkan
  // (supaya kamu bisa mengembangkan lokal tanpa server). Untuk deploy, WAJIB
  // set LICENSE_REQUIRED=true agar tidak bisa dilewati hanya dengan mengosongkan key.
  //
  // PENTING: bila server di-BAKE (build produksi), enforcement DIPAKSA aktif —
  // klien tidak bisa mematikannya lewat LICENSE_REQUIRED=false di .env mereka.
  const required = !!BAKED_SERVER || (process.env.LICENSE_REQUIRED || 'false') === 'true';
  // Mode dev (tidak bake / tidak wajib): lisensi dilewati, agar tidak memaksa
  // pengisian LICENSE_SERVER di tahap development.
  if (!required && (!key || !server)) {
    log('Mode dev (lisensi tidak wajib) → dilewati.');
    return { ok: true, dev: true };
  }
  if (!key && !required) {
    log('LICENSE_KEY kosong & LICENSE_REQUIRED bukan true → mode dev (dilewati).');
    return { ok: true, dev: true };
  }
  if (!key) return { ok: false, msg: 'LICENSE_KEY wajib diisi.' };
  if (!server) return { ok: false, msg: 'LICENSE_SERVER wajib diisi.' };

  const fp = fingerprint();
  const r = await callServer({ key, server, fp, bot: botName });

  if (r.offline) {
    // Grace: pakai cache bila masih dalam batas waktu
    const c = readCache();
    const okCache = c && c.ok && c.exp && c.exp > now();
    const fresh = c && c.checkedAt && (now() - c.checkedAt) < GRACE_HOURS * 3600 * 1000;
    if (okCache && fresh) {
      log(`offline, pakai cache (sisa grace ${Math.round((GRACE_HOURS * 3600e3 - (now() - c.checkedAt)) / 3600e3)} jam).`);
      return { ok: true, cached: true };
    }
    return { ok: false, msg: 'Tidak bisa verifikasi lisensi & cache kadaluarsa.' };
  }

  if (r.ok && (!r.exp || r.exp > now())) {
    writeCache({ ok: true, exp: r.exp || 0, checkedAt: now(), key: key.slice(0, 6) + '***' });
    return { ok: true, exp: r.exp };
  }

  // Server bilang tidak valid / kedaluwarsa
  writeCache({ ok: false, exp: r.exp || 0, checkedAt: now() });
  return { ok: false, msg: r.msg || 'Lisensi tidak valid / kedaluwarsa.' };
}

// ---- Gerbang: panggil sebelum start(); hentikan proses bila gagal ----
export async function enforceLicense({ botName } = {}) {
  const r = await checkLicense({ botName });
  if (r.ok) {
    if (!r.dev) log('Lisensi VALID ✅' + (r.exp ? ` (exp: ${new Date(r.exp).toISOString()})` : ''));
    return true;
  }
  console.error('\n⛔ LISENSI TIDAK VALID — bot dihentikan.');
  console.error('   ' + (r.msg || 'Periksa LICENSE_KEY / LICENSE_SERVER.'));
  console.error('   Hubungi pemilik bot untuk lisensi yang sah.\n');
  process.exit(78); // EX_CONFIG
}

// ---- Heartbeat: server bisa mematikan bot dari jauh ----
export function startHeartbeat({ botName, onInvalid } = {}) {
  const key = (process.env.LICENSE_KEY || '').trim();
  const server = (BAKED_SERVER || process.env.LICENSE_SERVER || '').trim();
  const required = !!BAKED_SERVER || (process.env.LICENSE_REQUIRED || 'false') === 'true';
  if (!required && (!key || !server)) return; // mode dev
  let fails = 0;
  setInterval(async () => {
    const r = await checkLicense({ botName });
    if (r.ok) { fails = 0; return; }
    // Izinkan beberapa kali gagal offline sebelum bertindak (hindari false positive)
    if (r.msg && /tidak terjangkau/i.test(r.msg)) {
      fails++;
      if (fails < 3) return;
    }
    log('Heartbeat: lisensi tidak valid → menghentikan bot.');
    if (typeof onInvalid === 'function') { try { await onInvalid(); } catch {} }
    setTimeout(() => process.exit(78), 500);
  }, Math.max(5, HEARTBEAT_MIN) * 60 * 1000);
}
