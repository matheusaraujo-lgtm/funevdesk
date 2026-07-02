# Briefing para o servidor NGINX — publicar o FunevDesk

Este nginx já roda outros sistemas e já tem TLS/apontamento externo. A tarefa é
**adicionar um novo virtual host** que faça reverse proxy para a aplicação
FunevDesk, que roda em **outro servidor** (Docker) na rede interna.

## Dados do servidor da aplicação (upstream)
- **Host (IP privado):** `172.16.1.38`
- **Porta:** `3000`
- **Protocolo do upstream:** HTTP puro (o TLS é responsabilidade deste nginx)
- **Domínio público:** `funevdesk.funev.org.br`  ← confirme que é este o domínio
  que aponta para este nginx. Se for outro, avise (precisa bater com o
  `AGENT_ALLOWED_SERVER_HOSTS` do app).

## Requisitos especiais do proxy (NÃO omitir)
1. `client_max_body_size 100m;` — uploads de anexos de chamados.
2. **Timeouts longos (≈360s)** — o endpoint de download do instalador do agente
   reempacota sob demanda; sem isso o nginx corta com 504.
3. `proxy_buffering off;` — streama o binário grande do agente (~90 MB).
4. Header **`X-Forwarded-Proto https`** — o app usa cookie de sessão `Secure`;
   sem esse header o login não persiste.
5. Headers de WebSocket (`Upgrade`/`Connection`).

## Server block sugerido
`/etc/nginx/sites-available/funevdesk.conf` (ativar com symlink em `sites-enabled/`):

```nginx
server {
    listen 80;
    server_name funevdesk.funev.org.br;
    return 301 https://$host$request_uri;   # certbot trata o desafio antes deste bloco
}

server {
    listen 443 ssl http2;
    server_name funevdesk.funev.org.br;

    ssl_certificate     /etc/letsencrypt/live/funevdesk.funev.org.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/funevdesk.funev.org.br/privkey.pem;

    client_max_body_size 100m;

    location / {
        proxy_pass http://172.16.1.38:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_connect_timeout 60s;
        proxy_send_timeout    360s;
        proxy_read_timeout    360s;
        proxy_buffering off;
    }
}
```

## Certificado TLS (se ainda não existir para este domínio)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d funevdesk.funev.org.br
```

## Ativar e validar
```bash
sudo ln -s /etc/nginx/sites-available/funevdesk.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Pré-requisito de rede (conferir antes)
Este nginx precisa **alcançar `172.16.1.38:3000`**. Verifique:
```bash
curl -v http://172.16.1.38:3000   # deve responder (após o app estar no ar)
```
Se não conectar: confirme que os dois servidores estão na mesma rede privada
(`172.16.0.0/23`) e que nenhum firewall bloqueia a porta 3000 entre eles.

> O app só sobe depois de rodar `sudo bash scripts/server-bootstrap.sh` no
> servidor `172.16.1.38`. O `curl` acima só vai responder após isso.
