import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';

// =====================================================================
//  BUILD PROTEKSI: bundle → obfuscate → dist/
// =====================================================================
// Hanya kode KITA yang di-bundle & di-obfuscate. Semua dependency
// (baileys, canvas, pino, dll) dibiarkan external (tetap di node_modules
// server) agar modul native & dynamic require tidak rusak.
//
// LICENSE_SECRET & LICENSE_SERVER di-"BAKE" ke dalam bundle, sehingga klien
// tidak perlu (dan tidak bisa) melihat/menggantinya lewat .env mereka.
//
// Jalankan: npm run build:secure
// Hasil   : dist/bot.mjs  (yang di-deploy ke server orang)
// =====================================================================

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'dist');
const BUNDLE = path.join(OUT_DIR, 'bot.bundle.mjs');
const FINAL = path.join(OUT_DIR, 'bot.mjs');

// ---- Baca nilai rahasia dari .env / .secrets.local / environment ----
function readEnvFile(p) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const out = {};
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
    return out;
  } catch { return {}; }
}

const envFile = readEnvFile('.env');
const secrets = readEnvFile('license-server/deploy/.secrets.local');
// Lisensi hanya di-"bake" bila diminta eksplisit (production). Saat development
// default-nya TIDAK bake → bot pakai .env (mode dev) agar mudah dites.
const BAKE_LICENSE =
  process.env.BAKE_LICENSE === 'true' || process.env.BAKE_LICENSE === '1';
const LICENSE_SECRET = BAKE_LICENSE
  ? (process.env.LICENSE_SECRET || envFile.LICENSE_SECRET || secrets.LICENSE_SECRET || '')
  : '';
const LICENSE_SERVER = BAKE_LICENSE
  ? (process.env.LICENSE_SERVER || envFile.LICENSE_SERVER || secrets.LICENSE_SERVER || 'https://lisensi.avhanapp.my.id')
  : '';

if (!LICENSE_SECRET || LICENSE_SECRET.startsWith('GANTI')) {
  console.warn('⚠️  LICENSE_SECRET tidak ditemukan / masih default.');
  console.warn('   Set di environment, .env, atau license-server/deploy/.secrets.local');
  console.warn('   (tanpa ini, verifikasi tanda tangan server tidak akan cocok).');
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('① Bundling (deps external + bake lisensi)...');
await build({
  entryPoints: [path.join(ROOT, 'src/index.js')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  packages: 'external',       // semua node_modules tetap external
  outfile: BUNDLE,
  legalComments: 'none',
  minify: false,              // obfuscator yang urus penyamaran
  logLevel: 'warning',
  // Bakar nilai rahasia ke dalam kode (mengganti identifier __LICENSE_*__).
  define: {
    __LICENSE_SECRET__: JSON.stringify(LICENSE_SECRET),
    __LICENSE_SERVER__: JSON.stringify(LICENSE_SERVER),
  },
});

console.log('② Obfuscating...');
const code = fs.readFileSync(BUNDLE, 'utf8');
const result = JavaScriptObfuscator.obfuscate(code, {
  sourceType: 'module',
  compact: true,
  simplify: true,
  // Kontrol alur: bikin alur eksekusi sulit diikuti
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.6,
  // String: sembunyikan semua teks penting (nama file, URL, pesan, SECRET)
  stringArray: true,
  stringArrayThreshold: 1,
  stringArrayEncoding: ['rc4'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayWrappersChainedCalls: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  numbersToExpressions: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  // Anti-tamper: deteksi bila kode diubah
  selfDefending: true,
  debugProtection: false,      // false: hindari blokir debugger agresif
  disableConsoleOutput: false, // kita butuh log sendiri
  // JANGAN ubah string yang dipakai sebagai nama modul (import)
  reservedStrings: [
    '^@whiskeysockets/baileys$',
    '^canvas$',
    '^pino$',
    '^qrcode-terminal$',
    '^dotenv$',
  ],
  seed: 0,
});

fs.writeFileSync(FINAL, result.getObfuscatedCode());
fs.rmSync(BUNDLE, { force: true });

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`③ Selesai: dist/bot.mjs (${kb(fs.statSync(FINAL).size)})`);
console.log(`   LICENSE_SERVER dibakar : ${LICENSE_SERVER}`);
console.log(`   LICENSE_SECRET dibakar : ${LICENSE_SECRET ? 'ya (tersembunyi)' : 'TIDAK ADA ⚠️'}`);
console.log('\nLanjut: npm run pack   (buat folder siap-kirim ke klien)');
