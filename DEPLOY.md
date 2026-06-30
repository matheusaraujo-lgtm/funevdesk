# Deploy do FunevDesk (produção)

Guia de operação para rodar o FunevDesk em produção com Docker, PostgreSQL e
deploy automático via GitHub Actions.

Domínio de produção: **`https://funevdesk.funev.org.br`**.

## Arquitetura

```
Internet ──HTTPS──> nginx (TLS) ──HTTP──> app Docker (:3000)
                                            │
                          ┌─────────────────┼─────────────────┐
                       postgres            redis           volumes
                     (interno)           (interno)     (uploads, dados)
```

- **nginx** — termina o TLS de `funevdesk.funev.org.br` e faz proxy para o app.
  Pode estar no mesmo host do Docker ou em um servidor separado (ver §2).
- **app** — Next.js 16 (imagem buildada do repo). Os instaladores do agente
  (`public/downloads/agent`) vêm na imagem, versionados via **Git LFS**.
- **postgres** — banco de produção (sem porta exposta no host).
- **redis** — reservado para filas (sem porta exposta no host).
- O app só fala HTTP; quem faz HTTPS é o nginx. A interface onde a porta 3000 é
  publicada é controlada por `APP_BIND` no `.env` (ver §2).

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
`XDR_INGEST_SECRET` aleatórios. Os valores de produção já vêm preenchidos em
[`.env.production.example`](.env.production.example): `AGENT_ALLOWED_SERVER_HOSTS=funevdesk.funev.org.br`,
`SESSION_COOKIE_SECURE=true` e `APP_BIND`. **Revise o `.env`** antes de subir.

Senha inicial do admin (`admin@local`):

```bash
docker compose logs app | grep -A2 "Senha inicial"   # ou veja NEXUS_SEED_PASSWORD no .env
```

## 2. HTTPS no nginx

Em produção o cookie de sessão é `Secure` — **sem HTTPS o login não funciona.** O
nginx termina o TLS de `funevdesk.funev.org.br` e faz proxy para o app.

**Onde o nginx roda muda o `APP_BIND` (no `.env`):**

| Topologia | `APP_BIND` | `proxy_pass` do nginx | Firewall |
|---|---|---|---|
| nginx no **mesmo** host | `127.0.0.1` | `http://127.0.0.1:3000` | porta 3000 não fica exposta |
| nginx em **outro** host | `0.0.0.0` (ou IP privado) | `http://<IP_DO_APP>:3000` | **libere a 3000 só para o IP do nginx** |

> Com o nginx em outro host, restrinja a porta no servidor do app:
> `sudo ufw allow from <IP_DO_NGINX> to any port 3000 proto tcp && sudo ufw deny 3000`

Server block (`/etc/nginx/sites-available/funevdesk.conf`, ative com `ln -s` em
`sites-enabled/` e `nginx -t && systemctl reload nginx`):

```nginx
server {
    listen 80;
    server_name funevdesk.funev.org.br;
    # Redireciona tudo para HTTPS (o desafio do certbot é tratado antes deste bloco).
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name funevdesk.funev.org.br;

    # Certificado: gere com certbot (ver abaixo) ou aponte para o seu.
    ssl_certificate     /etc/letsencrypt/live/funevdesk.funev.org.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/funevdesk.funev.org.br/privkey.pem;

    # Anexos de chamados e logo. O download do instalador do agente é uma RESPOSTA
    # (~90 MB) e não depende disto, mas uploads grandes sim.
    client_max_body_size 100m;

    location / {
        # MESMO host: http://127.0.0.1:3000 | OUTRO host: http://<IP_DO_APP>:3000
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        # O endpoint de download do agente reempacota sob demanda (até 300s no app).
        # Sem timeouts longos o nginx cortaria a conexão (504) antes de terminar.
        proxy_connect_timeout 60s;
        proxy_send_timeout    360s;
        proxy_read_timeout    360s;
        # Streama o binário grande do agente sem bufferizar tudo em disco.
        proxy_buffering off;
    }
}
```

Certificado com Let's Encrypt (nginx no mesmo host do certbot):

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d funevdesk.funev.org.br
```

Pronto: `https://funevdesk.funev.org.br` serve o app com TLS válido e renovação
automática. O agente baixado deste domínio já se reporta a ele e se auto-atualiza
por `https://funevdesk.funev.org.br/downloads/agent/updates`.

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

Os instaladores **só compilam no Windows** — o servidor Linux apenas serve o
binário pronto que vem no repo (via Git LFS). Por isso o `serverUrl` de produção
fica **embutido no build**: gere sempre apontando para o domínio real.

Na máquina Windows:

```bash
# Embute o serverUrl de produção no instalador (obrigatório para o agente
# baixado em prod se reportar ao domínio certo e auto-atualizar via HTTPS).
node scripts/build-agent-electron.mjs --serverUrl https://funevdesk.funev.org.br

git add public/downloads/agent agent-desktop/build-config.json
git commit -m "Agent vX.Y.Z"
git push                     # o Git LFS envia os binários; o deploy reconstrói a imagem
```

> O `serverUrl` também é validado contra `AGENT_ALLOWED_SERVER_HOSTS` no download.
> O **token** não fica embutido no binário versionado: no primeiro start o agente
> pede a chave de enrollment (gerada em *Configurações → Agente Windows*).

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
