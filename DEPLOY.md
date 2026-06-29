# Deploy do FunevDesk (produção)

Guia de operação para rodar o FunevDesk em produção com Docker, PostgreSQL e
deploy automático via GitHub Actions.

## Arquitetura

```
Internet ──HTTPS──> Reverse proxy (Caddy/Nginx) ──HTTP──> app (127.0.0.1:3000)
                                                            │
                                          ┌─────────────────┼─────────────────┐
                                       postgres            redis           volumes
                                     (interno)           (interno)     (uploads, dados)
```

- **app** — Next.js 16 (imagem buildada do repo). Os instaladores do agente
  (`public/downloads/agent`) vêm na imagem, versionados via **Git LFS**.
- **postgres** — banco de produção (sem porta exposta no host).
- **redis** — reservado para filas (sem porta exposta no host).
- O app escuta só em `127.0.0.1:3000`; o TLS é responsabilidade do reverse proxy.

## Pré-requisitos do servidor

- Linux (Debian/Ubuntu recomendado), Docker Engine + plugin `docker compose`
- **Git LFS** (`git-lfs`) — obrigatório, senão o checkout traz arquivos-ponteiro e o download do agente quebra
- Um domínio apontando para o servidor (para HTTPS)

## 1. Primeiro deploy

```bash
# Clonar (precisa de deploy key no repo, pois é privado)
git clone git@github.com:matheusaraujo-lgtm/funevdesk.git /opt/funevdesk
cd /opt/funevdesk

# Bootstrap: instala Docker + Git LFS, gera .env com segredos e sobe a stack
sudo bash scripts/server-bootstrap.sh
```

O bootstrap cria o `.env` com `POSTGRES_PASSWORD`, `NEXUS_SEED_PASSWORD` e
`XDR_INGEST_SECRET` aleatórios. **Edite o `.env`** e ajuste
`AGENT_ALLOWED_SERVER_HOSTS` para o seu domínio. Veja todas as opções em
[`.env.production.example`](.env.production.example).

Senha inicial do admin (`admin@local`):

```bash
docker compose logs app | grep -A2 "Senha inicial"   # ou veja NEXUS_SEED_PASSWORD no .env
```

## 2. HTTPS (reverse proxy)

Em produção o cookie de sessão é `Secure` — **sem HTTPS o login não funciona.**
Exemplo com **Caddy** (TLS automático via Let's Encrypt). Crie `/etc/caddy/Caddyfile`:

```
desk.suaempresa.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo apt install caddy && sudo systemctl reload caddy
```

Pronto: `https://desk.suaempresa.com.br` já serve o app com certificado válido.

## 3. Deploy automático (CI/CD)

A cada push na branch `main`, o workflow
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) conecta no
servidor via SSH, atualiza o código e reconstrói os containers.

**Secrets a cadastrar** em *Settings → Secrets and variables → Actions*:

| Secret | Valor |
|---|---|
| `DEPLOY_HOST` | IP/domínio do servidor |
| `DEPLOY_USER` | usuário SSH |
| `DEPLOY_SSH_KEY` | chave **privada** SSH aceita pelo servidor |
| `DEPLOY_PATH` | caminho do projeto (ex.: `/opt/funevdesk`) |
| `DEPLOY_PORT` | *(opcional)* porta SSH, se não for 22 |

> O servidor precisa de uma **deploy key** cadastrada no repo (*Settings → Deploy keys*)
> para conseguir o `git pull`, já que o repositório é privado.

Deploy manual (fallback): `bash scripts/deploy.sh`

## 4. Atualizar a versão do agente

Os instaladores só compilam no Windows. Na máquina Windows:

```bash
npm run build:agent          # gera os instaladores em public/downloads/agent
git add public/downloads/agent
git commit -m "Agent vX.Y.Z"
git push                     # o Git LFS envia os binários; o deploy reconstrói a imagem
```

> ⚠️ **Cota do Git LFS:** plano grátis do GitHub = 1 GB armazenamento + 1 GB/mês de
> banda. Cada versão consome ~175 MB. Ao se aproximar do limite, compre um *data pack*
> ou remova versões antigas do histórico LFS.

## 5. Backup e restauração

**Backup do banco:**

```bash
docker compose exec -T postgres pg_dump -U nexus nexus_desk | gzip > backup-$(date +%F).sql.gz
```

**Backup dos uploads** (anexos de chamados):

```bash
docker run --rm -v funevdesk_app-uploads:/data -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```

**Restaurar o banco:**

```bash
gunzip -c backup-AAAA-MM-DD.sql.gz | docker compose exec -T postgres psql -U nexus nexus_desk
```

> Agende o backup com cron e mantenha cópias fora do servidor.

## 6. Operações comuns

```bash
docker compose ps                  # status
docker compose logs -f app         # logs do app
docker compose restart app         # reiniciar só o app
docker compose down                # parar tudo (preserva volumes/dados)
docker compose exec postgres psql -U nexus nexus_desk   # acessar o banco
```

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Login não persiste / redireciona pro login | App sem HTTPS (cookie `Secure`) | Coloque o reverse proxy com TLS, ou `SESSION_COOKIE_SECURE=false` (só teste) |
| Download do agente retorna erro/0 byte | Git LFS não baixou no servidor | `git lfs install && git lfs pull` e rebuild |
| `compose up` falha pedindo `POSTGRES_PASSWORD` | `.env` ausente ou sem a senha | Crie o `.env` (rode o bootstrap) |
| Instalador do agente recusa `serverUrl` | Host não autorizado | Inclua seu domínio em `AGENT_ALLOWED_SERVER_HOSTS` |
