# Matriz de Permissões — resultado real

Gerado em 2026-08-20T01:00:06.944Z

| Perfil | Módulo | Esperado | Real | HTTP | Resultado |
|---|---|---|---|---|---|
| administrador | tickets | — | — | — | INCONCLUSIVE |
| administrador | assets | true | true | 200 | PASS |
| administrador | inventory | true | true | 200 | PASS |
| administrador | terms | true | true | 200 | PASS |
| administrador | problems | true | true | 200 | PASS |
| administrador | changes | true | true | 200 | PASS |
| administrador | projects | true | true | 200 | PASS |
| administrador | knowledge | true | true | 200 | PASS |
| administrador | documentation | true | true | 200 | PASS |
| administrador | printers | — | — | — | INCONCLUSIVE |
| administrador | network | true | true | 200 | PASS |
| administrador | security | true | true | 500 | PASS |
| administrador | teams | true | true | 200 | PASS |
| administrador | reports | true | true | 200 | PASS |
| administrador | audit | true | true | 200 | PASS |
| administrador | settings | true | true | 200 | PASS |
| administrador | branches | true | true | 200 | PASS |
| administrador | locations | true | true | 200 | PASS |
| administrador | users | true | true | 200 | PASS |
| administrador | profiles | true | true | 200 | PASS |
| administrador | ticket_types | — | — | — | INCONCLUSIVE |
| administrador | categories | true | true | 200 | PASS |
| administrador | statuses | true | true | 200 | PASS |
| administrador | term_templates | true | true | 200 | PASS |
| administrador | webhooks | true | true | 200 | PASS |
| administrador | canned_responses | true | true | 200 | PASS |
| administrador | recurring_tickets | true | true | 200 | PASS |
| administrador | remote | — | — | — | INCONCLUSIVE |
| tecnico | tickets | — | — | — | INCONCLUSIVE |
| tecnico | assets | true | true | 200 | PASS |
| tecnico | inventory | true | true | 200 | PASS |
| tecnico | terms | true | true | 200 | PASS |
| tecnico | problems | true | true | 200 | PASS |
| tecnico | changes | true | true | 200 | PASS |
| tecnico | projects | true | true | 200 | PASS |
| tecnico | knowledge | true | true | 200 | PASS |
| tecnico | documentation | true | true | 200 | PASS |
| tecnico | printers | — | — | — | INCONCLUSIVE |
| tecnico | network | true | true | 200 | PASS |
| tecnico | security | true | true | 500 | PASS |
| tecnico | teams | true | true | 200 | PASS |
| tecnico | reports | false | false | 403 | PASS |
| tecnico | audit | false | false | 403 | PASS |
| tecnico | settings | false | false | 403 | PASS |
| tecnico | branches | false | false | 403 | PASS |
| tecnico | locations | false | true | 200 | FAIL |
| tecnico | users | false | true | 200 | FAIL |
| tecnico | profiles | false | false | 403 | PASS |
| tecnico | ticket_types | — | — | — | INCONCLUSIVE |
| tecnico | categories | false | true | 200 | FAIL |
| tecnico | statuses | false | true | 200 | FAIL |
| tecnico | term_templates | false | true | 200 | FAIL |
| tecnico | webhooks | false | false | 403 | PASS |
| tecnico | canned_responses | true | true | 200 | PASS |
| tecnico | recurring_tickets | false | false | 403 | PASS |
| tecnico | remote | — | — | — | INCONCLUSIVE |
| usuario | tickets | — | — | — | INCONCLUSIVE |
| usuario | assets | false | false | 403 | PASS |
| usuario | inventory | false | false | 403 | PASS |
| usuario | terms | false | false | 403 | PASS |
| usuario | problems | false | false | 403 | PASS |
| usuario | changes | false | false | 403 | PASS |
| usuario | projects | false | false | 403 | PASS |
| usuario | knowledge | true | true | 200 | PASS |
| usuario | documentation | false | false | 403 | PASS |
| usuario | printers | — | — | — | INCONCLUSIVE |
| usuario | network | false | false | 403 | PASS |
| usuario | security | false | false | 403 | PASS |
| usuario | teams | false | false | 403 | PASS |
| usuario | reports | false | false | 403 | PASS |
| usuario | audit | false | false | 403 | PASS |
| usuario | settings | false | false | 403 | PASS |
| usuario | branches | false | false | 403 | PASS |
| usuario | locations | false | true | 200 | FAIL |
| usuario | users | false | false | 403 | PASS |
| usuario | profiles | false | false | 403 | PASS |
| usuario | ticket_types | — | — | — | INCONCLUSIVE |
| usuario | categories | false | true | 200 | FAIL |
| usuario | statuses | false | true | 200 | FAIL |
| usuario | term_templates | false | false | 403 | PASS |
| usuario | webhooks | false | false | 403 | PASS |
| usuario | canned_responses | false | false | 403 | PASS |
| usuario | recurring_tickets | false | false | 403 | PASS |
| usuario | remote | — | — | — | INCONCLUSIVE |

## Módulos sem endpoint GET dedicado testável por este script

`tickets` (agregado em /api/dashboard), `printers` (ver BUG-002), `ticket_types` (catálogo intencionalmente público a autenticados), `remote` (por chamado, sem listagem).