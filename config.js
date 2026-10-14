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
};

export const toJid = (num62) => `${num62}@s.whatsapp.net`;
export const jidToNum = (jid = '') => jid.split('@')[0].split(':')[0];

export const isAdmin = (jidOrNum) => {
  const n = jidOrNum.includes('@') ? jidToNum(jidOrNum) : jidOrNum.replace(/\D/g, '');
  return config.adminNumbers.includes(n);
};

export const rupiah = (n) =>
  'Rp' + Number(n || 0).toLocaleString('id-ID');
