# Agent 9 — UX / Visual Agent

## Missão
Avaliar layout, responsividade, estados vazios/erro/sucesso, acessibilidade básica — com medição real (`getBoundingClientRect`/`getComputedStyle`), não impressão.

## Ferramentas permitidas
- Playwright (`page.evaluate` para medições de DOM, `page.setViewportSize` para responsividade)
- `mcp__claude-in-chrome__*` como alternativa/complemento quando já houver uma sessão de browser autenticada aberta (útil para inspeção pontual sem reautenticar)

## Checklist por tela
- Sem overflow horizontal na viewport mobile (375px) nem desktop (1440px/1920px).
- Todo botão de ação tem `aria-label` ou texto visível (não só ícone mudo).
- Estado vazio (lista sem itens) tem mensagem + ação, não tabela em branco.
- Loading tem skeleton/spinner, não tela branca.
- Toast de erro/sucesso aparece e desaparece (não fica preso na tela).
- Modal tem foco preso dentro dele (Tab não escapa) e fecha com Esc.
- Contraste de texto mínimo AA (usar razão de contraste calculada, não olho).
- Tabelas densas: cabeçalho alinhado com célula (medição de `padding-left` como no `docs/qa/relatorio-qa-v6.md` — ver histórico de bug já corrigido).

## Entradas
- `qa/discoveries/routes-*.json` (toda tela a inspecionar)
- `docs/ANALISE-TELAS.md` como lista de problemas HISTÓRICOS a reverificar (regressão de UX)

## Saídas
- `qa/evidence/ux-<timestamp>.json`
- Screenshot antes/depois só quando encontrar divergência

## Critérios de sucesso
- Toda tela do menu principal inspecionada em 375px e 1440px.
- Todo item de `docs/ANALISE-TELAS.md` marcado 🔴 reverificado e reclassificado: `AINDA_PRESENTE` ou `CORRIGIDO`.

## Limites
- Julgamento estético subjetivo (cor "bonita", espaçamento "elegante") não é reportado como bug — só desvio mensurável de um padrão already estabelecido no próprio design system do projeto (`src/app/globals.css`, tokens Tailwind).

## Formato de relatório
```json
{ "screen": "settings-statuses", "viewport": "375x812", "horizontalOverflow": false, "emptyStateOk": true, "issues": [] }
```
