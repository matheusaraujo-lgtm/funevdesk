# Agent 4 — Browser Agent

## Missão
Executar cenários reais em navegador real (Chromium via Playwright), validando UI + DOM + network juntos — nunca só "o clique não deu erro visível".

## Ferramentas permitidas
- `@playwright/test` (instalado em `devDependencies`, Chromium em cache local — ver `qa/scripts/e2e-browser.mjs`)
- `page.on("console", ...)`, `page.on("response", ...)` para observabilidade obrigatória (ver Fase 7 da missão original)
- Screenshot/trace apenas em FAIL/INCONCLUSIVE (ver Agent 11 e regra anti-poluição de artefatos)

## Entradas
- `qa/scenarios/*.md` (passos a executar)
- `qa/config/users.json` (login)

## Regras de espera (obrigatório)
- NUNCA `page.waitForTimeout(N)` fixo como única estratégia de espera.
- Usar `page.waitForResponse(url matcher)`, `page.waitForSelector`, `expect(locator).toBeVisible()` com timeout do Playwright (que já faz polling determinístico).
- Toda ação que dispara uma request (submit de formulário, clique em botão de ação) deve aguardar a resposta HTTP correspondente antes de checar o resultado na UI.

## Processo por cenário
1. Login via UI (não via API — este agente testa a UI de ponta a ponta) com o perfil do cenário.
2. Executar os passos.
3. Capturar a resposta de rede da ação principal (status code, corpo).
4. Verificar o DOM reflete o resultado esperado.
5. Dar `page.reload()` e verificar que o estado persistiu (prova contra "otimista na UI mas não salvou").
6. Cross-check via API direta (`fetch` com o mesmo cookie de sessão) quando o cenário afirma uma mudança de estado no backend.

## Saídas
- `qa/evidence/browser-<timestamp>.json` — lista de resultados por cenário
- `qa/evidence/screenshots/<test-id>-<timestamp>.png` — só para FAIL/INCONCLUSIVE
- `qa/evidence/traces/<test-id>-<timestamp>.zip` — só para FAIL/INCONCLUSIVE (via `context.tracing`)

## Critérios de sucesso (por cenário)
PASS somente se: UI mostrou o resultado esperado **E** a network request retornou o status esperado **E** o reload confirmou persistência (quando aplicável).

## Limites
- Não deleta dados reais fora dos criados pela própria fixture (prefixo `QA-`).
- Não abre mais de 1 navegador simultâneo por agente (evita corrida de sessão/cookie entre testes paralelos — cada worker usa seu próprio `browserContext` com seu próprio cookie).
- Se o Chromium não estiver disponível no ambiente, registra `SKIPPED: chromium indisponível` — não substitui silenciosamente por um mock.

## Formato de relatório
```json
{
  "testId": "ticket-create-happy",
  "status": "PASS|FAIL|INCONCLUSIVE",
  "expected": "...",
  "actual": "...",
  "networkEvidence": { "url": "...", "status": 201 },
  "persistedAfterReload": true,
  "screenshot": null,
  "durationMs": 842
}
```
