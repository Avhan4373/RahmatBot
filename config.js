import dotenv from 'dotenv';
dotenv.config();

const num = (v, d) => v ? v : d;
export const config = {
  botName: num(process.env.BOT_NAME, 'RahmatBot'),
  adminNumbers: (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map(s => s.trim().replace(/^\+/, '').replace(/\D/g, ''))
    .filter(Boolean),
  phoneNumber: (process.env.PHONE_NUMBER || '').replace(/\D/g, ''),
  usePairingCode: (process.env.USE_PAIRING_CODE || 'true') === 'true',
  qrisImage: process.env.QRIS_IMAGE || './assets/qris.png',
  qrisLabel: process.env.QRIS_LABEL || 'QRIS Statis',

  // ==== Fitur grup ====
  // Bot aktif di grup mana pun ia diundang (default). Set false untuk matikan total.
  groupEnabled: (process.env.GROUP_ENABLED || 'true') === 'true',
  // Di grup, bot hanya merespons bila di-tag/mention, diawali prefix, atau
  // menjawab pesan bot (reply). Prefix default: titik.
  groupPrefix: process.env.GROUP_PREFIX || '.',
  // Whitelist ID grup (kosong = semua grup). Contoh: 1203630xxxx@g.us,1203631yyyy@g.us
  groupWhitelist: (process.env.GROUP_WHITELIST || '')
    .split(',').map(s => s.trim()).filter(Boolean),
  // Sambutan otomatis member baru masuk / pamit saat keluar.
  groupWelcome: (process.env.GROUP_WELCOME || 'true') === 'true',
  // Template sambutan kustom (opsional). Placeholder: {{member}} {{group}} {{bot}}
  groupWelcomeText: process.env.GROUP_WELCOME_TEXT || '',
};

export const toJid = (num62) => `${num62}@s.whatsapp.net`;
export const jidToNum = (jid = '') => jid.split('@')[0].split(':')[0];

export const isAdmin = (jidOrNum) => {
  const n = jidOrNum.includes('@') ? jidToNum(jidOrNum) : jidOrNum.replace(/\D/g, '');
  return config.adminNumbers.includes(n);
};

export const rupiah = (n) =>
  'Rp' + Number(n || 0).toLocaleString('id-ID');
