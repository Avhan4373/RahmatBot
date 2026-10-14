# 🔐 Server Lisensi RahmatBot

Server kecil untuk memverifikasi lisensi bot RahmatBot. **Jalankan di VPS/domain
milikmu sendiri** — JANGAN dikirim ke server klien.

## Instalasi
```bash
cd license-server
npm install
```

## Menjalankan
```bash
# Ganti SECRET dengan string acak (HARUS sama dengan LICENSE_SECRET di bot)
export LICENSE_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export PORT=8787
node server.js
```

Disarankan pakai reverse proxy (nginx/caddy) + HTTPS di depannya, mis.
`https://lisensi.domainmu.com` → `localhost:8787`.

## Kelola lisensi
```bash
node server.js keygen 30 "Toko Si A"     # lisensi 30 hari
node server.js keygen 0  "Toko Si B"     # lisensi selamanya
node server.js revoke RB-xxxx-xxxx-xxxx-xxxx   # cabut (matikan dari jauh)
node server.js list                      # daftar semua lisensi
```

## Environment
| Var | Default | Keterangan |
|---|---|---|
| `PORT` | `8787` | Port server |
| `LICENSE_SECRET` | — | Rahasia HMAC (wajib, sama dgn bot) |
| `LICENSE_DB` | `./licenses.json` | Path file database lisensi |

## API
- `POST /api/verify` — body `{ key, fp, bot }` → balasan bertanda tangan
- `GET /api/health` — cek status

---

## 🚀 Sudah di-deploy di VPS Biznet

| Item | Nilai |
|---|---|
| **URL** | `https://lisensi.avhanapp.my.id` (setelah certbot) |
| **VPS** | `103.127.97.249` (user `avhanvps`, key `~/.ssh/biznetgio`) |
| **Folder** | `/opt/lisensi/server` (user sistem `lisensi`) |
| **Service** | `sudo systemctl {status,restart,stop} lisensi` |
| **Bind** | `127.0.0.1:8787` (hanya Nginx yang akses) |
| **Nginx** | `/etc/nginx/sites-available/lisensi` |
| **DB lisensi** | `/opt/lisensi/server/licenses.json` |

### Kelola lisensi dari komputer lokal (paling praktis)
```bash
cd license-server
bash deploy/lisensi.sh list
bash deploy/lisensi.sh new 30 "Toko Si A"     # 30 hari
bash deploy/lisensi.sh new 0  "Toko Si B"     # selamanya
bash deploy/lisensi.sh revoke RB-xxxx-xxxx-xxxx-xxxx
```

### Deploy ulang / update server lisensi
```bash
cd license-server
bash deploy/deploy.sh "$LICENSE_SECRET"
```

