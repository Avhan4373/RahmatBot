import dotenv from 'dotenv';
import { getSetting } from './src/settings.js';
dotenv.config();

const num = (v, d) => v ? v : d;

// Nilai default dari .env. Sebagian bisa DITIMPA admin lewat chat
// (data/settings.json) tanpa restart — lihat getter di bawah.
const env = {
  botName: num(process.env.BOT_NAME, 'RahmatBot'),
  storeName: num(process.env.STORE_NAME, 'Digital Store'),
  adminNumbers: (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/^\+/, '').replace(/\D/g, ''))
    .filter(Boolean),
  phoneNumber: (process.env.PHONE_NUMBER || '').replace(/\D/g, ''),
  usePairingCode: (process.env.USE_PAIRING_CODE || 'true') === 'true',
  qrisImage: process.env.QRIS_IMAGE || './assets/qris.png',
  qrisLabel: process.env.QRIS_LABEL || 'QRIS Statis',

  // ==== Fitur grup ====
  groupEnabled: (process.env.GROUP_ENABLED || 'true') === 'true',
  groupPrefix: process.env.GROUP_PREFIX || '.',
  groupWhitelist: (process.env.GROUP_WHITELIST || '')
    .split(',').map(s => s.trim()).filter(Boolean),
  groupWelcome: (process.env.GROUP_WELCOME || 'true') === 'true',
  groupWelcomeText: process.env.GROUP_WELCOME_TEXT || '',
};

export const config = {
  // --- bisa diubah admin via chat (getter membaca override runtime) ---
  get botName() { return getSetting('botName') ?? env.botName; },
  get storeName() { return getSetting('storeName') ?? env.storeName; },
  get qrisImage() { return getSetting('qrisImage') ?? env.qrisImage; },
  get qrisLabel() { return getSetting('qrisLabel') ?? env.qrisLabel; },

  // --- hanya dari .env (perlu restart bila diubah) ---
  adminNumbers: env.adminNumbers,
  phoneNumber: env.phoneNumber,
  usePairingCode: env.usePairingCode,
  groupEnabled: env.groupEnabled,
  groupPrefix: env.groupPrefix,
  groupWhitelist: env.groupWhitelist,
  groupWelcome: env.groupWelcome,
  groupWelcomeText: env.groupWelcomeText,
};

export const toJid = (num62) => `${num62}@s.whatsapp.net`;
export const jidToNum = (jid = '') => jid.split('@')[0].split(':')[0];

export const isAdmin = (jidOrNum) => {
  const n = jidOrNum.includes('@') ? jidToNum(jidOrNum) : jidOrNum.replace(/\D/g, '');
  return config.adminNumbers.includes(n);
};

export const rupiah = (n) =>
  'Rp' + Number(n || 0).toLocaleString('id-ID');
