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
// Jalankan: npm run build:secure
// Hasil   : dist/bot.mjs  (yang di-deploy ke server orang)
// =====================================================================

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'dist');
const BUNDLE = path.join(OUT_DIR, 'bot.bundle.mjs');
const FINAL = path.join(OUT_DIR, 'bot.mjs');

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

console.log('① Bundling (deps external)...');
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
  // String: sembunyikan semua teks penting (nama file, URL, pesan)
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
  // JANGAN ubah string yang dipakai sebagai path/kunci penting
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
console.log('\nDeploy: kirim folder project TANPA src/, TAPI dengan dist/, node_modules/, assets/, data/, .env');
console.log('Jalankan: node dist/bot.mjs   (dari root project)');
