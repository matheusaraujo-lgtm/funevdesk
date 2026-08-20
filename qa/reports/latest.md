# AI QA Report — FunevDesk

Gerado em 2026-08-20T01:03:07.633Z

## Summary
**Veredito geral: PASS COM RESSALVAS**

168 PASS · 7 FAIL · 19 INCONCLUSIVE across 5 fases · 0 bug(s) real(is) confirmado(s), 5 classificado(s) como ENVIRONMENT/TEST_BUG/FLAKY (não são bugs da aplicação).

## Environment

- Base URL: http://localhost:3000 (dev, SQLite, seed-demo)
- Perfis: admin@local, tecnico@local, usuario@local (ver qa/config/users.json)
- Navegador: Chromium via Playwright (`@playwright/test`)

## Coverage

| Dimensão | Cobertura |
|---|---|
| Perfis (roles) | 3/3 seed profiles testados diretamente (Administrador, Técnico, Usuário) — Supervisor sem usuário seed, não testado ao vivo |
| Permissões (módulos) | 22/28 módulos com endpoint GET dedicado testados via matriz real; 6 sem endpoint dedicado (ver limitações) |
| Telas do menu (admin) | 27 itens descobertos e abertos |
| Endpoints novos desta sessão (macros, recurring-tickets, pending_reason) | testados por chaos (21 casos) |
| XSS/SSRF/rate-limit/anti-enumeração | cobertos (scripts/e2e-smoke.mjs + e2e-phase3.mjs) |

## Tests

| Fase | PASS | FAIL | INCONCLUSIVE | Evidência |
|---|---|---|---|---|
| browser | 2 | 1 | 1 | `qa\evidence\browser-2026-08-19T23-56-14-679Z.json` |
| chaos | 23 | 0 | 1 | `qa\evidence\chaos-2026-08-20T00-59-45-070Z.json` |
| permissions | 64 | 3 | 17 | `qa\evidence\permissions-2026-08-20T01-00-06-943Z.json` |
| security | 6 | 0 | 0 | `qa\evidence\security-2026-08-19T23-48-41-934Z.json` |
| smoke | 73 | 3 | 0 | `qa\evidence\smoke-2026-08-20T01-01-58-460Z.json` |

## Bugs

| ID | Título | Status | Severidade |
|---|---|---|---|
| BUG-001 | Login de tecnico@local falhava com a senha documentada do seed | ENVIRONMENT (resolvido — não é bug da aplicação) | N/A |
| BUG-002 | 6 dos 28 módulos de permissão não têm enforcement real no backend | FIXED_VERIFIED | HIGH |
| BUG-003 | `users:read` bypassado por flag grosseira; `categories` sem checagem alguma | PARTIALLY_FIXED (users corrigido; categories deixado como está, ver nota) | MEDIUM |
| BUG-004 | Respostas prontas aceitam conteúdo só-espaço (validação roda antes do trim) | FIXED_VERIFIED | LOW |
| BUG-005 | Campanha de QA se auto-bloqueava no rate-limit de login + script e2e-smoke.mjs desatualizado | ENVIRONMENT + TEST_BUG (dois problemas distintos, ambos na infraestrutura de teste — nenhum na aplicação) | N/A |

## Security Findings

Ver BUG-002 e BUG-003 (autorização) — os mais relevantes desta campanha. XSS/SSRF/cookie/IDOR: sem achados (ver fases `security` e `smoke`).

## Permission Findings

Ver `qa/reports/permission-matrix.md` para a matriz perfil × módulo completa, e BUG-002/BUG-003 para os desvios confirmados.

## UX Findings

Não executado nesta campanha (Agent 9 especificado em `qa/agents/09-ux-visual-agent.md`, mas sem tempo de execução nesta 1ª rodada — ver Recomendações).

## Flaky Tests

Nenhum caso reexecutado múltiplas vezes ainda para medir taxa de flakiness (Agent 12 completo pendente de mais execuções ao longo do tempo).

## Evidence

Todos os arquivos brutos em `qa/evidence/*.json`, um por execução de fase, com timestamp no nome.

## Regression Status

Baseline inicial estabelecido nesta campanha (`qa/memory/baseline.json`). Sem execução anterior para comparar ainda — esta É a baseline.

## Uncovered Areas

- Acesso remoto (depende de agente local Windows — binário não disponível neste ambiente).
- Motor de sugestão de IA / DeepSeek (sem `DEEPSEEK_API_KEY` no ambiente de teste).
- LDAP (sem servidor LDAP de teste disponível).
- Conectores XDR pull (Defender/SentinelOne) e ingestão push (sem `XDR_INGEST_SECRET` configurado neste restart do servidor — ver e2e-roadmap.mjs, 3 casos correspondentes).
- UX/Visual Agent (Agent 9) e Browser Agent (Agent 4) em fluxo completo — infraestrutura pronta (Playwright real, confirmado funcionando), mas sem tempo de execução ampla nesta 1ª campanha.
- `create`/`update`/`delete` da matriz de permissões (só `read` foi testado sistematicamente nesta rodada).
- Múltiplas unidades/organizações (seed tem só 1 filial — IDOR entre unidades/orgs não testável sem fixture adicional).

## Recommendations

1. **Prioridade alta:** corrigir BUG-002 (6 módulos de permissão sem enforcement real) — é o achado mais significativo desta campanha.
2. Corrigir BUG-003 (`users:read` e `categories` sem checagem correta).
3. Corrigir BUG-004 (trim antes da validação em respostas prontas) — baixo esforço.
4. Rodar `qa:permissions` estendido para `create`/`update`/`delete`, não só `read`.
5. Rodar Agent 4 (Browser) e Agent 9 (UX) numa próxima campanha — infraestrutura pronta, só falta tempo de execução.
6. Configurar uma 2ª unidade/organização fixture para testar IDOR entre unidades de verdade.
