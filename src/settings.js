import fs from 'fs';
import path from 'path';

// Pengaturan runtime yang bisa diubah admin lewat chat (tanpa edit .env / restart).
// Disimpan di data/settings.json dan MENIMPA nilai default dari .env.
const FILE = './data/settings.json';

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}
function save(obj) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
  } catch {}
}

let cache = null;
function data() {
  if (!cache) cache = load();
  return cache;
}

// Ambil override; undefined bila tidak diset (biar config pakai default .env).
export function getSetting(key) {
  const v = data()[key];
  return v === undefined || v === null || v === '' ? undefined : v;
}

export function setSetting(key, value) {
  const d = data();
  if (value === undefined || value === null || String(value).trim() === '') delete d[key];
  else d[key] = value;
  save(d);
  return d[key];
}

export function allSettings() {
  return { ...data() };
}

export function clearSetting(key) {
  return setSetting(key, '');
}
