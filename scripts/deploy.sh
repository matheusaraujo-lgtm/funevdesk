#!/usr/bin/env bash
# Deploy manual no servidor: atualiza o código do git e reconstrói o Docker.
# Uso (no servidor, dentro da pasta do projeto): bash scripts/deploy.sh
set -euo pipefail

echo "==> Atualizando código do git"
git fetch --all
git reset --hard origin/main

echo "==> Reconstruindo e subindo os containers"
docker compose up -d --build --remove-orphans

echo "==> Limpando imagens antigas"
docker image prune -f

echo "==> Status final"
docker compose ps
