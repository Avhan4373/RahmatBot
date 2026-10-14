#!/usr/bin/env bash
# =====================================================================
#  lisensi.sh — kelola lisensi di VPS dari komputer lokal (via SSH).
#  Jalankan dari folder license-server/:
#     bash deploy/lisensi.sh list
#     bash deploy/lisensi.sh new 30 "Nama Toko"      # 30 hari
#     bash deploy/lisensi.sh new 0  "Nama Toko"      # selamanya
#     bash deploy/lisensi.sh revoke RB-xxxx-xxxx-xxxx-xxxx
# =====================================================================
set -euo pipefail

VPS_USER="avhanvps"
VPS_HOST="103.127.97.249"
SSH_KEY="$HOME/.ssh/biznetgio"
RMT="/opt/lisensi/server"

CMD="${1:-list}"
shift || true

case "$CMD" in
  list)
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" \
      "sudo bash -c 'cd $RMT && LICENSE_SECRET=\$(grep LICENSE_SECRET /opt/lisensi/.env | cut -d= -f2) LICENSE_DB=$RMT/licenses.json node server.js list'"
    ;;
  new)
    DAYS="${1:-30}"; NAME="${2:-customer}"
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" \
      "sudo bash -c 'cd $RMT && LICENSE_SECRET=\$(grep LICENSE_SECRET /opt/lisensi/.env | cut -d= -f2) LICENSE_DB=$RMT/licenses.json node server.js keygen $DAYS \"$NAME\" && chown lisensi:lisensi licenses.json'"
    ;;
  revoke)
    KEY="${1:?Masukkan KEY yang mau dicabut}"
    ssh -i "$SSH_KEY" "$VPS_USER@$VPS_HOST" \
      "sudo bash -c 'cd $RMT && LICENSE_SECRET=\$(grep LICENSE_SECRET /opt/lisensi/.env | cut -d= -f2) LICENSE_DB=$RMT/licenses.json node server.js revoke $KEY && chown lisensi:lisensi licenses.json'"
    ;;
  *)
    echo "Perintah: list | new <hari> <nama> | revoke <KEY>"
    exit 1
    ;;
esac
