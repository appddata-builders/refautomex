#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INFRA_DIR="${REFAUTOMEX_INFRA_DIR:-$PROJECT_DIR/../../../infrastructure-terraform-appddata}"
ADMIN_KEY="${REFAUTOMEX_SSH_KEY:-$HOME/.ssh/appddata_admin}"
LOCAL_PORT="${REFAUTOMEX_DB_PORT:-5433}"

SERVER_IP="$(python3 - "$INFRA_DIR/terraform.tfstate" <<'PY'
import json, sys
with open(sys.argv[1]) as state:
    print(json.load(state)['outputs']['server_ip']['value'])
PY
)"

# Comparte la autenticacion entre la consulta de Docker y el tunel. La IP
# interna puede cambiar cuando se recrea el contenedor de PostgreSQL.
CONTROL_DIR="$(mktemp -d)"
SSH_OPTIONS=(-i "$ADMIN_KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes
  -o ConnectTimeout=10 -o ControlMaster=auto -o ControlPersist=60
  -o "ControlPath=$CONTROL_DIR/ssh")
cleanup() {
  ssh "${SSH_OPTIONS[@]}" -O exit "root@$SERVER_IP" >/dev/null 2>&1 || true
  rm -rf "$CONTROL_DIR"
}
trap cleanup EXIT

DB_IP="$(ssh "${SSH_OPTIONS[@]}" "root@$SERVER_IP" \
  'cd /srv/appddata && docker inspect $(docker compose ps -q postgres) --format "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}"')"
DB_IP="${DB_IP%% *}"
if [[ ! "$DB_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo 'No se pudo obtener la IP de PostgreSQL.' >&2
  exit 1
fi

echo "PostgreSQL disponible en 127.0.0.1:$LOCAL_PORT mientras este comando permanezca abierto."
ssh "${SSH_OPTIONS[@]}" -NT -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
  -L "127.0.0.1:$LOCAL_PORT:$DB_IP:5432" "root@$SERVER_IP"
