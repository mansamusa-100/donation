#!/usr/bin/env bash
# First-time VPS bootstrap (Ubuntu/Debian on Hetzner). Run as root or with sudo:
#   curl -fsSL ...  OR  bash scripts/bootstrap-hetzner.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Re-run as root: sudo bash scripts/bootstrap-hetzner.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw

# Docker Engine + Compose plugin
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

# Firewall: SSH + HTTP/HTTPS only
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version)"
echo ""
echo "Next:"
echo "  1. Point your domain DNS A record to this server's public IP"
echo "  2. git clone <your-repo> && cd donation && git checkout Deploy"
echo "  3. cp .env.production.example .env.production && nano .env.production"
echo "  4. ./scripts/deploy-hetzner.sh"
