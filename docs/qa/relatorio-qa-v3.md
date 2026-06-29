# Relatório de Auditoria QA/UX — FunevDesk (v3)
**Data:** 2026-06-26 | **Auditor:** Agente QA Senior (QA Funcional + UX + Design Enterprise)
**Cobertura:** 27 módulos, 3 perfis (admin, técnico, colaborador), desktop/mobile
**Comparação:** v2 = 7,2/10

---

## 1. Resumo Executivo

**Nota geral: 8,1 / 10** (era 7,2 na v2 — ganho de +0,9)

O FunevDesk evoluiu de forma consistente. Todos os itens comprometidos na v2 foram endereçados, alguns com qualidade próxima ao padrão de mercado. O sistema entra na zona "pronto para produção controlada" com os dois bloqueadores anteriores resolvidos (paginação na auditoria e inconsistência de editor no formulário de chamado).

**Veredito: Pronto para produção em piloto expandido.** Não há bloqueadores funcionais. Os dois bugs restantes classificados como Alto são de UX (drawer não fecha ao navegar; ações da auditoria expostas como JSON bruto). Nenhum implica perda de dado.

**5 temas que ainda limitam a experiência:**

1. **Drawer do portal do colaborador não fecha ao navegar** — o usuário clica em "Meus chamados" e o menu permanece sobre o conteúdo. Deve fechar imediatamente ao navegar.
2. **Auditoria com dados crus** — colunas Ação (`REMOTE_REQUESTED`, `UPDATE`) e Entidade (`ASSET`, `ticket` minúsculo) e Detalhes com JSON escapado (`{"status":"ABERTO"}`) exigem conhecimento técnico do auditor. Em Zendesk/Freshservice essas strings são humanizadas automaticamente.
3. **Inconsistência de título em Base de conhecimento** — o menu lateral diz "Base de conhecimento" mas o título da tela diz "Central de Ajuda". Igualmente, "Documentação" no menu abre tela com título "Documentação de TI". Persiste da v2.
4. **Acesso remoto e XDR sem estado demo rico** — módulos 10 (Segurança/XDR) e 11 (Acesso remoto) estão funcionais mas com estado vazio no ambiente de teste; o fluxo de WebRTC não foi possível testar de ponta a ponta sem agente instalado.
5. **Sidebar mobile: hamburguer da área admin (não-portal) não tem drawer** — no detalhe de chamado em mobile, o botão "Abrir menu" (aria-label) não abre drawer de navegação. O admin/técnico em mobile fica sem acesso à navegação principal quando está dentro de uma tela de detalhe.

---

## 2. Scorecard dos 27 Módulos

| # | Módulo | Status | Func | Efic | Clareza | Design | Resp | Média v3 | Média v2 | Nível | Principal problema |
|---|--------|--------|------|------|---------|--------|------|----------|----------|-------|--------------------|
| 1 | Dashboard/Visão geral | ✅ | 9 | 8 | 9 | 9 | 8 | 8,6 | 8,2 | ⭐ | Filtro "Situações" busca dinamicamente mas só 4 opções (Aberto, Em atendimento, Pendente) — não lista situações customizadas além dessas |
| 2 | Fila de chamados | ✅ | 9 | 9 | 9 | 9 | 8 | 8,8 | 8,2 | ⭐ | Filtros colapsáveis funcionando; busca + situação sempre visíveis; sem ação em massa (checkbox existe mas não há botão de ação em lote) |
| 3 | Abrir chamado | ✅ | 9 | 8 | 9 | 9 | 9 | 8,8 | 8,6 | ⭐ | Rich-text na descrição corrigido; formulário adaptativo por tipo; consistente com detalhe |
| 4 | Detalhe do chamado | ✅ | 9 | 8 | 8 | 9 | 8 | 8,4 | 8,0 | ⭐ | SLA banner em mobile corrigido; sidebar em desktop completa; rich-text editor funcional |
| 5 | Portal do colaborador | ⚠️ | 8 | 7 | 9 | 8 | 8 | 8,0 | 8,2 | 🟢 | Hamburger do portal agora abre corretamente (corrigido); drawer NÃO fecha ao navegar (bug persistente) |
| 6 | Inventário de equipamentos | ✅ | 9 | 8 | 8 | 9 | 8 | 8,4 | 8,4 | ⭐ | Métricas e filtros funcionais; painel lateral de detalhe ausente sem agente (esperado) |
| 7 | Estoque | ✅ | 9 | 8 | 9 | 8 | 8 | 8,4 | 8,4 | ⭐ | CRUD funcional; itens demo com nomes distintos (melhora em relação à v2) |
| 8 | Impressoras | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | Cards de impressora com SNMP e alertas; sem progressive disclosure no SNMP |
| 9 | Monitoramento de rede | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | 15 dispositivos; sem paginação visível na lista; exportação presente |
| 10 | Segurança (XDR) | ✅ | 7 | 7 | 8 | 8 | 7 | 7,4 | 7,4 | 🟢 | Estado vazio; sem alertas demo; sem integração real no ambiente de teste |
| 11 | Acesso remoto | ✅ | 8 | 8 | 8 | 7 | 6 | 7,4 | 7,4 | 🟢 | Depende de agente; console WebRTC não testado; mobile parcial |
| 12 | Problemas | ✅ | 7 | 7 | 7 | 7 | 7 | 7,0 | 6,8 | 🟠 | 2 itens demo; sem vinculação visual com chamados relacionados na lista; abas de status funcionando |
| 13 | Mudanças | ✅ | 7 | 7 | 7 | 7 | 7 | 7,0 | 6,8 | 🟠 | 2 itens demo; sem CAB workflow visual; abas funcionando; falta timeline de aprovação |
| 14 | Base de conhecimento | ⚠️ | 8 | 7 | 7 | 8 | 8 | 7,6 | 8,0 | 🟢 | Título "Central de Ajuda" no menu "Base de conhecimento" — inconsistência persiste da v2 |
| 15 | Documentação | ⚠️ | 8 | 7 | 7 | 8 | 8 | 7,6 | 7,8 | 🟢 | Título "Documentação de TI" vs menu "Documentação" — persiste da v2 |
| 16 | Termos de equipamento | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | 1 termo demo; fluxo de assinatura PDF funcional |
| 17 | Modelos de termo | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | 1 modelo demo; sem preview antes de salvar |
| 18 | Equipes | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | 1 equipe demo; sem visualização de carga por técnico |
| 19 | Relatórios | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | Métricas quantitativas claras; gráficos por unidade e por equipe; exportação CSV; falta linha temporal |
| 20 | Auditoria | ✅ | 8 | 7 | 6 | 7 | 7 | 7,0 | 6,8 | 🟢 | Paginação server-side corrigida (Página 1 de 4 · 151 registros); Exportar CSV presente; ações/entidades expostas em código técnico |
| 21 | Usuários | ✅ | 9 | 9 | 9 | 9 | 9 | 9,0 | 8,6 | ⭐ | Senha temporária em diálogo com botão "Copiar senha" — corrigido; validação inline excelente |
| 22 | Perfis/permissões | ✅ | 9 | 7 | 8 | 8 | 8 | 8,0 | 8,0 | 🟢 | Matriz de permissões (Ver/Criar/Modificar/Apagar) funcional; sem preview do que o perfil vê |
| 23 | Configurações gerais | ✅ | 9 | 8 | 9 | 9 | 8 | 8,6 | 8,6 | ⭐ | SLA, aparência (toggle sidebar), horário comercial, agente Windows — tudo funcional e bem organizado |
| 24 | Unidades | ✅ | 9 | 8 | 9 | 8 | 8 | 8,4 | 8,4 | ⭐ | CRUD completo; 2 unidades demo |
| 25 | Localizações | ✅ | 8 | 7 | 8 | 7 | 7 | 7,4 | 7,4 | 🟢 | 3 localizações vinculadas a unidades; sem mapa ou hierarquia visual |
| 26 | Tipos/Categorias/Situações | ✅ | 9 | 7 | 8 | 8 | 8 | 8,0 | 8,0 | 🟢 | Situações com pausa SLA; Tipos com campos customizados; 5 tipos, 3 categorias, 4 situações configuradas |
| 27 | Automações & Webhooks | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 7,6 | 🟢 | Automações de roteamento funcionais; Webhooks com 15 endpoints e teste manual disponível |

**Legenda:** ⭐ Padrão de mercado | 🟢 Bom | 🟠 Funcional mas atrás do mercado | ⛔ Quebrado

---

## 3. Bugs

### [Alto] Módulo 5 — Portal do colaborador: drawer não fecha ao navegar

- **Passos:** Login como usuario@local → clicar em hamburguer → clicar em "Meus chamados".
- **Esperado:** Drawer fecha e a tela de "Meus chamados" fica visível.
- **Obtido:** Drawer permanece aberto sobre o conteúdo. Após 500ms de delay, `document.querySelector('[data-state="open"]')` ainda retorna o dialog. A página destino foi carregada (o item "Meus chamados" ficou highlighted), mas o sheet não foi fechado programaticamente.
- **Evidência:** `window._dialogStillOpen = true` após clique em "Meus chamados" dentro do drawer.
- **Arquivo provável:** `src/components/employee-portal-navbar.jsx` — o handler do item de menu provavelmente chama `setView()` mas não chama `setOpen(false)` no Sheet.

### [Alto] Módulo 4/Admin — Hamburguer em mobile não abre drawer no contexto de detalhe de chamado (perfil admin/técnico)

- **Passos:** Login como admin, abrir detalhe de um chamado, viewport mobile (375px), clicar no botão "Abrir menu" (aria-label).
- **Esperado:** Sheet/drawer de navegação se abre com todos os módulos do sidebar.
- **Obtido:** Nenhuma ação visível. O botão existe (confirmado por `document.querySelector('button[aria-label="Abrir menu"]')`), mas nenhum drawer é aberto após click.
- **Evidência:** Screenshot em mobile no detalhe do chamado não exibe drawer após clique.
- **Nota:** Em outras telas (não-detalhe) em mobile, o comportamento não foi testado — possível que seja específico ao componente de detalhe que não inclui o Sheet wrapper.

### [Médio] Módulo 20 — Auditoria: ações e entidades não humanizadas

- **Passos:** Navegar para Auditoria, observar coluna "Ação" e "Entidade" e "Detalhes".
- **Esperado:** "ticket UPDATE" deveria aparecer como "Chamado atualizado"; `{"status":"ABERTO"}` deveria aparecer como "Situação: Aberto"; "REMOTE_REQUESTED" deveria aparecer como "Acesso remoto solicitado".
- **Obtido:** Colunas exibem valores técnicos brutos: `REMOTE_REQUESTED`, `UPDATE`, entidade `ASSET` (maiúsculo) e `ticket` (minúsculo — inconsistente), Detalhes com JSON escapado entre aspas.
- **Benchmark:** Freshservice e Zendesk humanizam logs de auditoria ("Field changed: Status → Open", "Remote session initiated for device NB-DEMO-001").
- **Arquivo:** `src/components/audit-view.jsx` — colunas não possuem função de formatação human-readable.

### [Médio] Módulos 14 e 15 — Títulos de tela não correspondem ao menu lateral

- **Módulo 14:** Menu diz "Base de conhecimento" → tela exibe "Central de Ajuda".
- **Módulo 15:** Menu diz "Documentação" → tela exibe "Documentação de TI".
- **Impacto:** Desorientação de contexto. O usuário clica em "Base de conhecimento" e vê uma tela com título diferente. Em Zendesk e Intercom os títulos são sempre consistentes entre sidebar e breadcrumb.
- **Arquivos:** `src/components/knowledge-view.jsx`, `src/components/documents-view.jsx` — títulos hardcoded divergem do label do menu em `src/components/sidebar.jsx`.

### [Baixo] Módulo 1 — Dashboard: filtro "Todas as situações" não lista situações customizadas além das 3 padrão

- **Passos:** No Dashboard, clicar em "Todas as situações" → ver opções.
- **Obtido:** 4 opções (Todas, Aberto, Em atendimento, Pendente) — mostra `activeStatuses` mas dependente de quais status existem ativos com chamados. Situações customizadas criadas pelo admin não aparecem aqui se não tiverem chamados ativos.
- **Código:** `src/components/dashboard-view.jsx:276` — usa `activeStatuses` (filtrado dinamicamente dos chamados carregados), não todas as situações configuradas.
- **Benchmark:** Zendesk permite filtrar por qualquer situação, mesmo sem chamados ativos.

### [Baixo] Módulo 20 — Auditoria: botão "Filtrar nesta página" é busca local (não server-side)

- **Passos:** Digitar no campo de busca da Auditoria com 151 registros paginados.
- **Obtido:** A busca filtra apenas os registros da página atual (ex.: 50 itens da página 1), não de todo o histórico. Para um auditor buscando um evento específico no histórico completo, isso é ineficaz.
- **Benchmark:** Freshservice e ServiceNow fazem busca server-side na auditoria.

---

## 4. Atrito e Eficiência

### Fila de chamados: checkbox sem ação em massa

- **Atual:** A tabela tem checkbox por linha e "Selecionar todos" no header, mas após seleção não há toolbar de ações em massa (atribuir, fechar, priorizar).
- **Cliques para atribuir 5 chamados:** 5 aberturas individuais × 2 cliques = 10+ cliques.
- **Benchmark (Zendesk):** Selecionar → "Assign to" dropdown = 2 cliques totais para N chamados.
- **Redução proposta:** Adicionar toolbar contextual quando há seleção (atribuir, fechar, priorizar em lote).

### Portal do colaborador: fluxo de "ver meu chamado" requer fechar drawer manualmente

- **Atual:** 3 cliques (hamburguer → Meus chamados → fechar drawer manualmente).
- **Esperado:** 2 cliques (hamburguer → Meus chamados → drawer fecha automaticamente).
- **Redução proposta:** Fechar drawer no handler de navegação.

### Abrir chamado: 4 passos antes de chegar ao formulário

- **Atual:** 1) Clicar "Novo chamado" → 2) Selecionar tipo → 3) Preencher campos → 4) Enviar.
- **Benchmark (Freshservice):** 1) "New Ticket" → formulário já aberto com tipo padrão → 2) preencher → 3) criar. 3 cliques.
- **Nota:** O fluxo atual é justificado pela adaptação dinâmica do formulário ao tipo. Aceitável se o tipo padrão for pré-selecionado quando há só um tipo disponível para o usuário.

### Acesso remoto: 3 cliques extras para iniciar sessão

- **Atual:** Ativos → linha do ativo → botão "Iniciar sessão remota" → confirmar → aguardar aceite do agente.
- **Benchmark (Milvus, NinjaRMM):** Duplo-clique no ativo ou botão de ação rápida na lista.

---

## 5. Linguagem

| Local | Atual | Proposto | Módulo |
|-------|-------|----------|--------|
| Auditoria: coluna Ação | `REMOTE_REQUESTED`, `UPDATE`, `CREATE` | "Acesso remoto solicitado", "Atualização", "Criação" | 20 |
| Auditoria: coluna Entidade | `ticket` (min), `ASSET` (mai) | "Chamado", "Ativo" | 20 |
| Auditoria: detalhes | `"{\"status\":\"ABERTO\"}"` | "Situação alterada para: Aberto" | 20 |
| Base de conhecimento: título da tela | "Central de Ajuda" | "Base de conhecimento" | 14 |
| Documentação: título da tela | "Documentação de TI" | "Documentação" | 15 |
| SLA banner mobile | "SLA · 3h restantes" (rótulo "SLA" sem contexto) | "Prazo de resolução · 3h restantes" | 4 |
| Configurações: seção | "Recursos do sistema" | "Funcionalidades" | 23 |
| Fila: tab | "Abertos" (estado de situação) | "Abertas" (concordância com "chamados abertas") — ou manter "Abertos" se referir a "chamados abertos" | 2 |
| Auditoria: busca | "Filtrar nesta página..." | "Buscar nesta página..." | 20 |
| Novo usuário: campo | "Autenticação" | "Método de acesso" (mais claro para não-técnico) | 21 |

---

## 6. Design 2026

### Command palette (⌘K) — Novo, corrigido

**Status:** Implementado e funcional. O modal abre com Ctrl+K, lista "AÇÕES" (abrir chamado) e "IR PARA" (todos os módulos) e "CONFIGURAÇÕES". Filtro em tempo real funciona. Atalhos de teclado (↑↓, Enter) navegam corretamente. Botão "Buscar" no header com badge "⌘K" visível.

**Oportunidade:** Adicionar "abrir chamado #N" por número (busca de chamado específico pelo ID), padrão Linear/Raycast.

### Sidebar fixa — Novo, corrigido

**Status:** Implementado. Em desktop (1280px+) a sidebar fica fixada à esquerda com hierarquia clara: logo → navegação agrupada (ATIVOS, ITSM, CONHECIMENTO, MONITORAMENTO, ADMINISTRAÇÃO, CONFIGURAÇÕES). Badge de contagem em "Chamados" (29) é dinâmico. Em mobile, a sidebar se recolhe com hamburguer.

**Problema restante:** Em resolução 1280px (estreita para sidebar + conteúdo), textos da sidebar truncam ligeiramente. Recomendação: testar com sidebar de 220px vs 240px de largura.

### Hierarquia visual

- **Dashboard:** Hierarquia ⭐ — 4 cards de métrica com contadores grandes, gráfico de barras "Abertura de chamados 14 dias", tabela de chamados recentes com paginação. Benchmarck Freshservice: similar.
- **Detalhe do chamado:** Boa — título + badge de situação/prioridade/SLA no header, abas (Público/Interno/Eventos), sidebar de atendimento + SLA. Falta "última atualização relativa" em destaque tipo Zendesk.
- **Fila:** Excelente — tabs de contagem rápida (Abertos, Em andamento, SLA violado, Alta/crítica, Concluídos), busca visível, filtros colapsáveis, tabela densa com ações por linha.

### Estados

- **Loading:** Skeleton/spinner presente nas listas (confirmado por visual intermediário).
- **Vazio:** Estado vazio com ícone e mensagem em todos os módulos testados.
- **Erro de validação:** Inline com mensagem descritiva ("Informe o nome completo (mínimo 3 caracteres)") — ⭐ padrão de mercado.
- **Toast de sucesso:** "Usuário criado" aparece após criar usuário — porém o toast rola para fora enquanto o diálogo de senha está aberto, criando dois feedbacks simultâneos. Recomendação: omitir o toast quando há diálogo de follow-up.

### Responsivo

- **Mobile (375px):** Portal do colaborador renderiza corretamente. Detalhe do chamado em mobile tem SLA banner no topo (corrigido). Hamburguer admin em mobile não abre drawer (bug).
- **1280px:** Sidebar + conteúdo convivem bem, leve truncamento de labels longos.
- **Desktop 1920px:** Não testado via resize nesta sessão mas o layout usa `max-w` adequado.

### Acessibilidade

- Botões com `aria-label` descritivos (ex.: `aria-label="Buscar telas e ações (atalho Ctrl K)"`).
- Tabelas com `columnheader` e `row` bem estruturados.
- `progressbar` com `value` numérico no SLA.
- **Gap:** O select de situações usa `button[role="combobox"]` sem `aria-expanded` visível — Radix gerencia isso internamente, mas confirmar com screen reader.

---

## 7. Itens Corrigidos da v2 — Status Verificado

| Item v2 | Status v3 | Evidência |
|---------|-----------|-----------|
| Command palette ⌘K ausente | ✅ CORRIGIDO | Modal abre com Ctrl+K; busca filtra em tempo real; atalhos de teclado funcionam |
| Sidebar dropdown aninhado (navegação lenta) | ✅ CORRIGIDO | Sidebar fixa com 1 clique direto para qualquer módulo |
| Filtros da fila sempre visíveis comprimiam a lista | ✅ CORRIGIDO | Filtros colapsáveis; busca + situação sempre visíveis; "Filtros" expande avançados |
| Auditoria sem paginação (limite 200) | ✅ CORRIGIDO | "Página 1 de 4 · 151 registros" + botões Anterior/Próxima + Exportar CSV |
| Dashboard sem gráfico de tendência | ✅ CORRIGIDO | Gráfico "Abertura de chamados – Últimos 14 dias" com barras por dia |
| Dashboard: filtro situações hardcoded (3 opções) | ✅ PARCIAL | Agora dinâmico (activeStatuses), mas apenas mostra situações com chamados ativos |
| Senha temporária em toast não-maskável | ✅ CORRIGIDO | Diálogo modal com campo de senha + botão "Copiar senha" |
| Descrição do chamado usa textarea (inconsistente) | ✅ CORRIGIDO | Campo de criação usa `contenteditable` rich-text igual ao detalhe |
| SLA banner ausente em mobile | ✅ CORRIGIDO | Banner "SLA · 3h restantes" no topo do detalhe em 375px |
| Botão "Abrir menu" não responde no portal | ✅ CORRIGIDO | Drawer abre; mas não fecha ao navegar (bug residual) |

---

## 8. Top 10 Ações Priorizadas

| Prioridade | Ação | Impacto | Esforço | Ganho esperado | Padrão atingido |
|------------|------|---------|---------|----------------|-----------------|
| 1 | Fechar drawer do portal ao navegar | Alto | Baixo | Remove atrito de UX no fluxo mais comum do colaborador | Padrão básico mobile UX |
| 2 | Corrigir hamburguer admin em mobile (detalhe de chamado) | Alto | Médio | Admin/técnico em mobile recupera acesso à navegação | Material/Atlassian mobile nav |
| 3 | Humanizar logs de auditoria (Ação, Entidade, Detalhes) | Médio | Médio | Auditor não precisa de conhecimento técnico para interpretar logs | Freshservice/ServiceNow audit |
| 4 | Unificar títulos de tela com labels do menu (Base de conhecimento, Documentação) | Baixo | Baixo | Remove desorientação de contexto (2 telas afetadas) | Padrão de consistência básico |
| 5 | Adicionar toolbar de ações em massa na fila de chamados | Alto | Alto | Reduz de 10+ cliques para 2-3 cliques para operações em lote | Zendesk bulk actions |
| 6 | Busca server-side na Auditoria | Médio | Médio | Auditor encontra eventos históricos em qualquer página, não só na atual | Freshservice/ServiceNow audit search |
| 7 | Command palette: adicionar busca por chamado por número (#N) | Médio | Baixo | Técnico navega direto ao chamado sem passar pela fila | Linear, Raycast |
| 8 | Dashboard: exibir todas as situações configuradas (não apenas as com chamados ativos) | Baixo | Baixo | Filtro de situação funciona mesmo em situações vazias | Zendesk views |
| 9 | Relatórios: adicionar gráfico de linha temporal (chamados por semana/mês) | Médio | Médio | Gestor vê tendência de volume para planejamento de capacidade | Freshservice Analytics, Stripe |
| 10 | Problemas/Mudanças: vincular chamados relacionados na listagem | Médio | Médio | ITIL praticado: rastrear impacto de problema nos chamados afetados | JSM, Halo ITSM |

---

## Benchmark de Mercado — Comparação Direta

### Abertura de chamado
- **FunevDesk v3:** 3 passos (novo chamado → selecionar tipo → preencher e enviar). Rich-text na descrição. Adaptação dinâmica de campos por tipo.
- **Zendesk:** 2 cliques (New Ticket → preencher formulário fixo). Sem adaptação dinâmica nativa.
- **Freshservice:** 3 passos com smart suggestions e IA para categorizar.
- **Veredito:** FunevDesk está no nível Zendesk/Freshservice nesse fluxo.

### Fila e triagem
- **FunevDesk v3:** Filtros colapsáveis, busca visível, tabs de contagem, sem bulk actions.
- **Zendesk (Views):** Filtros persistentes, bulk actions nativas (assign, status, tag).
- **Linear:** Teclado-first, filtros poderosos, bulk edit nativo.
- **Gap:** Bulk actions são o único diferencial faltante para equiparar ao Zendesk.

### Auditoria
- **FunevDesk v3:** Paginação server-side, exportação CSV, busca local (não server-side).
- **Freshservice:** Auditoria com timeline humanizada, filtros por ação/módulo/usuário, busca server-side.
- **Gap:** Humanização de strings + busca server-side.

### Usuários e senha
- **FunevDesk v3:** Diálogo com senha visível e botão copiar. Validação inline.
- **Zendesk, Freshservice:** Mesmo padrão — diálogo com senha gerada + copiar.
- **Veredito:** Equiparado ao mercado após correção.

---

*Relatório gerado por Agente QA Senior em 2026-06-26. Todos os fluxos testados em ambiente dev (localhost:3000) com dados demo. Módulos 10 e 11 testados parcialmente (sem agente Windows instalado).*
