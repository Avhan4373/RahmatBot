#!/usr/bin/env bash
# =====================================================================
#  deploy.sh — pasang server lisensi RahmatBot ke VPS (Ubuntu + Nginx).
#  Jalankan DARI FOLDER license-server/ DI KOMPUTERMU:
#     bash deploy/deploy.sh
#
#  Ubah variabel di bawah bila perlu.
# =====================================================================
set -euo pipefail

# ---- Konfigurasi ----
VPS_USER="avhanvps"
VPS_HOST="103.127.97.249"
SSH_KEY="$HOME/.ssh/biznetgio"
DOMAIN="lisensi.avhanapp.my.id"
REMOTE_DIR="/opt/lisensi"
PORT="8787"
# LICENSE_SECRET: diisi otomatis dari file .env.deploy bila ada, atau arg ke-1.
SECRET="${1:-${LICENSE_SECRET:-}}"
if [ -z "$SECRET" ]; then
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  echo "🔑 LICENSE_SECRET baru: $SECRET"
  echo "   (simpan! masukkan ke .env bot sebagai LICENSE_SECRET)"
fi

SSH="ssh -i $SSH_KEY -o ConnectTimeout=20 $VPS_USER@$VPS_HOST"
SCP="scp -i $SSH_KEY -o ConnectTimeout=20"

echo "① Kirim file server..."
$SSH "sudo mkdir -p $REMOTE_DIR/server && sudo chown -R $VPS_USER:$VPS_USER $REMOTE_DIR"
$SCP server.js package.json package-lock.json "$VPS_USER@$VPS_HOST:$REMOTE_DIR/server/"

echo "② Install dependency di VPS..."
$SSH "cd $REMOTE_DIR/server && npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3"

echo "③ Buat user 'lisensi' + file .env..."
$SSH "sudo id -u lisensi >/dev/null 2>&1 || sudo useradd --system --home $REMOTE_DIR --shell /usr/sbin/nologin lisensi"
$SSH "printf 'LICENSE_SECRET=%s\nPORT=%s\nHOST=127.0.0.1\nLICENSE_DB=%s/server/licenses.json\n' '$SECRET' '$PORT' '$REMOTE_DIR' | sudo tee $REMOTE_DIR/.env >/dev/null && sudo chmod 600 $REMOTE_DIR/.env"
$SSH "sudo chown -R lisensi:lisensi $REMOTE_DIR && sudo chmod 750 $REMOTE_DIR"

echo "④ Pasang systemd service..."
$SCP deploy/lisensi.service "$VPS_USER@$VPS_HOST:/tmp/lisensi.service"
$SSH "sudo cp /tmp/lisensi.service /etc/systemd/system/lisensi.service && sudo systemctl daemon-reload && sudo systemctl enable --now lisensi && sleep 2 && sudo systemctl is-active lisensi && sudo systemctl status lisensi --no-pager | head -6"

echo "⑤ Pasang Nginx reverse proxy..."
$SCP deploy/nginx-lisensi.conf "$VPS_USER@$VPS_HOST:/tmp/nginx-lisensi.conf"
$SSH "sudo cp /tmp/nginx-lisensi.conf /etc/nginx/sites-available/lisensi && sudo ln -sf /etc/nginx/sites-available/lisensi /etc/nginx/sites-enabled/lisensi && sudo nginx -t && sudo systemctl reload nginx"

echo "⑥ Tes lokal di VPS (loopback):"
$SSH "curl -s http://127.0.0.1:$PORT/api/health || echo '(gagal)'"

cat <<EOF

✅ Selesai (kecuali HTTPS/certbot).

LANGKAH TERAKHIR — DNS & HTTPS:
  1. Di Cloudflare (domain avhanapp.my.id), tambahkan A record:
       nama : lisensi
       isi  : $VPS_HOST
       proxy: DNS only (awan abu-abu) agar certbot HTTP-01 bisa lewat.
  2. Setelah DNS aktif (cek: dig +short $DOMAIN), jalankan:
       ssh -i $SSH_KEY $VPS_USER@$VPS_HOST \\
         "sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@avhanapp.my.id"
  3. Tes: curl https://$DOMAIN/api/health

Konfigurasi bot (.env di server klien):
  LICENSE_KEY=<key dari 'node server.js keygen'>
  LICENSE_SERVER=https://$DOMAIN
  LICENSE_REQUIRED=true
  LICENSE_SECRET=$SECRET
EOF
