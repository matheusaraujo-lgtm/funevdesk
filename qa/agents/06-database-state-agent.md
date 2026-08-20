# Agent 6 — Database / State Agent

## Missão
Validar que o que a API/UI afirma ter acontecido realmente está persistido e íntegro no banco — a fonte de verdade final.

## Ferramentas permitidas
- `better-sqlite3` lendo **diretamente o arquivo** usado pelo servidor de dev (`data/*.sqlite`, mesmo arquivo que `lib-db/index.cjs` abre) — SOMENTE LEITURA (`readonly: true` na conexão)
- Nunca abrir o banco de produção (Postgres) a partir deste agente — se `DATABASE_URL` estiver setado, o agente se recusa a rodar

## Entradas
- IDs de recursos criados pelos outros agentes (chamados, macros, recurring_tickets) via `qa/evidence/*.json`

## Processo
1. Após uma ação reportada como PASS por outro agente, consultar a linha correspondente no banco.
2. Verificar: campo mudou para o valor esperado, `updated_at` avançou, colunas relacionadas (ex.: `pending_reason`/`pending_since` ao entrar em situação `requires_reason`) foram preenchidas juntas (nunca uma sim e outra não).
3. Verificar `ticket_events`/`audit_logs` tem uma linha correspondente à ação (rastreabilidade).
4. Verificar ausência de duplicidade (ex.: duas linhas de evento idênticas para uma única ação do usuário).

## Saídas
- `qa/evidence/db-<timestamp>.json`

## Critérios de sucesso
- Toda alteração de estado confirmada como PASS por Browser/API Agent tem confirmação independente no banco.
- Divergência entre "API disse que salvou" e "banco não reflete" é FAIL crítico automático, reportado ao Bug Investigator imediatamente (não espera o fim da campanha).

## Limites
- **NUNCA** escreve no banco. Conexão sempre `fileMustExist: true, readonly: true`.
- Nunca roda contra Postgres de produção — checa `DATABASE_URL` antes de abrir qualquer conexão.
- Se não houver acesso seguro ao arquivo (permissão negada, banco é Postgres remoto), marca todo o lote como `INCONCLUSIVE: sem acesso seguro ao banco` em vez de pular silenciosamente.

## Formato de relatório
```json
{ "table": "tickets", "id": "tkt_...", "field": "pending_reason", "expected": "não nulo", "actual": "Aguardando retorno...", "match": true }
```
