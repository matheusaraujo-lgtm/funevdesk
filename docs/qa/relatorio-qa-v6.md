# Relatório QA v6 — FunevDesk

Auditoria de máximo rigor (direção de design/UX, benchmark mundial 2026). App rodando em :3000, testado nos 3 perfis (admin/técnico/usuário). Medições com `getBoundingClientRect`/`getComputedStyle` @1440px. Persistência confirmada por network (POST/PATCH 200/201) e recontagem de DOM.

---

## 1. Resumo executivo

**Nota geral: 8.4/10.** FunevDesk é um produto **maduro, estável e amplo** — cobre os 27 módulos com fluxos reais e persistência verdadeira. Nesta rodada **não encontrei nenhum bug crítico nem erro de console/servidor** em uma bateria pesada de ações (criação de chamado, resolução, reabertura, workflow ITIL de mudança, vínculo problema↔chamado, bulk-actions, checklist). O ciclo de vida do chamado (abrir → assumir → checklist → resolver → reabrir) funciona ponta a ponta.

**Veredito: apto a produção (piloto amplo).** Não há bloqueadores. O que separa o FunevDesk de "referência mundial" não são defeitos, e sim **polimento de densidade, performance de dados e profundidade competitiva** de alguns módulos.

**Maturidade vs. mercado:** núcleo de chamado no nível de Freshservice/Zendesk em funcionalidade; abaixo de Linear em velocidade percebida (sem teclado/⌘K real na fila, refetch bruto) e abaixo de Zendesk/Intercom em recursos de produtividade do agente (macros, respostas prontas, SLA timeline rico).

**5 temas que mais limitam a experiência:**
1. **Performance de dados (refetch bruto):** polling de 7 GETs completos `no-store` a cada 30s. Não é o padrão 2026 (SWR/websocket/delta).
2. **Densidade folgada e ritmo com "quebras" pontuais:** gaps fora da escala (14px no detalhe, 2px de pr no sidebar), linha de tabela 61px (folgada), 2 conjuntos de KPI cards (dashboard + topo da fila) repetindo a mesma informação.
3. **CTAs de "abrir chamado" pulverizados:** o botão global no topbar aparece em TODA tela (inclusive onde não faz sentido, ex.: dentro do detalhe de um chamado e na config de SLA), e no detalhe de Ativo soma-se a um segundo "Abrir chamado".
4. **Inconsistências finas de padrão:** margem de página admin 36px vs portal 24px; header de coluna "Ações" vs coluna sem header; padding de card KPI assimétrico.
5. **Módulos periféricos "de catálogo":** Segurança/Documentação/Relatórios funcionam, mas entregam o básico — falta a profundidade que os líderes têm (ver Seção 11).

---

## 2. Scorecard dos 27 módulos

| # | Módulo | Status | Nota | Nível | Principal ponto |
|---|--------|--------|------|-------|-----------------|
| 1 | Dashboard | ✅ | 8.0 | 🟢 | KPIs clicáveis; repete métricas que reaparecem no topo da fila |
| 2 | Fila de chamados | ✅ | 8.5 | 🟢 | Busca/filtros/bulk OK; linha 61px folgada, sem teclado |
| 3 | Abrir chamado | ✅ | 9.0 | ⭐ | Tipo-primeiro + validação inline + campos dinâmicos; excelente p/ leigo |
| 4 | Detalhe do chamado | ✅ | 8.7 | 🟢 | Ciclo completo provado; gap 14px e pr 2px fora da escala |
| 5 | Portal do colaborador | ✅ | 8.8 | ⭐ | Nav enxuta, microcopy humano; leigo abre chamado sem treino |
| 6 | Inventário (Ativos) | ✅ | 8.3 | 🟢 | Import/export CSV, filtros ricos; 2 CTAs de chamado no detalhe |
| 7 | Estoque | ✅ | 8.0 | 🟢 | Movimentar (entrada/saída) OK; falta vínculo visível com resolução |
| 8 | Impressoras | ✅ | 7.8 | 🟢 | Status SNMP, Verificar agora; usa cards (sem tabela densa) |
| 9 | Monitoramento de rede | ✅ | 8.2 | 🟢 | 15 disp, colunas completas, import CSV, verificar agora |
| 10 | Segurança (XDR) | ⚠️ | 7.0 | 🟠 | Estrutura boa, mas sem dados de demo; raso vs SIEM/XDR reais |
| 11 | Acesso remoto | ⚠️ | 7.0 | 🟠 | "Conectar remoto" no chamado e ativo; depende de agente local (falha sem ele) |
| 12 | Problemas | ✅ | 8.5 | 🟢 | Vínculo de chamados (Gerenciar) ótimo; microcopy de causa raiz |
| 13 | Mudanças | ✅ | 8.8 | ⭐ | Workflow ITIL completo provado (Solicitado→...→Concluído) |
| 14 | Base de conhecimento | ✅ | 8.0 | 🟢 | Editar dados/conteúdo; integra com Central de Ajuda |
| 15 | Documentação | ✅ | 7.5 | 🟢 | Filtros tipo/unidade; básico vs Notion |
| 16 | Termos de equipamento | ✅ | 8.0 | 🟢 | Gera PDF; integra com tipo de chamado |
| 17 | Modelos de termo | ✅ | 8.0 | 🟢 | Editar dados/conteúdo; designer presente |
| 18 | Equipes | ✅ | 7.8 | 🟢 | Equipe/Unidade/Membros |
| 19 | Relatórios | ✅ | 7.8 | 🟢 | KPIs + Por unidade/prioridade (sem duplicação ✅); export CSV; raso vs Freshservice |
| 20 | Auditoria | ✅ | 8.5 | 🟢 | 50 regs, colunas completas, export, paginação |
| 21 | Usuários | ✅ | 8.3 | 🟢 | Menu de ações completo (Editar/Reset/Desativar/Excluir) |
| 22 | Perfis/permissões | ✅ | 8.8 | ⭐ | Matriz por tela; perfil muda a UI (provado nos 3 perfis) |
| 23 | Config geral (SLA/marca/agente) | ✅ | 7.8 | 🟢 | Completo, mas página longa em coluna única (sem progressive disclosure) |
| 24 | Unidades | ✅ | 8.0 | 🟢 | Cols completas, Vínculos |
| 25 | Localizações | ✅ | 7.8 | 🟢 | Header "Ações" inconsistente com outras tabelas |
| 26 | Tipos/Categorias/Situações | ✅ | 8.6 | 🟢 | Fluxo por tipo (aprovação+termo), Pausa SLA por situação |
| 27 | Automações & Webhooks | ✅ | 8.2 | 🟢 | Regra condição→ação; 15 eventos de webhook |

Legenda: ⛔ Quebrado · 🟠 Funcional atrás do mercado · 🟢 Bom · ⭐ Padrão de mercado.

---

## 3. Bugs

**Nenhum bug Crítico ou Alto encontrado.** Console e logs do servidor limpos após bateria pesada.

| Sev. | Tela | Reproduzir | Esperado vs. obtido | Evidência / arquivo |
|------|------|-----------|--------------------|---------------------|
| Médio | Global | Deixar app aberto 30s+ | Atualização leve/delta | 7 GETs completos `no-store` a cada 30s (dashboard, catalog, users, settings, branches, profiles, term-templates). Network mostra centenas de GETs idênticos | `src/app/page.js:228-234` (setInterval 30000 → loadData) |
| Baixo | Fila | Inspecionar header vs célula | Rótulo alinhado ao conteúdo | `th` `padding-left:8px` vs `td` `padding-left:12px` → 4px de desalinhamento | tickets-view (Table) |
| Baixo | Detalhe do chamado | Inspecionar grid 2 col | Gap na escala 4/8 | `column-gap:14px` (deveria 12/16); coluna direita `padding-right:2px` | ticket-details |
| Baixo | Mudanças (form) | Abrir "Nova mudança" | Campo com dica | Input "Título" sem `placeholder` | change-form-view |
| Baixo | Localizações | Comparar cabeçalhos | Padrão consistente | Coluna de ações nomeada "Ações"; demais tabelas usam header vazio | settings-locations-view |

> Observação: o erro de rede `127.0.0.1:47832/api/local [FAILED]` é o agente local ausente no ambiente de teste — comportamento esperado, não é bug do app.

---

## 4. Atrito & eficiência

| Tarefa | Cliques atuais | Benchmark | Proposta |
|--------|----------------|-----------|----------|
| Abrir chamado (admin) | escolher tipo + título + descrição + obrigatórios (≈5-7 campos no tipo "todos") | Zendesk/Freshservice: 2-3 campos com defaults | Manter tipo-primeiro; reduzir campos obrigatórios por tipo, usar defaults inteligentes (unidade/localização do usuário) |
| Atribuir chamado | bulk "Atribuir a mim" = 2 cliques (✅ bom) | Linear: 1 (tecla A) | Adicionar atalhos de teclado na fila (A=assumir, números=prioridade) |
| Navegar a um chamado | clique na linha (✅ bom) | Zendesk: clique | OK |
| Mudar status na fila | select inline por linha (✅ bom) | OK | OK |
| Resolver chamado | Resolver → descrever → confirmar = 3 passos | Zendesk macro: 1 | Oferecer "respostas de resolução" prontas (macros) |
| Filtrar fila | pills + select + "Filtros" | Zendesk views salvas | Permitir **salvar visões** personalizadas (ainda não há) |

**Faltam (eficiência de classe mundial):** atalhos de teclado na fila, ⌘K que execute ações (não só busca), macros/respostas prontas, visões salvas, edição inline de prioridade.

---

## 5. Integração entre módulos

| Fluxo | Funciona? | Contexto preservado | Cliques | Nota |
|-------|-----------|---------------------|---------|------|
| Dashboard KPI → fila filtrada | ✅ | Sim (filtro aplicado) | 1 | Ótimo |
| Problema ↔ Chamados (Gerenciar/Vincular) | ✅ provado | Sim | 2 p/ vincular | Excelente; microcopy de causa raiz |
| Mudança: workflow ITIL | ✅ provado | Sim | 1 por transição | Excelente |
| Tipo de chamado → campos/checklist/termo/aprovação | ✅ | Sim | — | Forte (Fluxo configura aprovador + modelo de termo) |
| Situação ↔ SLA (Pausa SLA) | ✅ (config visível) | Sim | — | Bom |
| Chamado → Acesso remoto ("Conectar remoto") | ⚠️ | Sim | 1 | Depende de agente local |
| Ativo → Chamados do ativo / Abrir chamado | ✅ | Sim | 1 | Bom, mas 2 CTAs concorrendo |
| KB → Central de Ajuda (portal) | ✅ provado | Sim | — | Artigo do KB aparece ao leigo |
| Usuário/Perfil → telas visíveis | ✅ provado (3 perfis) | Sim | — | Admin 26 itens / Técnico 9 / Employee 4 |
| Deep-link `?ticket=` | ✅ | Sim | — | URL reflete o chamado aberto |
| Estoque ↔ resolução de chamado (baixa) | ⚠️ não evidenciado na resolução | — | — | Não vi baixa automática ao resolver; revisar |

**Costura geral muito boa.** O ponto a investigar é a baixa de estoque na resolução (esperado em ITSM de classe mundial quando o tipo consome item).

---

## 6. Facilidade de uso por perfil

**(a) Técnico/Admin** — A fila é eficiente (busca, filtros rápidos, bulk-actions com persistência). O detalhe tem tudo à mão (assumir, transferir, checklist, resolver, IA, remoto) e o toggle "Ocultar detalhes" dá foco à conversa. Configurar é compreensível (matriz de perfis clara, SLA por prioridade, automações condição→ação). **Trava em:** ausência de atalhos de teclado e de visões salvas; config geral é uma página longa em coluna única (cansativa).

**(b) Usuário leigo** — **Excelente.** Cai direto em "Abrir chamado", vê 3 tipos como cards, e o formulário do tipo simples pede só Título + Descrição com microcopy humano ("O que aconteceu? Quando começou? Como isso afeta seu trabalho?"). Após enviar, vai para "Meus chamados" e vê o status "Aberto"; consegue acompanhar e responder. **Não precisa de treino.** Pequeno ruído: o item de menu "Novo chamado" + o submit "Abrir chamado" usam verbos diferentes para a mesma ação (padronizar).

---

## 7. Linguagem (UX writing)

Microcopy geralmente **forte**. Pontos a ajustar:

| De | Para | Motivo |
|----|------|--------|
| "Novo chamado" (menu) + "Abrir chamado" (botão/submit) | Escolher 1 verbo: **"Abrir chamado"** em todo lugar | Inconsistência de termo para a mesma ação |
| "Registrar" (submit de Mudança) | "Criar mudança" / "Registrar mudança" | "Registrar" sozinho é ambíguo |
| "Texto curto" / "Texto longo" / "Lista de opções" (labels do tipo QA) | nomes de negócio reais | Vazamento de jargão de configuração para o formulário do usuário |
| "SLA OK" / "8h restantes" | OK (claro) | manter |
| Coluna "Ações" (Localizações) vs header vazio (demais) | padronizar (vazio ou sempre "Ações") | Consistência |
| "Reposição auto." (Estoque) | "Reposição automática" | Abreviação desnecessária |
| Subtítulo Segurança "Ameaças de XDR/EPP" | manter mas explicar XDR/EPP em tooltip | Sigla técnica para quem não é de segurança |

Erros/validação **muito bons**: "Escreva um título com pelo menos 5 caracteres.", "Descreva o que está acontecendo.", "Vincule incidentes recorrentes a este problema para tratar a causa raiz." — exemplares.

---

## 8. Design 2026 & poluição

**Limpeza geral: boa.** Telas não afogam o usuário; um CTA primário por tela (exceto o topbar global). Hierarquia clara (hero → KPIs → conteúdo). Estados vazios bem escritos (Segurança "Nenhum alerta de segurança" + explicação).

**Pontos de poluição/redesenho:**
- **Dois conjuntos de KPI cards** (Dashboard + topo da Fila) mostram quase as mesmas métricas. No mundo Linear/Stripe, a fila não repete o dashboard — mostraria no máximo contadores discretos nos próprios filtros. **Remover os KPI cards do topo da fila** (ou reduzir a chips nos filtros).
- **Topbar global "Novo chamado"** aparece em telas onde é ruído (dentro do detalhe de um chamado, na config de SLA, na auditoria). **Rebaixar para contextual** (mostrar só onde abrir chamado é a próxima ação plausível: dashboard, fila, ativos, portal).
- **Card KPI com padding assimétrico** (`pl-6 pr-5 py-5`): padronizar para `p-5` ou `px-5 py-4`.
- **Config geral**: página longa em coluna única → aplicar **progressive disclosure** (abas ou seções colapsáveis: Marca / SLA / Horário / Agente), como ServiceNow/Jira fazem para "não assustar".
- **Linha de tabela 61px**: reduzir para ~48-52px (Zendesk) para ver mais chamados sem rolar; modo "compacto" opcional (Linear).

---

## 9. Espaçamento & ritmo (medido @1440px)

| Local | Atual (px) | Proposto | Regra violada |
|-------|-----------|----------|---------------|
| Detalhe — gap do grid 2 col | **14px** | 16px | Fora da escala 4/8 |
| Detalhe — coluna direita `padding-right` | **2px** | 0 ou 4px | Fora da escala (provável artefato de ring/scrollbar) |
| Fila — `th` pad-left vs `td` pad-left | **8px vs 12px** | igualar (12/12) | Desalinhamento header↔célula de 4px |
| Card KPI — padding | **pt/pb 20, pl 24, pr 20** | `p-5` (20/20/20/20) ou `px-6 py-5` | Assimetria L≠R |
| Margem de página — admin vs portal | **36px (px-9) vs 24px** | unificar (28-32px) | Inconsistência entre peles |
| Hero header — altura dashboard vs fila | **101px vs 121px** | padronizar altura/padding do hero | Ritmo desigual entre telas |
| Ritmo vertical da fila (`space-y-5`) | **20px uniforme** | OK | — (consistente ✅) |
| Gap interno do card da tabela | **16px uniforme** | OK | — (consistente ✅) |

**3 piores (priorizar):** (1) margem de página inconsistente admin/portal (36 vs 24px) — quebra a unidade visual entre as duas experiências; (2) desalinhamento header/célula de 4px na fila (tela mais usada); (3) gap 14px + pr 2px no detalhe do chamado (tela redesenhada recentemente).

> Aspecto positivo medido: dentro de cada tela o ritmo vertical é **consistente** (20px entre seções, 16px dentro dos cards). O problema é nos detalhes finos e na consistência **entre** telas/peles, não no ritmo macro.

---

## 10. CTAs & ações redundantes

**"Abrir/Novo chamado" — mapeamento de pontos de entrada:**
- **Topbar global "Novo chamado":** presente em **todas** as telas do admin (dashboard, fila, ativos, problemas, mudanças, KB, config, auditoria, e até **dentro do detalhe de um chamado**). É 1 botão, mas **onipresente** — vira ruído nas telas onde abrir chamado não é a ação esperada.
- **Detalhe do Ativo:** topbar "Novo chamado" (x=1276) **+** "Abrir chamado" da página (x=1211) = **2 CTAs de abrir chamado no mesmo viewport** disputando. Manter **um** (o contextual da página, que já leva o ativo no contexto) e remover o global aqui.
- **Portal (leigo):** item de nav "Novo chamado" + submit "Abrir chamado" — não é redundância real (nav vs submit), mas usam **verbos diferentes** (padronizar).
- **Dashboard:** 1 CTA "Novo chamado" no topbar (correto) + os 3 KPI/pills levam à fila (não a abrir) — OK.

**Recomendação:** tornar o "Novo chamado" do topbar **contextual** — exibir só em Dashboard, Fila, Ativos e Portal; ocultar em Detalhe de chamado, Config, Auditoria, Relatórios. No detalhe do Ativo, manter apenas o "Abrir chamado" contextual.

**Outras ações repetidas:**
- **KPI cards duplicados** (dashboard + topo da fila) — remover do topo da fila.
- **"Verificar agora"** existe em Impressoras e Monitoramento (coerente, ações distintas) — OK.
- Contagem por viewport: telas de lista têm **1 primário** + topbar global; o único caso de **2 primários disputando** é o Detalhe do Ativo.

---

## 11. Gaps vs. o melhor do mundo

Para cada módulo abaixo de ⭐:

- **Segurança/XDR (🟠 7.0)** — Líder: Microsoft Sentinel / CrowdStrike Falcon. Faltam: linha do tempo de incidente, correlação de alertas, ações de resposta (isolar host), MITRE ATT&CK mapping, e dados/seed para demonstrar. Hoje é uma lista de alertas com conectores. **Implementar:** detalhe de alerta com timeline + ação "abrir chamado a partir do alerta" (já citado) + severidade visual.
- **Relatórios (🟢 7.8)** — Líder: Freshservice Analytics / Stripe Dashboard. Faltam: drill-down, comparação de período, tendência (linha temporal), CSAT detalhado, filtros por equipe/agente, agendamento de relatório por e-mail. Hoje são KPIs estáticos + 2 quebras. **Implementar:** 1 número-herói por aba + gráfico de tendência + drill-down clicável.
- **Documentação (🟢 7.5)** — Líder: Notion/Confluence. Faltam: hierarquia/árvore, busca full-text, blocos ricos, versionamento. Hoje é lista + editor. **Implementar:** navegação em árvore + busca.
- **Impressoras (🟢 7.8)** — Líder: PaperCut. Faltam: histórico de consumo de toner, custo por página, alertas proativos abrindo chamado (parcial). **Implementar:** gráfico de consumo + abertura automática de chamado por nível crítico.
- **Acesso remoto (🟠 7.0)** — Líder: TeamViewer/AnyDesk. Depende do agente; falta fallback web (WebRTC) e sessão auditada embutida. **Implementar:** estado claro quando agente ausente + log de sessão no chamado.
- **Config geral (🟢 7.8)** — Líder: Atlassian/ServiceNow admin. Falta progressive disclosure (hoje página longa). **Implementar:** abas/seções colapsáveis.
- **Fila (🟢 8.5)** — Líder: Linear. Faltam: atalhos de teclado, visões salvas, densidade compacta, ⌘K com ações. **Implementar:** esses 4 = salto a ⭐.

Módulos já no nível ⭐ (manter): Abrir chamado, Portal, Mudanças (ITIL), Perfis/permissões.

---

## 12. Top 10 ações priorizadas (impacto × esforço)

1. **Substituir o polling bruto por SWR/revalidação sob foco (ou websocket p/ fila/notificações).** Ganho: app deixa de fazer 7 GETs/30s; sensação de velocidade Linear. (alto impacto / médio esforço) `page.js:228`
2. **Tornar o "Novo chamado" do topbar contextual** e remover o 2º CTA no detalhe do Ativo. Ganho: fim da redundância apontada pelo dono. (alto / baixo)
3. **Remover os KPI cards do topo da Fila** (já estão no Dashboard). Ganho: menos poluição, foco na tabela. (alto / baixo)
4. **Atalhos de teclado + visões salvas na fila** (A=assumir, J/K navegar, salvar filtro). Ganho: fila no nível Linear/Zendesk. (alto / médio)
5. **Unificar margem de página admin (36px) e portal (24px)** e a altura do hero entre telas. Ganho: unidade visual. (médio / baixo)
6. **Corrigir desalinhamento header↔célula (8 vs 12px) e gap 14px/pr 2px do detalhe.** Ganho: precisão de pixel cobrada pelo dono. (médio / baixo)
7. **Progressive disclosure na Config geral** (abas Marca/SLA/Horário/Agente). Ganho: não assustar, padrão enterprise. (médio / médio)
8. **Macros/respostas de resolução prontas** no dialog Resolver e na conversa. Ganho: produtividade do agente (Zendesk). (alto / médio)
9. **Densidade compacta opcional na tabela** (linha 48-52px). Ganho: mais chamados por tela. (médio / baixo)
10. **Padronizar microcopy de CTA** ("Abrir chamado" em todo lugar) e revisar labels técnicos vazados ("Texto curto/longo"). Ganho: consistência de linguagem. (médio / baixo)

---

### Cobertura de teste (prova)
Persistência confirmada via network: `POST /api/tickets 201` (chamado #1043), `POST /messages 201`, `PATCH /tickets 200` (atribuir), `POST /api/network/check`, criação de Mudança + transições de workflow, vínculo/desvínculo Problema↔Chamado, checklist salvo, **resolução (Resolvido) e reabertura (Em atendimento)**. 3 perfis exercidos (admin 26 itens de nav / técnico 9 / employee 4). Console e logs do servidor **sem erros**.
