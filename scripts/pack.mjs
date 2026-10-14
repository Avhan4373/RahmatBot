import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// =====================================================================
//  PACK — bikin folder siap-kirim ke klien (server orang lain).
// =====================================================================
// Menghasilkan: release/rahmatbot-client/
//   ├── dist/bot.mjs          ← kode ter-obfuscate (SUMBER ASLI TIDAK IKUT)
//   ├── node_modules/         ← dependency (production saja)
//   ├── assets/               ← qris.png, logo
//   ├── data/products.json    ← katalog contoh
//   ├── package.json          ← versi bersih (tanpa script dev)
//   ├── .env                  ← template, tinggal isi
//   ├── README-KLIEN.md       ← cara pakai
//   └── start.sh              ← launcher (opsional)
//
// YANG TIDAK DIKIRIM (rahasia/kode asli):
//   src/, scripts/, license-server/, config.js, .git/, *.log, auth_info/
//
// Jalankan: npm run pack   (otomatis build:secure dulu)
// =====================================================================

const ROOT = process.cwd();
const RELEASE_DIR = path.join(ROOT, 'release');
const PKG_DIR = path.join(RELEASE_DIR, 'rahmatbot-client');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const log = (m) => console.log(m);
const copy = (from, to, { filter } = {}) => {
  if (!fs.existsSync(from)) return;
  fs.cpSync(from, to, { recursive: true, filter });
};

// ---- 0. Build ter-obfuscate dulu ----
log('① Build ter-obfuscate...');
execSync('node scripts/build.mjs', { cwd: ROOT, stdio: 'inherit' });

// ---- 1. Bersihkan & buat struktur ----
log('\n② Menyiapkan folder rilis...');
fs.rmSync(PKG_DIR, { recursive: true, force: true });
fs.mkdirSync(PKG_DIR, { recursive: true });

// dist/ (kode ter-obfuscate)
copy(path.join(ROOT, 'dist'), path.join(PKG_DIR, 'dist'));

// assets/ (qris, logo) — kecuali file upload runtime
copy(path.join(ROOT, 'assets'), path.join(PKG_DIR, 'assets'), {
  filter: (src) => !/qris-upload\.png$/.test(src),
});

// data/ hanya products.json (jangan bawa orders/carts/lids/settings)
fs.mkdirSync(path.join(PKG_DIR, 'data'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'data/products.json'))) {
  fs.copyFileSync(path.join(ROOT, 'data/products.json'), path.join(PKG_DIR, 'data/products.json'));
}

// ---- 2. package.json bersih (tanpa script dev / devDependencies) ----
const clientPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  description: pkg.description,
  type: 'module',
  scripts: {
    start: 'node dist/bot.mjs',
  },
  dependencies: pkg.dependencies,
  engines: pkg.engines,
};
fs.writeFileSync(path.join(PKG_DIR, 'package.json'), JSON.stringify(clientPkg, null, 2));

// ---- 3. .env template untuk klien ----
const envTpl = path.join(ROOT, 'scripts/env.client.example');
if (fs.existsSync(envTpl)) {
  fs.copyFileSync(envTpl, path.join(PKG_DIR, '.env'));
}

// ---- 4. README untuk klien ----
fs.writeFileSync(path.join(PKG_DIR, 'README-KLIEN.md'), `# RahmatBot — Panduan Pasang

Bot WhatsApp auto order produk digital + QRIS statis.

## 1. Isi konfigurasi
Buka file \`.env\` dan isi:
- \`ADMIN_NUMBERS\` → nomor WhatsApp Anda (format 628xx, tanpa + / spasi)
- \`PHONE_NUMBER\`  → nomor WA yang jadi bot (format 628xx)
- \`STORE_NAME\`    → nama toko Anda
- \`LICENSE_KEY\`   → kunci lisensi dari penjual

## 2. Pasang dependency
\`\`\`bash
npm install --omit=dev
\`\`\`

## 3. Jalankan
\`\`\`bash
npm start
\`\`\`
Saat pertama jalan, ikuti instruksi untuk memasukkan **kode pairing** ke
WhatsApp di nomor yang Anda set sebagai \`PHONE_NUMBER\`.

## 4. Ganti QRIS
Ganti file \`assets/qris.png\` dengan QRIS statis milik Anda
(atau kirim foto QRIS ke bot dari nomor admin, dengan caption \`/qris\`).

## 5. Kelola produk
Dari WhatsApp nomor admin, kirim:
- \`.menu\` → menu admin
- \`.produk\` → kelola produk (tambah / edit / hapus / stok)

---
Butuh bantuan? Hubungi penjual.
`);

// ---- 5. Launcher start.sh ----
fs.writeFileSync(path.join(PKG_DIR, 'start.sh'),
  '#!/usr/bin/env bash\ncd "$(dirname "$0")"\nexec node dist/bot.mjs\n');
fs.chmodSync(path.join(PKG_DIR, 'start.sh'), 0o755);

// ---- 6. Opsional: sertakan node_modules production (PACK_WITH_DEPS=true) ----
// Berguna bila server klien sulit meng-compile modul native (canvas).
// Peringatan: harus cocok versi Node dengan server klien.
if (process.env.PACK_WITH_DEPS === 'true') {
  log('\n   → Menyalin node_modules (production)...');
  copy(path.join(ROOT, 'node_modules'), path.join(PKG_DIR, 'node_modules'));
  // Hapus paket dev dari SALINAN (jangan sentuh node_modules asli).
  const devDeps = Object.keys(pkg.devDependencies || {});
  for (const d of devDeps) {
    fs.rmSync(path.join(PKG_DIR, 'node_modules', d), { recursive: true, force: true });
  }
  fs.rmSync(path.join(PKG_DIR, 'node_modules/.bin'), { recursive: true, force: true });
  fs.rmSync(path.join(PKG_DIR, 'node_modules/.cache'), { recursive: true, force: true });
  log(`   ✓ node_modules disertakan (dev dihapus: ${devDeps.join(', ')}).`);
}

// ---- 7. Ringkasan ----
const bytes = (dir) => {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? bytes(p) : fs.statSync(p).size;
  }
  return total;
};
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
log('\n③ Selesai!');
log(`   Folder rilis : release/rahmatbot-client/`);
log(`   Ukuran (tanpa node_modules): ${kb(bytes(PKG_DIR))}`);
log('\n   Isi folder:');
for (const e of fs.readdirSync(PKG_DIR)) log('     • ' + e);
log('\n   YANG TIDAK DISERTAKAN (aman): src/, scripts/, license-server/, config.js');
log('\n   Untuk kirim ke klien: zip folder release/rahmatbot-client/');
