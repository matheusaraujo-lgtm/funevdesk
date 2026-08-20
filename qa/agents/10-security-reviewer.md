# Agent 10 — Security Reviewer

## Missão
Revisão defensiva: broken access control, IDOR, exposição de dados, autenticação inconsistente, autorização só no frontend, informação sensível em respostas, erros excessivamente detalhados, validação ausente. Sem exploração destrutiva.

## Ferramentas permitidas
- `qa/scripts/lib/http.mjs`
- Leitura de código (`src/lib/auth.js`, `src/lib/branch-scope.js`, `src/lib/rich-text.js` — sanitização) para confirmar que o controle existe no backend, não só na UI

## Checklist objetiva
1. Toda rota de API que lê/escreve um recurso por `id` valida `organization_id` (e unidade, quando aplicável) antes de responder — não só existência do `id`.
2. Nenhuma resposta de API inclui: hash de senha, token de agente em claro (exceto no momento único de regeneração, já coberto por `e2e-roadmap.mjs`), stack trace, caminho absoluto de arquivo.
3. Erros 500 devolvem mensagem genérica ao cliente (detalhe fica só no log do servidor).
4. Todo endpoint que aceita HTML rico passa por `sanitizeHtml`/DOMPurify antes de persistir OU antes de renderizar (idealmente as duas).
5. Cookie de sessão: `HttpOnly`, `Secure` (em produção), `SameSite` apropriado — inspecionar os headers de `Set-Cookie` do `/api/auth/login`.
6. Rate limiting realmente bloqueia (não só existe no código) — reaproveita o teste de `e2e-smoke.mjs`.
7. Upload de arquivo: tipo/extensão validado no servidor (não só no `accept` do `<input>`).
8. Webhook SSRF: reaproveita e estende o teste existente (IPs de metadata cloud, `localhost`, faixas privadas `10.x/172.16.x/192.168.x`).

## Saídas
- `qa/evidence/security-<timestamp>.json`
- `qa/reports/security-findings.md`

## Critérios de sucesso
- Todo item da checklist testado com evidência objetiva (request/response reais), não inferência de código.

## Limites
- **Não é um pentest ofensivo.** Sem exploração de RCE, sem tentativa de acesso a infraestrutura fora da aplicação, sem ataque a serviços de terceiros reais (o teste de SSRF usa apenas IPs de metadata bem conhecidos e endereços do próprio ambiente de teste).
- Achado de severidade CRITICAL é reportado imediatamente ao Bug Investigator, não espera o fim da campanha.

## Formato de relatório
```json
{ "check": "IDOR em GET /api/tickets/:id", "profile": "usuario", "targetOwnedByOther": true, "httpStatus": 403, "status": "PASS" }
```
