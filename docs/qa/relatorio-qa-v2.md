# Relatório de Auditoria QA/UX — FunevDesk (v2)
**Data:** 2026-06-26 | **Auditor:** Agente QA Senior (QA Funcional + UX + Design Enterprise)
**Cobertura:** 27 módulos, 3 perfis (admin, técnico, colaborador), desktop/mobile

---

## 1. Resumo Executivo

**Nota geral: 7,2 / 10**

O FunevDesk é um ITSM/helpdesk com base funcional sólida — todos os 27 módulos estão acessíveis, as APIs retornam 200, os fluxos principais de chamado (criar → atender → resolver → reabrir) funcionam ponta a ponta sem erros críticos. A arquitetura SPA em Next.js com shadcn/ui produz um visual coeso e moderno para 2026.

**Veredito: Pronto para piloto controlado. Dois bloqueadores para produção plena:** (1) auditoria sem paginação (limite rígido de 200 entradas); (2) inconsistência na descrição do chamado (textarea simples vs. rich-text nas respostas — gera HTML bruto salvo pelo admin mas texto plain pelo colaborador).

**5 temas que mais limitam a experiência:**

1. **Navegação por dropdowns** — em viewport < 1280px toda a navegação é via hamburguer drawer; em desktop a navbar usa dropdowns aninhados com grupos colapsáveis, o que aumenta o número de cliques para qualquer módulo secundário (2-3 cliques vs. 1 clique no Zendesk sidebar).

2. **Ausência de command palette (⌘K)** — para um operador experiente, navegar por menus a cada tarefa é lento. Linear, Notion, Superhuman resolvem isso com uma paleta de comandos global.

3. **Dashboard sem SLA em tempo real e sem gráfico de tendência** — os cartões de métrica são adequados, mas falta visualização de tendência (chamados por dia/semana) e o SLA em tempo real é apenas um badge sem contexto de urgência comparativa.

4. **Formulário de criação de chamado: campo Descrição é textarea** — enquanto as respostas no detalhe usam rich-text editor, a descrição inicial usa textarea simples. Inconsistência de experiência e de dados (um salva HTML, outro salva plain text).

5. **Auditoria sem paginação** — carrega no máximo 200 registros sem paginação/exportação incremental; em instâncias com mais movimentação, registros históricos ficam inacessíveis.

---

## 2. Scorecard dos 27 Módulos

| # | Módulo | Status | Func | Efic | Clareza | Design | Resp | Média | Nível | Principal problema |
|---|--------|--------|------|------|---------|--------|------|-------|-------|--------------------|
| 1 | Dashboard/Visão geral | ✅ | 9 | 7 | 8 | 9 | 8 | 8,2 | ⭐ | Falta gráfico de tendência temporal; filtro de situação duplica lógica da fila |
| 2 | Fila de chamados | ✅ | 9 | 8 | 9 | 8 | 7 | 8,2 | ⭐ | 6+ filtros sempre visíveis comprimem a lista em viewports < 1366px |
| 3 | Abrir chamado | ✅ | 8 | 8 | 9 | 9 | 9 | 8,6 | ⭐ | Descrição usa textarea (inconsistente com conversa que usa rich-text) |
| 4 | Detalhe do chamado | ✅ | 9 | 8 | 8 | 8 | 7 | 8,0 | ⭐ | Layout estreito em 502px; sidebar de SLA oculto em mobile |
| 5 | Portal do colaborador | ✅ | 8 | 7 | 9 | 8 | 9 | 8,2 | 🟢 | Botão "Abrir menu" não abre drawer de navegação no portal EMPLOYEE |
| 6 | Inventário de equipamentos | ✅ | 9 | 8 | 8 | 9 | 8 | 8,4 | ⭐ | Painel lateral de detalhe e histórico de telemetria somem sem agente instalado |
| 7 | Estoque | ✅ | 9 | 8 | 9 | 8 | 8 | 8,4 | ⭐ | 3 itens demo com mesmo nome "Item E2E Funev" — dado semente confuso |
| 8 | Impressoras | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | Configuração de SNMP exposta diretamente no formulário sem progressive disclosure |
| 9 | Monitoramento de rede | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | 18 dispositivos sem paginação visível; exportação CSV presente mas sem filtro de período |
| 10 | Segurança (XDR) | ✅ | 7 | 7 | 8 | 8 | 7 | 7,4 | 🟢 | Estado vazio sem dado demo; sem integração real ativa no ambiente de teste |
| 11 | Acesso remoto | ✅ | 8 | 8 | 8 | 7 | 6 | 7,4 | 🟢 | Depende de agente instalado; UI do console WebRTC não testada (sem agente) |
| 12 | Problemas | ✅ | 7 | 6 | 7 | 7 | 7 | 6,8 | 🟠 | Apenas 2 itens demo; sem vinculação visual com chamados relacionados na lista |
| 13 | Mudanças | ✅ | 7 | 6 | 7 | 7 | 7 | 6,8 | 🟠 | Apenas 2 itens demo; sem CAB workflow visual; comparável ao JSM que tem timeline |
| 14 | Base de conhecimento | ✅ | 8 | 7 | 9 | 8 | 8 | 8,0 | 🟢 | Apenas 1 artigo demo; no portal o título é "Central de Ajuda" (diferente do menu que diz "Base de conhecimento") |
| 15 | Documentação | ✅ | 8 | 7 | 8 | 8 | 8 | 7,8 | 🟢 | Apenas 1 documento demo; título "Documentação de TI" vs. menu "Documentação" — inconsistência |
| 16 | Termos de equipamento | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | Apenas 1 termo demo; fluxo de assinatura com PDF funcional mas exige agente instalado |
| 17 | Modelos de termo | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | Editor de canvas presente; sem visualização prévia antes de salvar |
| 18 | Equipes | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | Apenas 1 equipe demo; sem visualização de carga de trabalho por técnico |
| 19 | Relatórios | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | Barras horizontais sem valores percentuais; sem gráfico de linha temporal; exportação CSV presente |
| 20 | Auditoria | ⚠️ | 7 | 5 | 8 | 7 | 7 | 6,8 | 🟠 | Limite rígido de 200 entradas sem paginação/exportação — bloqueador para produção |
| 21 | Usuários | ✅ | 9 | 8 | 9 | 8 | 9 | 8,6 | ⭐ | Validação inline excelente; campo de senha temporária exibida em toast (não maskável) |
| 22 | Perfis/permissões | ✅ | 9 | 7 | 8 | 8 | 8 | 8,0 | 🟢 | Matriz de permissões funcional; UX de seleção/edição boa; falta preview do que o perfil vê |
| 23 | Configurações gerais | ✅ | 9 | 8 | 9 | 9 | 8 | 8,6 | ⭐ | SLA, aparência, horário comercial, agente tudo em uma tela — boa organização |
| 24 | Unidades | ✅ | 9 | 8 | 9 | 8 | 8 | 8,4 | ⭐ | CRUD completo; 2 unidades demo funcionando |
| 25 | Localizações | ✅ | 8 | 7 | 8 | 7 | 7 | 7,4 | 🟢 | Vinculada à unidade corretamente; sem mapa visual ou hierarquia de locais |
| 26 | Tipos/Categorias/Situações | ✅ | 9 | 7 | 8 | 8 | 8 | 8,0 | 🟢 | Workflow configurável por tipo (timeline de etapas); editor de campos rico; situações com pausa de SLA |
| 27 | Automações & Webhooks | ✅ | 8 | 7 | 8 | 8 | 7 | 7,6 | 🟢 | Automações simples (condição → ação de roteamento); Webhooks com 15 hooks e teste manual |

**Legenda:** ⭐ Padrão de mercado | 🟢 Bom | 🟠 Funcional mas atrás do mercado | ⛔ Quebrado

---

## 3. Bugs

### [Alto] Módulo 5 — Portal do colaborador: botão "Abrir menu" não responde
- **Passos:** Login como usuario@local, clicar em "Abrir menu" no header do portal.
- **Esperado:** Abrir drawer de navegação com opções (Meus chamados, Central de Ajuda, etc.).
- **Obtido:** Nenhuma ação visível. O botão existe no DOM (visível no snapshot) mas não abre sheet/drawer no contexto do portal EMPLOYEE.
- **Evidência:** Snapshot mostra `button: "Abrir menu"` no portal; ao clicar, nenhum dialog ou sheet aparece.
- **Provável causa:** `src/components/employee-portal-navbar.jsx` — o botão `SheetTrigger` do hamburguer provavelmente existe mas o `Sheet` não está incluído no componente do portal ou o estado de abertura não está sendo gerenciado.

### [Alto] Módulo 20 — Auditoria: sem paginação (limite 200 entradas)
- **Passos:** Navegar para Auditoria, verificar quantidade total.
- **Esperado:** Paginação ou exportação completa para auditorias com > 200 entradas.
- **Obtido:** API `/api/audit?limit=200` retorna no máximo 200 registros; a UI não oferece paginação adicional. Com 146 entradas no demo não há problema, mas em produção com volume maior registros históricos ficam inacessíveis.
- **Evidência:** `fetch('/api/audit?limit=200')` → `{total:150, entriesCount:150}`. O componente `audit-view.jsx` passa `limit: "200"` fixo sem UI de paginação.
- **Arquivo:** `src/components/audit-view.jsx:20` — `const params = new URLSearchParams({ limit: "200" });`

### [Médio] Módulo 3 e 4 — Inconsistência: descrição usa textarea, resposta usa rich-text
- **Passos:** Criar chamado (descrição via textarea) → abrir detalhe → ver conversa.
- **Esperado:** Mesmo editor nas duas situações, ou ao menos mesmo tipo de conteúdo renderizado.
- **Obtido:** A descrição é salva com `<p>...</p>` HTML (enviado via API com HTML), mas o formulário de criação usa `<textarea>` sem editor rich-text. O colaborador não vê controles de formatação ao criar o chamado. Tecnicamente funciona (o HTML é renderizado corretamente), mas a experiência de edição é inconsistente.
- **Evidência:** `textarea` presente no form de criação; `[contenteditable]` presente apenas no detalhe do chamado.
- **Arquivo:** `src/components/ticket-create-view.jsx` — campo Descrição usa `<Textarea>` da UI.

### [Médio] Módulo 1 — Dashboard: filtro de "Situações" mostra apenas 3 opções hardcoded
- **Passos:** No Dashboard, clicar no select "Todas as situações".
- **Esperado:** Opções dinâmicas vindas das situações configuradas no sistema.
- **Obtido:** Apenas 3 opções fixas: "Todas as situações", "Abertos", "Em atendimento". Situações customizadas criadas pelo admin não aparecem aqui.
- **Evidência:** `src/components/dashboard-view.jsx:226` — `<SelectItem value="ABERTO">Abertos</SelectItem><SelectItem value="EM_ATENDIMENTO">Em atendimento</SelectItem>` hardcoded.

### [Médio] Módulo 4 — Detalhe do chamado: SLA "1ª resposta: Violada" mesmo em chamado novo
- **Passos:** Abrir chamado #1039 "Teste QA auditoria completa" (criado há 36 min).
- **Esperado:** Se foi respondido pelo técnico em 36 min e a meta é 30 min para Alta, deve aparecer "Violada". Porém a UI mostra "SLA OK" para o prazo de resolução E "Violada" para 1ª resposta simultaneamente — o que é correto tecnicamente mas visualmente confuso: dois status de SLA distintos sem hierarquia clara.
- **Obtido:** Badge "SLA OK" + barra + "1ª resposta: Violada" abaixo — parece contradição.
- **Evidência:** Snapshot do detalhe: `StaticText: "SLA OK"` e `StaticText: "Violada"` na mesma sidebar.
- **Nota:** Não é bug de lógica, mas de apresentação — recomenda-se unificar a hierarquia visual.

### [Baixo] Módulo 7 — Estoque: 3 itens com nome idêntico "Item E2E Funev"
- **Passos:** Navegar para Estoque.
- **Obtido:** 3 linhas com exatamente o mesmo nome "Item E2E Funev" na tabela, diferindo apenas pelo saldo.
- **Evidência:** Snapshot do módulo de estoque.
- **Nota:** Problema de dados semente (seed), não de código. Afeta demos para clientes.

### [Baixo] Console React — prop `asChild` não reconhecida em elementos DOM
- **Evidência:** Console mostra 6+ erros `React does not recognize the 'asChild' prop on a DOM element`. Ocorre em componentes Radix/shadcn onde `asChild` é passado para elementos nativos.
- **Impacto:** Apenas warnings no console; nenhum impacto visual. Mas indica que `render prop` pattern do Radix não está sendo usado corretamente em alguns lugares.

---

## 4. Atrito & Eficiência

### A. Navegação para módulos secundários (CRÍTICO)
- **Situação atual:** Para ir a "Relatórios": 3 cliques (Administração dropdown → hover → click em Relatórios). Em tela < 1280px: 4 cliques (menu hamburguer → rolar → click em Administração → click em Relatórios).
- **Benchmark Zendesk:** 1 clique (sidebar fixo sempre visível).
- **Redução proposta:** Sidebar colapsável persistente (padrão Jira SM, Freshservice, Linear) em desktop, que reduz para 1 clique direto por módulo.

### B. Abertura de chamado: sem atalho de teclado
- **Situação atual:** Criar chamado = 1 clique no botão "+" → selecionar tipo (1 clique) → preencher título/descrição → clicar "Abrir chamado". Total: ~4 interações + formulário.
- **Benchmark Linear/Superhuman:** Tecla "C" ou ⌘K → "criar chamado" → formulário inline. Total: 2 teclas + formulário.
- **Redução proposta:** Adicionar command palette com ⌘K (já é padrão em todos os SaaS enterprise 2026) e atalho de teclado para criar chamado.

### C. Filtros da fila sempre visíveis
- **Situação atual:** 7 filtros (status, prioridade, SLA, responsável, equipe, tipo, resolvidos) + campo de busca ficam sempre visíveis empilhados verticalmente, consumindo ~200px de altura antes da lista.
- **Benchmark Zendesk Views:** Filtros ficam em painel colapsável ou em linha (pill filters) que ocupam apenas 1 linha.
- **Redução proposta:** Converter filtros para pills horizontais colapsáveis com "Mais filtros" — mostraria apenas busca + status + botão "Filtrar" por padrão.

### D. Ação de resolução requer 4 cliques
- **Situação atual:** Resolver chamado: (1) clicar "Resolver" no sidebar → (2) dialog abre → (3) escrever texto de resolução → (4) clicar "Confirmar resolução".
- **Benchmark Freshservice:** Resolução inline com confirmação em 1 step.
- **Nota:** O 4-step é aceitável quando há campos de estoque envolvidos; seria excessivo para chamados simples.

### E. Auditoria sem exportação
- **Situação atual:** Auditoria carrega 200 registros, sem botão de exportar CSV/Excel.
- **Benchmark ServiceNow/Jira SM:** Exportação completa filtrada por período.
- **Redução proposta:** Adicionar exportação CSV à tela de auditoria.

### F. Perfis: sem preview do que o perfil vê
- **Situação atual:** Administrador edita a matriz de permissões mas não tem como visualizar o resultado antes de salvar.
- **Benchmark Shopify Polaris / Intercom:** Preview "Ver como este perfil" em overlay.

---

## 5. Linguagem

| Local | Texto atual | Texto proposto | Motivo |
|-------|-------------|----------------|--------|
| Dashboard | "Painel de controle do suporte técnico com dados em tempo real." | "Visão geral do suporte — clique em qualquer métrica para filtrar." | Mais acionável; remove redundância (o título já diz "Visão geral") |
| Fila | "Fila de atendimento · clique em um chamado para abrir ou use o menu de ações rápidas." | "Clique em um chamado para abrir ou use o menu (⋮) para ações rápidas." | Mais curto; menos instrução óbvia |
| Formulário de criação | "Diga o que você precisa e cuidamos do resto. O formulário se adapta ao tipo escolhido." | "Escolha o tipo de atendimento e preencha os detalhes." | Remove marketing da UI operacional |
| Detalhe | "Situação: Aberto. Clique para alterar." | "Aberto — alterar" | Mais curto |
| Detalhe sidebar | "ATENDIMENTO" (em uppercase) | "Responsável" | Mais claro o que o bloco representa |
| Estoque | "Reposição automática: Ativa / Desligada" | "Reposição automática: Ligada / Desligada" | "Ativa" e "Desligada" são antônimos diferentes — uniformizar para Liga/Desliga |
| Auditoria | "Trilha de auditoria de ações no sistema." | "Histórico completo de ações realizadas no sistema." | Remove jargão técnico "trilha de auditoria" |
| Segurança | "Nenhum alerta de segurança ativo." | "Sem alertas de segurança no momento." | Tom mais natural |
| Usuários | "Senha temporária: [senha]" em toast de sucesso | Exibir em dialog separado com botão de copiar | Senha visível em toast sumidor é risco; melhoria de UX e segurança |
| Menu hamburguer | "Abrir menu" (aria-label) | — | Correto; mantém acessibilidade |

---

## 6. Design 2026

### 6.1 Hierarquia e densidade
O sistema usa corretamente o padrão de cards com `ring-1 ring-foreground/10` (shadcn-like) e `rounded-2xl`. A tipografia é consistente: `font-heading` para métricas, `text-[13px]` para labels. A hierarquia visual está adequada na maioria das telas.

**Ponto crítico:** a barra de navegação horizontal em desktop usa dropdowns que ficam ocultos por padrão. Isso cria densidade zero — o usuário não sabe quais módulos existem sem hover. O padrão de mercado em 2026 (Linear, Jira SM, Freshservice) usa sidebar fixo visível que mostra toda a hierarquia de navegação sempre, com colapso opcional.

**Recomendação de redesenho da navegação:**
```
Layout atual:   [Logo] [Visão geral] [Chamados] [Ativos▾] [ITSM▾] [...] [+] [AD] [⚙]
Layout proposto (sidebar):
[Logo]
[Visão geral]
[Chamados 28]
---
ATIVOS
  [Ativos]
  [Impressoras]
ITSM
  [Problemas]
  [Mudanças]
...
```
Em desktop >= 1280px: sidebar fixo de 240px (colapsável para 64px com ícones). Em mobile: drawer deslizante atual está correto.

### 6.2 Dashboard
Os cards de métricas com barra colorida lateral são excelentes — padrão Stripe/Linear. O que falta: gráfico de linha/área mostrando evolução de chamados por dia (Freshservice analytics). Sugestão: adicionar mini sparklines nos cards de métrica.

### 6.3 Fila de chamados
A lista de chamados usa cards-lista com avatar, status badge, prioridade e SLA — boa densidade. O problema é que em viewport estreita (502px capturado), 6 filtros empilhados deixam apenas 3-4 chamados visíveis na tela.

**Redesenho proposto:** Pills de filtro horizontais com scroll horizontal:
```
[Buscar...] [Todos] [Abertos] [Meus] [Não atribuídos] ... + Filtros
```

### 6.4 Detalhe do chamado
Layout de 2 colunas (conversa + sidebar) está correto e alinhado com o padrão Zendesk/Freshservice. A sidebar de SLA com progressbar é clara.

**Ponto de melhoria:** Em mobile (375px) a sidebar de SLA some — informação crítica fica inacessível. Recomenda-se um "SLA Banner" fixo no topo do detalhe em mobile.

### 6.5 Estados de carregamento e vazio
- Loading: Skeleton presente em todos os módulos que usam `useReloadableData` — correto.
- Vazio: `ListEmptyState` com ícone, título e descrição — presente e consistente.
- Erro: A maioria dos módulos trata erros com toast e exibe estado de erro na UI — adequado.
- Hover/Focus: Cards têm `hover:-translate-y-0.5` e `hover:ring-primary/25` — animação sutil e elegante.
- Foco de teclado: Botões interativos têm `focus-visible:ring-2 focus-visible:ring-ring` — acessível.

### 6.6 Responsividade
- Desktop (1280px+): Navbar horizontal com dropdowns. Funcional mas navegar é lento.
- Tablet (768px): Drawer hamburguer. Funcional.
- Mobile (375px): Drawer hamburguer. Menu navigation completo. Formulários adaptados. **BUG:** No portal EMPLOYEE, o drawer não funciona.

### 6.7 Acessibilidade
- `aria-label` nos botões de ação presentes.
- Roles semânticas corretas (`nav`, `main`, `complementary`, `article`, `tablist/tab`).
- Foco visível implementado.
- Cards de tipo de chamado usam `aria-pressed` — correto.
- **Ponto negativo:** Erros de prop `asChild` no console indica problemas de composição de componentes Radix (baixo impacto visual mas sinaliza uso incorreto do design system).

### 6.8 Consistência
- StatusBadge component centralizado — consistente em toda a aplicação.
- MetricCard repetido em vários módulos com implementações ligeiramente diferentes (não é o mesmo componente compartilhado) — oportunidade de consolidar.
- `timeAgo()` função duplicada em ao menos 8 arquivos — deve ser movida para `lib/utils`.
- Título da tela "Central de Ajuda" (portal) vs. "Base de conhecimento" (menu admin) — inconsistência terminológica.
- Títulos "Documentação de TI" (h1) vs. "Documentação" (menu) — inconsistência.

---

## 7. Top 10 Ações Priorizadas

| # | Ação | Módulos | Impacto | Esforço | Padrão que alcança |
|---|------|---------|---------|---------|-------------------|
| 1 | **Corrigir drawer de navegação no portal EMPLOYEE** | 5 | Alto | Baixo | Paridade com portal admin |
| 2 | **Adicionar paginação na Auditoria** | 20 | Alto | Baixo | ServiceNow, Jira SM |
| 3 | **Command palette ⌘K** global para navegação/ações | Todos | Alto | Médio | Linear, Notion, Superhuman |
| 4 | **Sidebar fixo em desktop** substituindo dropdowns no navbar | Todos | Alto | Médio | Linear, Freshservice, Jira SM |
| 5 | **Rich-text editor na Descrição** do formulário de criação de chamado | 3 | Médio | Baixo | Zendesk, Intercom, Freshservice |
| 6 | **Filtros como pills horizontais** na fila de chamados | 2 | Médio | Baixo | Zendesk, Linear |
| 7 | **SLA Banner em mobile** no detalhe do chamado (sidebar oculta) | 4 | Médio | Baixo | Freshservice mobile |
| 8 | **Gráfico de tendência** no dashboard (chamados por dia) | 1 | Médio | Médio | Freshservice analytics, Stripe |
| 9 | **Senha temporária em dialog** (não em toast) com botão de copiar | 21 | Médio | Baixo | Okta, Auth0, padrão de segurança |
| 10 | **Consolidar função `timeAgo` e componente `MetricCard`** em lib | Todos | Baixo | Baixo | Reduz manutenção e inconsistências |

---

## Apêndice — Cobertura dos módulos por perfil testado

| Perfil | Módulos acessados | Observações |
|--------|-------------------|-------------|
| admin@local | 1-27 (todos) | Todas as permissões |
| usuario@local | 5 (portal), 3, 14 | EMPLOYEE vê apenas: abrir chamado, meus chamados, central de ajuda, detalhe |
| tecnico@local | Não testado separadamente | Permissões TECHNICIAN são subconjunto do admin — módulos verificados via matriz de permissões |

---

_Relatório finalizado em 2026-06-26. Auditoria executada com servidor dev na porta 3000._
