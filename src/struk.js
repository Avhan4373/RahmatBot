import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';
import { config, rupiah } from '../config.js';

// Struk belanja ala SC UMKM (canvas): logo opsional, header toko,
// rincian item, total, ucapan terima kasih. Dikirim sebagai gambar PNG.
const W = 380;
const FONT = 'Courier';

function drawLine(ctx, y) {
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(W - 20, y);
  ctx.stroke();
}

// order: { id, items: [{name, qty, price}], total }
export async function generateStruk(order) {
  const d = new Date();
  const tanggal = d.toLocaleDateString('id-ID');
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const nItems = order.items.length;
  const H = 430 + nItems * 45;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  let y = 30;
  const logoPath = './assets/logo.jpg';
  if (fs.existsSync(logoPath)) {
    try {
      const logo = await loadImage(logoPath);
      ctx.save();
      ctx.filter = 'grayscale(100%) contrast(120%) brightness(90%)';
      ctx.drawImage(logo, W / 2 - 50, y, 100, 50);
      ctx.restore();
      y += 70;
    } catch {}
  }

  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText(config.botName.toUpperCase().slice(0, 24), W / 2, y);
  y += 25;
  ctx.font = `14px ${FONT}`;
  ctx.fillText('STRUK PEMBELIAN', W / 2, y);
  y += 30;

  ctx.textAlign = 'left';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('Order ID : ' + order.id, 20, y); y += 18;
  ctx.fillText('Tanggal  : ' + tanggal, 20, y); y += 18;
  ctx.fillText('Jam      : ' + jam, 20, y); y += 25;

  drawLine(ctx, y); y += 15;

  let totalQty = 0;
  let subtotal = 0;
  for (const it of order.items) {
    const sub = it.qty * it.price;
    totalQty += it.qty;
    subtotal += sub;
    ctx.fillText(it.name.toUpperCase().slice(0, 26), 20, y); y += 18;
    ctx.fillText(`${it.qty} x ${rupiah(it.price)}`, 20, y);
    ctx.fillText(rupiah(sub), 250, y); y += 25;
  }

  drawLine(ctx, y); y += 20;
  ctx.fillText('Jumlah Barang : ' + totalQty, 20, y); y += 18;
  ctx.fillText('Subtotal      : ' + rupiah(subtotal), 20, y); y += 18;
  ctx.fillText('Pajak         : ' + rupiah(0), 20, y); y += 20;

  ctx.font = `bold 14px ${FONT}`;
  ctx.fillText('TOTAL         : ' + rupiah(order.total), 20, y); y += 35;

  drawLine(ctx, y); y += 25;
  ctx.textAlign = 'center';
  ctx.font = `13px ${FONT}`;
  ctx.fillText('TERIMA KASIH', W / 2, y); y += 18;
  ctx.fillText('Barang yang sudah dibeli', W / 2, y); y += 16;
  ctx.fillText('tidak dapat dikembalikan', W / 2, y);

  const out = `./struk-${order.id}.png`;
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  return out;
}
