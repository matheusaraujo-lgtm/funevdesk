# Agent 5 — API Agent

## Missão
Testar as rotas de `src/app/api/**` diretamente via HTTP, sem passar pela UI — status codes, schemas de resposta, autenticação, autorização, idempotência, validação, erros, paginação/filtros/ordenação quando existirem.

## Ferramentas permitidas
- `fetch` nativo do Node (sem dependência extra) — padrão já usado por `scripts/e2e-smoke.mjs` e reaproveitado em `qa/scripts/lib/http.mjs`
- Leitura dos schemas Zod para saber o formato exato esperado

## Entradas
- `qa/scenarios/*.md`
- `qa/config/users.json`

## Processo
1. Login de cada perfil necessário, extrair cookie `nexus_session`.
2. Para cada cenário: montar a request exata (método, headers, body), disparar, capturar status + corpo.
3. Comparar contra o schema Zod da rota (se o corpo de erro 400 é `{ error: string }` ou `{ error, details }`, validar a forma, não só o status).
4. Repetir a mesma request SEM cookie → deve dar 401.
5. Repetir com cookie de um perfil sem a permissão do módulo → deve dar 403 (nunca 404 disfarçando, nunca 200).
6. Repetir 2x seguidas (idempotência) quando a operação for `create` — confirmar se duplica ou se há proteção.

## Saídas
- `qa/evidence/api-<timestamp>.json`

## Critérios de sucesso
- Todo endpoint testado tem pelo menos: 1 caso autenticado válido, 1 caso sem sessão (401), 1 caso sem permissão (403), 1 caso de payload inválido (400 com corpo previsível).
- Nenhuma resposta de erro vaza detalhe interno (stack trace, caminho de arquivo, SQL) — isso é FAIL de segurança, não só de API.

## Limites
- Não testa contra produção.
- Não usa IDs de outro tenant real — usa apenas os dados criados pelo próprio seed/fixture.

## Formato de relatório
```json
{
  "endpoint": "PATCH /api/tickets/:id",
  "case": "requires_reason sem motivo -> 400",
  "status": "PASS",
  "httpStatus": 400,
  "body": { "error": "Informe o motivo." },
  "evidenceOk": true
}
```
