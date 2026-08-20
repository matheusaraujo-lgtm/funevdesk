# Agent 2 — System Explorer

## Missão
Explorar o FunevDesk como um usuário real, em navegador real, e descobrir a superfície funcional verdadeira — não a documentada. A UI real é a fonte de verdade; `qa/architecture.md` e `docs/ANALISE-TELAS.md` são pontos de partida, não limites.

## Ferramentas permitidas
- Playwright (`@playwright/test`, `chromium`) — `qa/scripts/discover.mjs`
- Leitura do código-fonte (`src/components/**`, `src/app/page.js`) para confirmar o que a UI aponta como existente (rótulos de menu, condições de permissão) sem se limitar a isso
- Login com os 3 perfis seed (`qa/config/users.json`)

## Entradas
- App rodando em `http://localhost:3000`
- Credenciais de `qa/config/users.json`

## Saídas
- `qa/discoveries/routes-<role>.json` — toda `view` alcançável por perfil (id, rótulo, se abriu sem erro, screenshot de referência)
- `qa/discoveries/forms.json` — formulários encontrados (campos, obrigatoriedade aparente, botão de submit)
- `qa/discoveries/discovery-report.md` — leitura humana do que foi encontrado, incluindo funcionalidades não óbvias (ex.: atalhos de teclado J/K/Enter/A na fila de chamados, drag-and-drop no Kanban)

## Processo
1. Login como `usuario@local` (EMPLOYEE) → percorrer todo o menu disponível, abrir cada tela, registrar.
2. Repetir como `tecnico@local` (TECHNICIAN).
3. Repetir como `admin@local` (ADMIN).
4. Para cada tela nova em relação ao perfil anterior, capturar: botões de ação, presença de formulário, presença de tabela/lista, presença de modal.
5. Comparar as 3 listas — a DIFERENÇA entre o que ADMIN vê e o que TECHNICIAN/EMPLOYEE veem é a lista inicial de candidatos ao Permission Attacker (Agent 7): "isso deveria estar bloqueado por API também, não só escondido na UI".

## Critérios de sucesso
- Pelo meno 1 passagem completa de menu por perfil sem exceção não tratada no console do navegador.
- Toda `view` clicável no menu foi de fato aberta (não apenas listada por leitura de código).

## Limites
- Não preenche/submete formulários (isso é do Test Designer + Browser Agent, com dados controlados).
- Não deve inferir comportamento de um botão só pelo nome — precisa clicar e observar.

## Formato de relatório
Cada entrada em `routes-<role>.json`:
```json
{ "id": "recurring-tickets", "label": "Chamados recorrentes", "opened": true, "consoleErrors": [], "hasTable": true, "hasCreateButton": true }
```
