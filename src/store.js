import fs from 'fs';
import path from 'path';

const DATA_DIR = './data';
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CARTS_FILE = path.join(DATA_DIR, 'carts.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const f of [PRODUCTS_FILE, ORDERS_FILE, CARTS_FILE]) {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
  }
}
ensure();

const read = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return fallback; }
};
const write = (f, data) => fs.writeFileSync(f, JSON.stringify(data, null, 2));

// ---- Products ----
export const getProducts = () => read(PRODUCTS_FILE, []);
export const saveProducts = (p) => write(PRODUCTS_FILE, p);
export const findProduct = (id) =>
  getProducts().find(p => p.id.toLowerCase() === String(id).toLowerCase());

export function nextProductId() {
  const all = getProducts();
  let max = 0;
  for (const p of all) {
    const m = /^P(\d+)$/i.exec(p.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'P' + String(max + 1).padStart(2, '0');
}

// stok: array of string (akun/kode/voucher). Saat order lunas, shift 1 item.
export function takeStock(productId) {
  const all = getProducts();
  const p = all.find(x => x.id.toLowerCase() === String(productId).toLowerCase());
  if (!p || !Array.isArray(p.stock) || p.stock.length === 0) return null;
  const item = p.stock.shift();
  write(PRODUCTS_FILE, all);
  return item;
}

export function addStock(productId, items) {
  const all = getProducts();
  const p = all.find(x => x.id.toLowerCase() === String(productId).toLowerCase());
  if (!p) return false;
  p.stock = [...(p.stock || []), ...items];
  write(PRODUCTS_FILE, all);
  return true;
}

// ---- Carts: { userJid: [{id, qty}] } stored as [{jid, items}] ----
const readCarts = () => read(CARTS_FILE, []);
export function getCart(jid) {
  const all = readCarts();
  return all.find(c => c.jid === jid)?.items || [];
}
export function setCart(jid, items) {
  let all = readCarts();
  all = all.filter(c => c.jid !== jid);
  if (items.length) all.push({ jid, items });
  write(CARTS_FILE, all);
}
export function clearCart(jid) { setCart(jid, []); }

// ---- Orders ----
export const getOrders = () => read(ORDERS_FILE, []);
export const saveOrders = (o) => write(ORDERS_FILE, o);

export function newOrderId() {
  const d = new Date();
  const s = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORDER-${s}${rand}`;
}

export function createOrder({ userJid, userName, items, total }) {
  const orders = getOrders();
  const order = {
    id: newOrderId(),
    userJid,
    userName: userName || '',
    items, // [{id, name, price, qty}]
    total,
    status: 'MENUNGGU_BAYAR', // MENUNGGU_BAYAR | PENDING_VERIF | LUNAS | DITOLAK | BATAL
    proof: null,
    delivered: null,
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  saveOrders(orders);
  return order;
}

export function findOrder(id) {
  return getOrders().find(o => o.id.toLowerCase() === String(id).toLowerCase());
}

export function updateOrder(id, patch) {
  const orders = getOrders();
  const i = orders.findIndex(o => o.id.toLowerCase() === String(id).toLowerCase());
  if (i === -1) return null;
  orders[i] = { ...orders[i], ...patch };
  saveOrders(orders);
  return orders[i];
}

export function userOrders(jid, limit = 5) {
  return getOrders().filter(o => o.userJid === jid).slice(-limit).reverse();
}

export function pendingPaymentOrder(jid) {
  const list = getOrders().filter(o =>
    o.userJid === jid && ['MENUNGGU_BAYAR', 'PENDING_VERIF'].includes(o.status));
  return list[list.length - 1] || null;
}
