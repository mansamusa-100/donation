#!/usr/bin/env bash
# Run on the Hetzner VPS from the repo root:
#   chmod +x scripts/deploy-hetzner.sh
#   ./scripts/deploy-hetzner.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production — copy the example and edit secrets:"
  echo "  cp .env.production.example .env.production && nano .env.production"
  exit 1
fi

DOMAIN="$(grep -E '^DOMAIN=' .env.production | head -n1 | cut -d= -f2- | tr -d '\"' | tr -d "'" | tr -d '\r')"
if [[ -z "${DOMAIN}" ]]; then
  echo "DOMAIN is empty in .env.production"
  exit 1
fi

echo "==> Building and starting stack for https://${DOMAIN}"
docker compose --env-file .env.production up -d --build

echo "==> Status"
docker compose --env-file .env.production ps

echo ""
echo "Health (via app container):"
docker compose --env-file .env.production exec -T app \
  node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>r.text()).then(console.log).catch(e=>{console.error(e);process.exit(1)})" \
  || true

echo ""
echo "Done. Open https://${DOMAIN}"
echo "Owner login: OWNER_EMAIL / OWNER_PASSWORD from .env.production"
echo "DPay webhook: https://${DOMAIN}/api/payments/easypay/webhook"
echo "Wave webhook: https://${DOMAIN}/api/payments/wave/webhook"
