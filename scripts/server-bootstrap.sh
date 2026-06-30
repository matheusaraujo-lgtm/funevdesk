#!/usr/bin/env bash
# ============================================================================
# FunevDesk — Bootstrap do servidor de produção (Debian/Ubuntu)
# Instala Docker + Git LFS, gera o .env com segredos fortes e sobe a stack.
# Idempotente: pode ser rodado várias vezes.
#
# Uso (dentro da pasta do projeto já clonada):
#   sudo bash scripts/server-bootstrap.sh
# ============================================================================
set -euo pipefail

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (sudo bash scripts/server-bootstrap.sh)." >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
log "Projeto: $PROJECT_DIR"

# --- 1. Docker -------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Instalando Docker Engine + plugin compose"
  curl -fsSL https://get.docker.com | sh
else
  log "Docker já instalado: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  warn "Plugin 'docker compose' ausente. Instale o docker-compose-plugin da sua distro."
  exit 1
fi

# --- 2. Git LFS (essencial: instaladores do agente vivem no LFS) -----------
if ! command -v git-lfs >/dev/null 2>&1; then
  log "Instalando Git LFS"
  apt-get update -y && apt-get install -y git-lfs
fi
git lfs install
log "Baixando objetos LFS (instaladores do agente)"
git lfs pull

# --- 3. .env ---------------------------------------------------------------
if [ ! -f .env ]; then
  log "Gerando .env com segredos aleatórios"
  cp .env.production.example .env
  gen() { openssl rand -base64 32 | tr -d '/+=' | head -c 40; }
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|"       .env
  sed -i "s|^NEXUS_SEED_PASSWORD=.*|NEXUS_SEED_PASSWORD=$(gen)|"   .env
  sed -i "s|^XDR_INGEST_SECRET=.*|XDR_INGEST_SECRET=$(gen)|"       .env
  warn "Revise o .env: confirme o domínio (AGENT_ALLOWED_SERVER_HOSTS) e o APP_BIND (127.0.0.1 se o nginx estiver neste host)."
else
  log ".env já existe — mantido como está."
fi

# --- 4. Subir a stack ------------------------------------------------------
log "Construindo e subindo os containers"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

log "Status:"
docker compose ps

cat <<'EOF'

============================================================
Pronto! Próximos passos:
  1. Configure o nginx com TLS para https://funevdesk.funev.org.br (ver DEPLOY.md §2).
  2. Senha inicial do admin (admin@local): veja no log do container ->
       docker compose logs app | grep -A2 "Senha inicial"
     (ou o valor de NEXUS_SEED_PASSWORD no .env)
  3. Troque a senha no primeiro login.
============================================================
EOF
