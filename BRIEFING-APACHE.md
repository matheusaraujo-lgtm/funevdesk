# Briefing para a VPS Apache (helpdesk) — publicar o FunevDesk com TLS

> Decisão: o TLS do FunevDesk termina **neste Apache** (que já é o ponto de
> entrada do NAT :80). Adiciona-se um vhost para `funevdesk.funev.org.br` que faz
> reverse proxy para a app, rodando em **outro servidor**.

## Upstream (servidor da aplicação)
- Host (IP privado, fixo): `172.16.1.38`  ·  Porta: `3000`  ·  HTTP puro
- Domínio público: `funevdesk.funev.org.br` → gateway `177.75.63.98`
- A app só sobe após `server-bootstrap.sh` rodar no `172.16.1.38` (ainda pendente).

## Requisitos críticos do proxy
1. **`X-Forwarded-Proto: https`** — a app usa cookie de sessão `Secure`; sem isso o login NÃO persiste. (Bloqueador, não detalhe.)
2. **Timeout ~360s** — download do agente reempacota sob demanda; senão dá 504.
3. **Sem buffering** — streama binário de ~90 MB.
4. **WebSocket** (`Upgrade`) — precisa `mod_proxy_wstunnel`.
5. **Body 100 MB** — uploads de anexos.

## 1. Habilitar módulos (faltam ssl, headers, proxy_wstunnel)
```bash
sudo a2enmod ssl headers proxy proxy_http proxy_wstunnel rewrite
sudo systemctl reload apache2
```

## 2. vhost — fase A (HTTP só, para o certbot validar)
`/etc/apache2/sites-available/funevdesk.conf`:
```apache
<VirtualHost *:80>
    ServerName funevdesk.funev.org.br
    # SEM redirect ainda — o certbot precisa servir /.well-known/acme-challenge/ em HTTP.
    ProxyPreserveHost On
    ProxyPass        /.well-known/ !
    ProxyPass        / http://172.16.1.38:3000/
    ProxyPassReverse / http://172.16.1.38:3000/
</VirtualHost>
```
```bash
sudo a2ensite funevdesk.conf
sudo apache2ctl configtest && sudo systemctl reload apache2
```

## 3. Emitir o certificado (HTTP-01 pela :80, que já é NATeado)
```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d funevdesk.funev.org.br
```
> O certbot cria o vhost `:443` e oferece adicionar o redirect 80→443 (aceite).
> A validação usa a **:80**, que já funciona — então o cert sai **antes** mesmo do
> NAT :443 existir.

## 4. Ajustar o vhost :443 gerado pelo certbot
Garanta que o `<VirtualHost *:443>` do `funevdesk` contenha:
```apache
<VirtualHost *:443>
    ServerName funevdesk.funev.org.br

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/funevdesk.funev.org.br/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/funevdesk.funev.org.br/privkey.pem

    LimitRequestBody 104857600          # 100 MB

    ProxyPreserveHost On
    ProxyRequests Off

    # WebSocket primeiro (precisa mod_proxy_wstunnel)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/(.*)$ ws://172.16.1.38:3000/$1 [P,L]

    ProxyPass        / http://172.16.1.38:3000/
    ProxyPassReverse / http://172.16.1.38:3000/

    # CRÍTICO: app usa cookie Secure
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port  "443"

    ProxyTimeout 360                    # download/reempacote do agente
    SetEnv proxy-sendchunked 1          # streaming sem bufferizar tudo
</VirtualHost>
```
```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
```

## 5. Pré-requisitos que dependem de você (fora do Apache)
- **NAT `:443` → esta VPS** no gateway `172.16.1.254` (hoje só `:80` é encaminhado).
  Sem isso, `https://funevdesk.funev.org.br` continua recusando conexão externa.
- A **app no ar** em `172.16.1.38:3000` (rodar o bootstrap lá).

## 6. Validação
```bash
curl -v http://172.16.1.38:3000          # nesta VPS: upstream responde? (app no ar)
curl -I https://funevdesk.funev.org.br   # após NAT :443: deve dar 200/302 com TLS
```
