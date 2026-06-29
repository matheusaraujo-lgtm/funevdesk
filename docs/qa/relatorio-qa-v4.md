# Relatório de QA — FunevDesk v4 (Auditoria Exaustiva)
**Data:** 2026-06-27  
**Auditor:** QA Sênior (funcional + UX + design enterprise)  
**Versão anterior:** v3 (nota geral 8,1/10)  
**Modo de navegação:** SIDEBAR (admin, técnico, colaborador)  
**Credenciais testadas:** admin@local, tecnico@local, usuario@local  

---

## 1. RESUMO EXECUTIVO

**Nota geral: 7,9 / 10** (ligeira regressão vs. 8,1 na v3; nova cobertura revelou lacunas antes ocultas)

O FunevDesk tem arquitetura sólida, design system consistente e cobre muito do que um ITSM SMB precisa. Os fluxos principais (abrir, atender, resolver, reabrir chamado) funcionam do ponto A ao Z sem quebras críticas. A sidebar unificada para os três perfis simplificou a navegação.

**Os 5 temas que mais limitam a experiência:**

1. **Polling excessivo de APIs** — no log de rede, /api/dashboard e /api/catalog são chamados 6-12x por evento de navegação. Em produção com muitos usuários isso gera custo e latência desnecessários.
2. **Módulo de Mudanças sem workflow real** — a tela existe, lista as mudanças, mas não tem botões de transição de estado (Aprovar / Iniciar implementação / Concluir). Apenas "Editar" e "Excluir". Um dos módulos ITIL mais importantes está incompleto.
3. **Integração chamado→problema inexistente** — o problema exibe "Incidentes vinculados 0" mas não há botão para vincular chamados existentes ao problema. A costura ITIL entre incidente→problema→mudança é fraca.
4. **Carga cognitiva elevada no detalhe do chamado** — a tela de detalhe tem 5 seções simultâneas (header, conversa, checklist, IA, sidebar direita com SLA/equipamento/métricas) sem hierarquia clara. Densidade informacional acima do ideal para um técnico atendendo em ritmo.
5. **UX writing pontual com inconsistências** — ex.: "Situação" vs. "Status", rótulos maiúsculos desnecessários em campos da sidebar, ausência de contagem de chamados no alerta de SLA.

**Veredito:** Pronto para piloto interno com técnicos e admin. Bloqueador para produção ampla: workflow de Mudanças e integração incidente→problema.

---

## 2. SCORECARD DOS 27 MÓDULOS

| # | Módulo | Status | Nota | Nível | Principal problema |
|---|--------|--------|------|-------|--------------------|
| 1 | Dashboard / Visão geral | ✅ | 8,5 | ⭐ | Filtros de período funcionam; polling excessivo de API |
| 2 | Fila de chamados | ✅ | 9,0 | ⭐ | Busca, filtros, bulk actions, ações rápidas — tudo ok |
| 3 | Abrir chamado | ✅ | 8,0 | 🟢 | Formulário adaptativo OK; validação não exibe msg inline, só asterisco |
| 4 | Detalhe do chamado | ✅ | 8,5 | 🟢 | Resolver/reabrir/checklist/IA/remoto funcionam; densidade elevada |
| 5 | Portal do colaborador | ✅ | 8,5 | ⭐ | Meus chamados + Central de ajuda com CTA funcionam bem |
| 6 | Inventário de equipamentos | ✅ | 8,0 | 🟢 | Telemetria, métricas, conexão remota presentes; filtros ok |
| 7 | Estoque | ✅ | 7,5 | 🟠 | Movimentação funciona; link "vinculados aos chamados" é só cosmético |
| 8 | Impressoras | ✅ | 8,0 | 🟢 | Toner, alertas, "Verificar agora" e form de nova impressora ok |
| 9 | Monitoramento de rede | ✅ | 7,5 | 🟠 | Dispositivos listados; 15 em alerta/offline — estado de dados real |
| 10 | Segurança (XDR) | ✅ | 7,5 | 🟠 | Integrações não configuradas; UI de empty state adequada |
| 11 | Acesso remoto | ✅ | 8,0 | 🟢 | Console abre no detalhe do chamado e no ativo; "Conectando…" ok |
| 12 | Problemas | ✅ | 6,5 | 🟠 | Não tem botão para vincular chamados; sem transições de workflow visíveis |
| 13 | Mudanças | ✅ | 5,5 | ⛔ | Sem botões de workflow (Aprovar/Implementar/Concluir) — funcionalidade incompleta |
| 14 | Base de conhecimento | ✅ | 8,5 | ⭐ | Criação, edição, visualização por colaborador — fluido |
| 15 | Documentação | ✅ | 8,0 | 🟢 | Filtros por tipo e unidade; form de criação ok |
| 16 | Termos de equipamento | ✅ | 8,0 | 🟢 | Fluxo de assinatura e PDF funciona; form de novo termo ok |
| 17 | Modelos de termo | ✅ | 8,0 | 🟢 | Lista, status ativo/inativo e conteúdo ok |
| 18 | Equipes | ✅ | 7,5 | 🟠 | Cadastro presente; só 1 equipe demo com 0 membros |
| 19 | Relatórios | ✅ | 8,5 | ⭐ | MTTR, FCR, CSAT, por unidade, exportar CSV — completo |
| 20 | Auditoria | ✅ | 9,0 | ⭐ | Trilha completa, exportação CSV, ações rastreadas inclusive remoto |
| 21 | Usuários | ✅ | 8,5 | 🟢 | CRUD completo, resetar senha, ativar/desativar, vincular equipamento |
| 22 | Perfis / Permissões | ✅ | 8,5 | ⭐ | Matriz granular por tela e ação; base_role correto por perfil |
| 23 | Configurações gerais | ✅ | 9,0 | ⭐ | SLA, marca, horário comercial, metas por prioridade — tudo editável |
| 24 | Unidades | ✅ | 8,5 | ⭐ | Matriz + filial, vínculo de usuários e ativos correto |
| 25 | Localizações | ✅ | 8,5 | ⭐ | Cadastro por unidade com código; integrado ao formulário de abertura |
| 26 | Tipos / Categorias / Situações | ✅ | 9,0 | ⭐ | Formulário dinâmico, fluxo de aprovação, termo vinculado — robusto |
| 27 | Automações & Webhooks | ✅ | 8,5 | ⭐ | Roteamento automático confirmado (chamado #1041 → Técnico Demo); webhooks listados |

**Média geral dos módulos: 8,1** (arrastada por Mudanças 5,5 e Problemas 6,5)

---

## 3. BUGS

### [Crítico] Módulo 13 — Mudanças sem workflow de transição de estado
- **Tela:** Mudanças (detalhe no side panel)
- **Passos:** Ir em Mudanças → clicar em uma mudança → observar o panel lateral
- **Esperado:** Botões "Aprovar", "Iniciar implementação", "Concluir", "Rejeitar" conforme o status atual da mudança
- **Obtido:** Apenas "Editar" e "Excluir". Status editável pelo form genérico, sem semântica de workflow
- **Evidência:** `main?.textContent` retornou `"Mudança#102SolicitadoMédioNORMALMigrar e-mails...Editar Excluir"` — nenhum botão de transição
- **Arquivo provável:** `src/components/changes-view.jsx` (ausência de lógica de transição de status)
- **Impacto:** Fluxo ITIL de Mudanças é inutilizável para controle real de aprovação

### [Alto] Módulo 12 — Problemas sem vínculo de incidentes
- **Tela:** Problemas (detalhe no side panel)
- **Passos:** Ir em Problemas → clicar em um problema → observar "Incidentes vinculados 0"
- **Esperado:** Botão "Vincular chamado" para associar incidentes existentes ao problema
- **Obtido:** Apenas contador "0 chamado(s)" sem ação disponível
- **Arquivo provável:** `src/components/problems-view.jsx` (ausência de UI de vínculo)
- **Impacto:** Integração incidente↔problema, central ao ITIL, não funciona

### [Alto] Polling excessivo de API
- **Tela:** Todas (global)
- **Passos:** Navegar entre qualquer módulo e observar o network log
- **Esperado:** 1 request por endpoint por navegação
- **Obtido:** /api/dashboard e /api/catalog chamados 6-12x por ação de navegação. Confirmado no network log com centenas de requests em sessão de ~20 minutos
- **Arquivo provável:** `src/app/page.js` (múltiplos useEffect com dependências que se reativam em loop) e `src/components/app-navbar.jsx`
- **Impacto:** Custo de servidor, latência, possível throttling em produção

### [Alto] Estoque — "vinculados aos chamados" não tem integração funcional
- **Tela:** Estoque (header: "Materiais e suprimentos vinculados aos chamados")
- **Passos:** Abrir Estoque → não há como dar saída num item a partir da resolução de um chamado
- **Esperado:** Na resolução ou no detalhe do chamado, campo para selecionar item de estoque utilizado
- **Obtido:** O estoque existe de forma independente; a movimentação é manual e desconectada dos chamados
- **Arquivo provável:** `src/components/resolve-ticket-dialog.jsx` (ausência do campo de estoque)

### [Médio] Formulário de criação — validação sem mensagem de erro inline
- **Tela:** Abrir chamado
- **Passos:** Abrir formulário → selecionar tipo → não preencher título → clicar "Abrir chamado"
- **Esperado:** Mensagem de erro abaixo do campo vazio (ex.: "Informe um título para o chamado")
- **Obtido:** Apenas asterisco vermelho (*) no campo, sem texto explicativo; borda do input fica vermelha
- **Arquivo provável:** `src/components/ticket-create-view.jsx` linha ~268 (submit usa toast.error mas não field-level error)
- **Impacto:** Usuário leigo não entende o que está errado

### [Médio] Badge de chamados na sidebar sem aria-label para acessibilidade
- **Tela:** Sidebar (todos os perfis)
- **Passos:** Inspecionar botão "Chamados 30" na nav
- **Esperado:** aria-label="Chamados (30 abertos)" ou estrutura semântica equivalente
- **Obtido:** Texto concatenado "Chamados30" sem separação para leitores de tela; aria-label ausente
- **Arquivo provável:** `src/components/app-navbar.jsx` nos links de navegação

### [Médio] Evento de abertura de chamado via formulário não reseta corretamente
- **Tela:** Abrir chamado (quando chamado de dentro de outro contexto)
- **Passos:** Abrir chamado via "Não resolveu? Abra um chamado" na Central de Ajuda → campo de busca de tipo funciona mas o formulário não pré-seleciona o tipo relacionado ao artigo
- **Esperado:** Pré-seleção do tipo relevante ao contexto do artigo
- **Obtido:** Formulário genérico sem contexto

### [Baixo] SLA "violado" vs. "SLA violado" — inconsistência de terminologia
- **Tela:** Fila de chamados (coluna SLA), Detalhe do chamado (sidebar)
- **Obtido:** Fila usa "SLA violado"; detalhe usa "Violado há 157h" e o badge usa "SLA violado" no header
- **Esperado:** Terminologia unificada

---

## 4. ATRITO E EFICIÊNCIA (cliques/passos)

### 4.1 Abrir um chamado simples

| Ação | FunevDesk atual | Zendesk/Freshservice | Delta |
|------|-----------------|----------------------|-------|
| Selecionar tipo | 1 clique no card | Campo de formulário | +0 |
| Preencher título | 1 fill | 1 fill | 0 |
| Preencher descrição | 1 fill (rich text) | 1 fill | 0 |
| Selecionar localização | 1 dropdown | Opcional/omitido | +1 |
| Submeter | 1 clique | 1 clique | 0 |
| **Total** | **5 passos** | **4 passos** | +1 |

O passo extra de localização poderia ter default automático via agente detectado. Quando o agente detecta a máquina, a localização deveria ser pré-preenchida.

### 4.2 Resolver um chamado

| Ação | FunevDesk atual | Zendesk (macro) | Delta |
|------|-----------------|-----------------|-------|
| Abrir detalhe | 1 clique na fila | 1 clique | 0 |
| Clicar "Resolver" | 1 clique | Atalho de teclado (R) ou macro | +0 |
| Preencher resolução | 1 fill | Opcional com macro | +1 |
| Confirmar | 1 clique | Incluído no macro | +0 |
| **Total** | **4 passos** | **2-3 passos c/ macro** | +1 |

Recomendação: adicionar resolução rápida por macro (texto pré-pronto) reduz para 2 cliques.

### 4.3 Atribuir chamado

| Ação | FunevDesk atual | Jira SM |
|------|-----------------|---------|
| Abrir detalhe | 1 | 1 |
| Clicar "Transferir" | 1 | Inline click no campo |
| Selecionar técnico | 1 dropdown | 1 dropdown |
| Confirmar | 1 | Automático |
| **Total** | **4** | **2** |

Recomendação: inline edit no campo "Responsável" da sidebar do detalhe (clicar no nome abre dropdown) — elimina o dialog intermediário.

### 4.4 Criar um problema ITIL

| Ação | FunevDesk atual | ServiceNow |
|------|-----------------|------------|
| Abrir Problemas | 1 | 1 |
| Clicar "Novo problema" | 1 | 1 |
| Preencher form (4 campos) | 4 fills | 4 fills + workflow |
| Salvar | 1 | 1 |
| Vincular incidentes | IMPOSSÍVEL | 1 step |
| **Total** | **7 + bloqueio** | **8 completo** |

A impossibilidade de vincular incidentes no FunevDesk é o bloqueio principal.

### 4.5 Filtrar fila por responsável + status + prioridade

- FunevDesk: 3 dropdowns no painel de filtros expandido — 4 cliques (1 abrir + 3 selects)
- Zendesk Views: view pré-configurada — 1 clique
- Recomendação: "Salvar filtro como view" para reutilizar combinações frequentes

---

## 5. LINGUAGEM (UX Writing)

### Problemas confirmados com evidência

| Local | Texto atual | Proposta | Motivo |
|-------|-------------|----------|--------|
| Detalhe chamado, sidebar | `ITSM` (label maiúsculo) | Remover ou `Atendimento` | Jargão técnico sem contexto |
| Detalhe chamado, sidebar | `ATENDIMENTO` (label maiúsculo) | `Responsável pelo chamado` | Mais claro para leigos |
| Fila de chamados | `Fila de atendimento · clique em um chamado para abrir ou use o menu de ações rápidas.` | `Chamados abertos — clique para atender` | Muito verboso para instrução que fica visível todo o tempo |
| Botão IA no detalhe | `Explicar / Como resolver` | `Sugestão da IA` | Mais conciso; o segundo termo é redundante com o contexto |
| Abrir chamado | `Diga o que você precisa e cuidamos do resto. O formulário se adapta ao tipo escolhido.` | `Escolha o tipo de atendimento e descreva o problema.` | O original tem tom excessivamente informal/marketeiro |
| Resolve dialog | `Descrição da resolução para o cliente*` | `O que foi feito para resolver?` | Natural, direto |
| Problemas | `Gestão de problemas ITIL e causa raiz.` | `Problemas recorrentes e causa raiz.` | "ITIL" é jargão; usuário técnico entende; usuário leigo não |
| Mudanças | `Controle de mudanças com aprovação e risco.` | `Mudanças planejadas (RFC)` | Mais conciso |
| Estoque, header | `Materiais e suprimentos (mouse, teclado, toner) vinculados aos chamados.` | `Materiais de TI e suprimentos` | Os parênteses poluem; "vinculados aos chamados" é enganoso (não há vínculo funcional real) |
| Detalhe chamado, aba | `Eventos (5)` | `Histórico (5)` | "Eventos" é jargão de log; "Histórico" é mais natural |
| Estoque, dialog | `Movimentar estoque · Item E2E` | `Entrada/Saída de estoque — Item E2E` | Mais descritivo |
| Impressoras, botão | `Verificar agora` | `Consultar status` | "Verificar agora" sugere ação imediata com feedback visível; deve ser confirmado com loading state |
| Relatórios, métrica | `FCR (1º contato): 100%` | `Resolução no 1º contato: 100%` | Sigla sem contexto |

### Inconsistências de terminologia

| Termo A | Termo B | Recomendação |
|---------|---------|-------------|
| "Situação" (tela de config) | "Status" (em alguns badges) | Padronizar para "Situação" (pt-BR, já adotado) |
| "SLA violado" (fila) | "Violado" (detalhe) | Padronizar para "SLA violado" |
| "Atualizado há X" | "Há X" | Padronizar para "Atualizado há X" |

---

## 6. DESIGN 2026 — ACHADOS

### 6.1 Poluição e Densidade

**Detalhe do chamado — sobrecarga de informação**

A tela de detalhe do chamado empacota simultaneamente:
- Header com título, breadcrumb, 4 badges (status + prioridade + SLA + "Seu chamado")
- Sidebar esquerda (atendimento, botões de ação)
- Área central com 3 abas (Público/Interno/Eventos) + editor rich text + checklist
- Sidebar direita com SLA, solicitante, unidade, origem, equipamento, métricas de hardware (CPU/Mem/Disco), e painel de IA

**Comparação com Zendesk:** O Zendesk em modo standard usa 2 colunas: conversa (70%) + metadados (30%). Expande seções via accordion. Ações ativas no top. A terceira coluna de equipamento/métricas de hardware seria uma aba separada.

**Redesenho proposto para o detalhe do chamado:**

```
[Header: breadcrumb + título + status + prioridade]                    [Resolver] [...]
─────────────────────────────────────────────────────────────────────────────────────
[Conversa + Editor] (60%)  |  [Sidebar direita colapsável] (40%)
                           |  > Responsável (inline edit)
 [Abas: Mensagens | Interno | Histórico]  |  > SLA (barra de progresso)
                           |  > Solicitante + Unidade
 [Editor rich text]        |  > Equipamento (expandível)
                           |  >   CPU/Mem/Disco (só se houver alerta)
                           |  > Checklist (accordion)
                           |  > IA (accordion, fechado por padrão)
```

Isso reduz a carga cognitiva: métricas de hardware só aparecem expandidas se houver alerta. Checklist e IA ficam acessíveis mas não ocupam espaço permanentemente.

**Dashboard — 21 cards na main**

Os 21 cards incluem: 4 metric cards + 1 gráfico de tendência + 1 table chamados recentes + 5 panels (Alertas, Dispositivos, Segurança, Atividade da equipe, Mapa de atividade). Para um admin que acessa o dashboard 5x/dia, os panels de "Alertas" e "Dispositivos com incidente" são os mais valiosos. Os outros poderiam ser colapsáveis ou movidos para sub-aba.

### 6.2 Hierarquia Visual

**Bom:** Cards com ring-1/ring-foreground/10 e rounded-2xl são consistentes. MetricCards com barra colorida lateral comunicam bem o tipo. StatusBadge é consistente em todas as telas.

**Problema:** O badge de contagem na sidebar (ex.: "30" após "Chamados") está concatenado ao texto do botão sem separador semântico. Em leitores de tela lê "Chamados30" sem pausas.

**Correção:** `<span aria-label="30 chamados abertos" className="...">30</span>` com aria-label explícito.

### 6.3 Estados

- **Loading:** Presente via ListLoadingSkeleton — bom
- **Empty state:** Presente via ListEmptyState — bom
- **Error state:** Ausente em vários módulos (sem retry visível quando API falha)
- **Hover:** Presente (hover:-translate-y-0.5 nos metric cards) — bom
- **Focus:** focus-visible rings presentes — bom
- **Disabled:** Presente nos botões de submit durante loading — bom

**Estado faltante crítico:** Em Monitoramento de rede, 15 dispositivos estão "OFFLINE" há 3 dias. A tela não oferece "Reconectar" nem "Abrir chamado" diretamente das linhas da tabela.

### 6.4 Responsividade

- **Mobile (375px):** Sidebar vira drawer lateral via Sheet — funciona. Header simplificado. Form de abertura de chamado é legível mas os botões de tipo ficam muito comprimidos verticalmente (scroll necessário).
- **Tablet (768px):** Não testado explicitamente mas CSS sugere breakpoint md para padding.
- **Desktop (1280px):** Layout de sidebar fixa (lg:ml-72) + main — correto.

**Achado mobile:** O modal de acesso remoto que abre no mobile ocupa a tela toda adequadamente. O hamburger menu funciona via Sheet.

### 6.5 Consistência

**Bem resolvido:**
- Todos os formulários de criação seguem padrão: heading + descrição + CancelarButton + SubmitButton
- StatusBadge tem cores consistentes em todas as telas
- MetricCards têm padrão uniforme de icon + label + valor

**Inconsistências encontradas:**
- Problemas e Mudanças usam side panel (painel lateral inline na mesma tela); Termos e Estoque usam Dialog; Usuários usa form fullpage — 3 padrões diferentes para a mesma ação de criar/editar
- O detalhe do chamado usa a tela toda (fullpage); o detalhe de problema/mudança usa side panel — inconsistente para o usuário que espera o mesmo padrão

---

## 7. INTEGRAÇÕES ENTRE MÓDULOS

### Integração confirmada (funciona)

| Fluxo | Verificação |
|-------|-------------|
| Chamado → Ativo (equipamento) | Detalhe do chamado exibe hostname, CPU/Mem/Disco, IP do ativo vinculado |
| Chamado → Acesso Remoto | Botão "Conectar remoto" no detalhe abre console em overlay com o ativo do chamado |
| Chamado → Resolução → Auditoria | Resolve gera entrada na auditoria com usuário, timestamp e chamado |
| Tipo de chamado → Aprovação → Termo | Fluxo de empréstimo de notebook com aprovação fixa e termo funciona E2E |
| Automação → Chamado | Chamado #1041 criado com tipo "Erro em sistema" foi atribuído automaticamente ao Técnico Demo (prioridade Alta → equipe Suporte Matriz → Técnico Demo) |
| SLA → Chamado | SLA calculado na abertura; violação refletida na fila e no detalhe |
| Notificações → Chamado | Notificação "Chamado #1016 resolvido" gerada e exibida no bell |
| Estoque → Chamado automático | "Abrir chamado automaticamente ao atingir o mínimo" — configurável no form de item |
| ⌘K → Navegação | Command palette filtra e navega corretamente para telas e ações |

### Integração ausente ou incompleta

| Fluxo esperado | Status |
|----------------|--------|
| Chamado → Problema (vincular incidente) | Ausente — problema não tem botão de vínculo |
| Mudança → Workflow de aprovação | Ausente — sem botões de transição de estado |
| Estoque → Resolução do chamado | Ausente — ao resolver, não é possível dar saída de item |
| Problema → Mudança (escalação) | Ausente — problema não tem "Criar mudança" |
| Central de Ajuda → Tipo de chamado | Parcial — CTA "Abrir chamado" na KB funciona mas não pré-seleciona o tipo |

---

## 8. FACILIDADE DE USO POR PERFIL

### ADMIN

**Telas disponíveis:** Todos os 27 módulos  
**Facilidade:** Alta para usuários técnicos; média para não-técnicos  
**Pontos de trava:**
- Configuração de SLA (metas por prioridade em minutos/horas) requer conhecimento do conceito
- Criação de Tipo de chamado com fluxo de aprovação + termo é multi-step mas bem guiada
- Perfis de permissão: matriz de 20+ linhas × 4 colunas é densa mas funcional

**Benchmark:** ServiceNow é ainda mais denso; Zendesk Admin é comparável. FunevDesk está bem para o público-alvo.

### TÉCNICO

**Telas disponíveis:** Dashboard, Chamados, Ativos, Impressoras, Problemas, Mudanças, Base de conhecimento, Documentação, Usuários  
**Facilitado:** Sidebar enxuta; foco nos fluxos de atendimento  
**Pontos de trava:**
- O técnico tem acesso a "Usuários" (leitura+edição) mas não a "Equipes" — pode confundir pois não consegue gerir sua própria fila
- A tela de Problemas e Mudanças existe mas sem workflow completo — o técnico não consegue avançar estados por si só
- O botão "Resolver" exige descrição de resolução — positivo, mas sem sugestões ou macros, pode ser lento para resoluções padronizadas

**Benchmark:** Linear tem atalhos de teclado para mover issues entre estados. FunevDesk não tem atalhos de teclado para fluxo de atendimento (exceto ⌘K para navegação).

### COLABORADOR (usuário final leigo)

**Telas disponíveis:** Abrir chamado, Meus chamados, Central de Ajuda  
**Facilitado:** Sidebar mínima com 3 itens; formulário adaptativo; CTA claro  
**Pontos de trava:**
- O formulário de abertura valida sem mensagem inline — usuário leigo pode não entender o asterisco vermelho
- "QA · Todos os campos" aparece como tipo de chamado para o colaborador — é um tipo de teste que deveria ser filtrado
- A lista "Meus chamados" não tem busca por texto — difícil encontrar chamados em históricos longos (12+ chamados na demo)
- As notificações mostram "Chamado #1016 resolvido" mas não levam ao chamado com 1 clique — o texto é link mas não é óbvio

**Benchmark:** Freshdesk portal do usuário tem busca inline e filtragem por data. FunevDesk está um passo atrás.

---

## 9. ACESSO REMOTO (módulo 11 — análise aprofundada)

- **Abertura:** Via botão "Conectar remoto" no detalhe do chamado (funciona); via botão "Acesso remoto" na lista de ativos (funciona)
- **Interface:** Modal overlay com área de vídeo + toolbar (Mouse/Teclado/Arquivo) — adequado
- **Estado de conexão:** "Conectando…" visível — bom; sem timeout visível se o agente não responder
- **Auditoria:** Sessão remota registrada na trilha de auditoria com timestamp — excelente

**Falta:** Sem opção para agendar acesso remoto; sem histórico de sessões anteriores por ativo

---

## 10. TOP 10 AÇÕES PRIORIZADAS (impacto × esforço)

| # | Ação | Impacto | Esforço | Ganho esperado | Padrão alcançado |
|---|------|---------|---------|----------------|------------------|
| 1 | Implementar workflow de transição de estados em Mudanças (Aprovar/Implementar/Concluir) | Crítico | Médio | Módulo ITIL completo e utilizável | ServiceNow, Jira SM |
| 2 | Adicionar "Vincular chamado" ao detalhe do Problema | Alto | Baixo | Integração incidente→problema funcional | ServiceNow ITIL |
| 3 | Resolver polling excessivo de /api/dashboard e /api/catalog (rever dependências de useEffect e adicionar SWR/React Query) | Alto | Médio | Redução de custo de servidor; melhor performance | Padrão React |
| 4 | Campo de saída de estoque na resolução do chamado | Alto | Médio | Integração estoque→chamado real | Freshservice, HappyFox |
| 5 | Validação inline com mensagem de erro por campo no form de abertura | Médio | Baixo | Usuário leigo entende sem suporte | Zendesk, Linear |
| 6 | Busca por texto em "Meus chamados" (portal do colaborador) | Médio | Baixo | Colaborador encontra chamados antigos | Freshdesk portal |
| 7 | Macros de resolução rápida (textos pré-prontos) | Médio | Médio | Técnico resolve 2x mais rápido chamados padronizados | Zendesk macros |
| 8 | Inline edit de responsável no detalhe do chamado (eliminar dialog intermediário) | Médio | Baixo | Reduz atribuição de 4 para 2 cliques | Linear, Jira SM |
| 9 | Padronizar padrão de detalhe (todos como page fullscreen OU todos como side panel) | Médio | Médio | Consistência; elimina confusão de UX | Zendesk, Jira SM |
| 10 | Notificações clicáveis (clicar na notificação abre o chamado diretamente) | Médio | Baixo | Reduz do bell ao chamado de 2 para 1 clique | Todas as ferramentas de mercado |

---

## APÊNDICE A — Cobertura de testes por funcionalidade

### Módulo 2 — Fila de Chamados (todas as features testadas)
- [x] Busca por texto — filtra corretamente
- [x] Filtro de status/prioridade/SLA/responsável/equipe/tipo — painel expansível funciona
- [x] Filtros rápidos (cards: Abertos, Em andamento, SLA violado, Alta/crítica, Concluídos) — navegam corretamente
- [x] Ações rápidas via "..." (Abrir, Acesso remoto, Resolver) — menu abre corretamente
- [x] Seleção em massa + barra de bulk actions (Atribuir a mim, Atribuir responsável) — funciona
- [x] Preset de fila (Todos, Meus chamados, Não atribuídos, Abertos) — funciona
- [x] Paginação — funciona
- [x] "Limpar" filtros — funciona

### Módulo 4 — Detalhe do Chamado (todas as features testadas)
- [x] Mudar situação via badge clicável (dropdown com situações configuradas) — funciona
- [x] Aba Público — mensagens visíveis
- [x] Aba Interno — mensagens internas
- [x] Aba Eventos — log de auditoria do chamado
- [x] Editor rich text — funciona
- [x] Resolver chamado — dialog com validação de conteúdo + confirmação — funciona
- [x] Reabrir chamado — volta para "Em atendimento" — funciona
- [x] Checklist técnico — marcar items + Salvar — funciona com toast de confirmação
- [x] Painel de IA (Explicar) — overlay com análise em linguagem simples — funciona
- [x] Transferir responsável — dialog com dropdown de técnicos — funciona
- [x] Conectar remoto — modal de console — abre e exibe "Conectando…"
- [x] SLA — exibe "Violado há Xh" ou "Xh restantes" corretamente

### Módulo 23 — Configurações Gerais (todas as features testadas)
- [x] Nome da organização e do sistema — editáveis
- [x] Logo do sistema — upload funcional
- [x] Cores primária e secundária — color picker + input hex
- [x] Modo de navegação (Navbar/Sidebar) — configurável
- [x] Horário comercial (início/fim) — time inputs
- [x] SLA padrão em horas — number input
- [x] Metas de SLA por prioridade (1ª resposta em min + resolução em h) — todos editáveis
- [x] Acesso remoto (toggle ativo/inativo) — visível
- [x] Chamados automáticos (toggle) — visível

---

## APÊNDICE B — Erros de rede observados

| Endpoint | Status | Frequência | Crítico? |
|----------|--------|------------|----------|
| GET /api/dashboard | 200 | 6-12x por navegação | Não (funciona, mas excessivo) |
| GET /api/catalog | 200 | 6-12x por navegação | Não (funciona, mas excessivo) |
| GET 127.0.0.1:47832/api/local | ERR_ABORTED | Contínuo | Não (agente local — erro esperado sem agente) |
| GET /api/catalog/types | 405 Method Not Allowed | Pontual (teste manual) | Baixo (não usado pela UI) |

---

*Relatório gerado em 2026-06-27 após auditoria exaustiva de todos os 27 módulos com os três perfis (admin, técnico, colaborador).*
