# Relatório QA/UX — FunevDesk — Auditoria v5
Data: 2026-06-27 | Auditor: Diretor de Design de Produto/UX | Ambiente: dev/localhost:3000 | Viewport principal: 1366×768

---

## 1. Resumo Executivo

**Nota geral: 7,6 / 10** (vs. v4 estimado ~6,8)

O FunevDesk amadureceu visivelmente nesta rodada. As correções entregues — layout de 2 colunas no detalhe do chamado, vínculo de chamados a Problemas, validação inline, workflow de Mudanças e microcopy — todas funcionam conforme especificado e sem regressões críticas encontradas. O produto está em nível piloto estável com bloqueadores menores, não críticos. Nenhum dado foi perdido, nenhum fluxo principal está quebrado.

**Temas que ainda limitam a experiência:**

1. **Duplicação de dados nos Relatórios** (bug médio): o bloco "Por prioridade" renderiza os dados duas vezes na mesma tela — BarRow visual + lista de badges — criando ruído desnecessário.
2. **Inconsistência de terminologia "Situação" vs. "Status"**: a fila usa "Status" no cabeçalho de coluna; o detalhe do chamado usa "Situação" no aria-label e no módulo de configuração. Dois termos para o mesmo conceito.
3. **Microcopy com plurais genéricos "(s)"**: "0 anexo(s)", "chamado(s)" — padrão desnecessário quando a contagem já está presente.
4. **Fila de chamados sem ordenação clicável**: colunas não são clicáveis para ordenar; usuário não sabe que pode reordenar (sem cursor pointer nem ícone de sort).
5. **Acesso remoto persiste globalmente após abertura**: a sessão de acesso remoto iniciada em um chamado aparece como banner fixo em todas as telas até ser encerrada — pode confundir usuários que navegam entre módulos.

**Veredito:** Pronto para piloto com grupo controlado. Dois bugs médios precisam de correção antes de expansão de usuários.

---

## 2. Scorecard dos 27 Módulos

| # | Módulo | Status | Nota | Nível | Principal problema |
|---|--------|--------|------|-------|--------------------|
| 1 | Dashboard/Visão geral | ✅ | 8,0 | Bom | Subtítulo genérico; filtros de período/situação só filtram a lista de chamados recentes, não os cards de métricas |
| 2 | Fila de chamados | ✅ | 8,0 | Bom | Colunas sem sort clicável; sem indicador de página atual no scroll |
| 3 | Abrir chamado | ✅ | 8,5 | Bom | Validação inline OK; "(s)" no contador de anexos |
| 4 | Detalhe do chamado | ✅ | 8,5 | Bom | Layout 2 colunas funciona; accordion fecha/abre; toggle ocultar/mostrar OK; mobile empilha corretamente |
| 5 | Portal do colaborador | ✅ | 7,5 | Bom | "Central de Ajuda" com 1 artigo; usuário não vê status do responsável em tempo real |
| 6 | Inventário de equipamentos | ✅ | 7,5 | Bom | "Ver todos" de softwares condicional (só > 6 itens) — correto; sem inventário real no demo |
| 7 | Estoque | ✅ | 8,0 | Bom | Descrição correta; "baixa automática ao resolver chamados" documentada |
| 8 | Impressoras | ✅ | 7,5 | Bom | Status de erro claro; SNMP timeout bem comunicado |
| 9 | Monitoramento de rede | ✅ | 7,0 | Bom | 15 dispositivos todos OFFLINE/ALERTA — estado esperado sem infra real |
| 10 | Segurança (XDR) | ✅ | 7,5 | Bom | Conectores não configurados; estado vazio bem explicado |
| 11 | Acesso remoto | ✅ | 7,5 | Bom | Funciona via chamado e via ativo; persiste como banner global até encerrar (atrito médio) |
| 12 | Problemas | ✅ | 8,5 | Bom | Vínculo/desvínculo de chamados funciona; contagem atualiza |
| 13 | Mudanças | ✅ | 8,5 | Bom | Workflow ITIL SOLICITADO→ANALISE→APROVADO→IMPLEMENTANDO→CONCLUIDO funciona; "ANALISE" sem acento (bug cosmético) |
| 14 | Base de conhecimento | ✅ | 7,0 | Bom | 1 artigo; sem busca por voz; editor não testado a fundo |
| 15 | Documentação | ✅ | 7,0 | Bom | 1 documento; funcional básico |
| 16 | Termos de equipamento | ✅ | 8,0 | Bom | PDF gerado; assinatura por senha OK |
| 17 | Modelos de termo | ✅ | 7,5 | Bom | 1 modelo ativo; editor funcional |
| 18 | Equipes | ✅ | 7,0 | Bom | 1 equipe com 0 membros — sem validação de equipe vazia |
| 19 | Relatórios | ⚠️ | 6,5 | Funcional | BUG: "Por prioridade" renderiza dados duplicados (BarRow + badges simultaneamente) |
| 20 | Auditoria | ✅ | 8,0 | Bom | Exportar CSV presente; logs detalhados |
| 21 | Usuários | ✅ | 8,0 | Bom | CRUD funcional; 5 usuários ativos |
| 22 | Perfis/permissões | ✅ | 8,0 | Bom | Matriz por tela completa; base_role bem explicada |
| 23 | Configurações gerais | ✅ | 8,0 | Bom | SLA, marca, cores, horário comercial — todos presentes |
| 24 | Unidades | ✅ | 8,0 | Bom | Matriz + filial; 2 unidades |
| 25 | Localizações | ✅ | 7,5 | Bom | 3 localizações; sem busca |
| 26 | Tipos/Categorias/Situações | ✅ | 8,0 | Bom | Situações, categorias, tipos de chamado — todos funcionais |
| 27 | Automações & Webhooks | ✅ | 7,5 | Bom | 1 regra ativa; webhooks com dados de demo; sem teste de disparo real |

---

## 3. Bugs

### [Médio] Relatórios — Duplicação visual no bloco "Por prioridade"
- **Tela:** Relatórios
- **Reprodução:** Navegue para Relatórios. Role até o card "Por prioridade". Os dados aparecem duas vezes: primeiro como gráfico de barras (BarRow visual), depois imediatamente abaixo como lista de badges com os mesmos valores (CRITICA: 0, ALTA: 35, MEDIA: 6, BAIXA: 0 — repetidos).
- **Esperado:** Uma única representação dos dados de prioridade, complementar e não redundante.
- **Obtido:** Os valores de prioridade são renderizados duas vezes na mesma seção, duplicando o conteúdo visual e confundindo o usuário.
- **Arquivo:** `src/components/reports-view.jsx` linhas 178–179. Linha 178 renderiza `byPriority.map()` como BarRow; linha 179 renderiza o mesmo `byPriority.map()` como badges. Ambos no mesmo `CardContent` sem separação visual clara de intenção.
- **Evidência:** Texto do innerText confirma: `CRITICA 0 ALTA 35 MEDIA 6 BAIXA 0 CRITICA 0 ALTA 35 MEDIA 6 BAIXA 0`

### [Baixo] Mudanças — Status "ANALISE" sem acento
- **Tela:** Módulo Mudanças, cabeçalho do painel lateral e filtros
- **Reprodução:** Abra Mudanças. No status do item, vê-se "ANALISE" (code interno) em vez de "Análise" (labelizado).
- **Esperado:** O label "Análise" deveria ser exibido consistentemente.
- **Obtido:** Em alguns lugares o código interno "ANALISE" vaza para o display (filtro de tab não tem "Análise" como opção separada do "Todos").
- **Arquivo:** `src/components/changes-view.jsx` linha 20 — `statusLabels` tem `ANALISE: "Análise"` mas a lista de presets (`statusPresets`) linha 30–36 não inclui "ANALISE" como filtro separado, então chamados em análise só aparecem em "Todos".

### [Baixo] Ticket create — Contador de anexos usa pluralização genérica "(s)"
- **Tela:** Formulário "Abrir chamado" — rodapé de ação
- **Reprodução:** Selecione qualquer tipo. O rodapé mostra `{tipo} · {n} anexo(s)`.
- **Esperado:** `1 anexo` / `2 anexos` — plural correto.
- **Obtido:** `0 anexo(s)` — o sufixo "(s)" é pattern técnico, não linguagem natural.
- **Arquivo:** `src/components/ticket-create-view.jsx` linha 445.

### [Baixo] Fila de chamados — "Status" vs. "Situação" inconsistente
- **Tela:** Fila de chamados (header de coluna = "Status"); Detalhe do chamado (aria-label = "Situação"); Configurações > Situações (usa "Situação"); Relatórios (usa "Situação")
- **Impacto:** Dois termos para o mesmo conceito em telas do mesmo produto.
- **Arquivo:** `src/components/tickets-view.jsx` (cabeçalho "Status"), `src/components/ticket-status-pills.jsx` (aria-label "Situação").

---

## 4. Atrito & Eficiência

| Tarefa | Cliques atuais | Benchmark | Redução proposta |
|--------|----------------|-----------|-----------------|
| Abrir chamado (admin, tipo + título + desc) | 4 interações | Zendesk: 3 | Pré-selecionar tipo mais frequente; atalho ⌘N |
| Resolver chamado | Status > dropdown > opção (mas "Resolvido" não está no dropdown de situação do detalhe) | Freshservice: 1 clique "Resolver" | Adicionar botão primário "Resolver" no cabeçalho do chamado (atualmente usa dialog separado ResolveTicketDialog) |
| Vincular chamado a Problema | Problemas > clicar linha > Gerenciar > Vincular | 4 passos | Do detalhe do chamado, permitir vincular a Problema diretamente |
| Atribuir chamado em massa | Selecionar linha > "Selecionar responsável..." | 2 passos | OK — bom padrão |
| Busca na fila | Digitar + aguardar render React | Instantânea via nativeInputValueSetter | Nenhuma mudança necessária; é limitação de teste, não de UX |
| Alternar status do chamado | Dropdown com 3 opções (sem "Resolvido") | Zendesk: dropdown com todos os status | Incluir "Resolvido" e "Pendente" no dropdown inline |

---

## 5. Integração entre Módulos

### Chamado ↔ Ativo
- **Funciona?** Sim, bidirecional.
- **Do ativo:** botão "Abrir chamado" na página do ativo pré-preenche o ativo (DESKTOP-OBMS9TA detectado automaticamente). 4 cliques no total.
- **Do chamado:** lateral exibe EQUIPAMENTO com métricas e botão "Conectar remoto" — só quando o chamado tem ativo vinculado.
- **Contexto preservado?** Sim — máquina detectada aparece no chip "DETECTADO AUTOMATICAMENTE" no formulário.
- **Atrito:** Ao abrir chamado do ativo, o ativo é pré-detectado mas não é o ativo do próprio clique — detecta a máquina registrada no usuário logado (DESKTOP-OBMS9TA = admin), não o NB-DEMO-001 selecionado na tela. Isso pode gerar chamado com ativo errado.

### Chamado ↔ Problema (vínculo de incidentes)
- **Funciona?** Sim — vínculo e desvínculo funcionam; contagem atualiza (VINCULADOS 0 → 1 → 0).
- **Sentido inverso (do detalhe do chamado → vincular a Problema)?** Não existe. Só de Problemas → chamados. Falta o caminho inverso.
- **Cliques:** 4 passos (Problemas > linha > Gerenciar > Vincular).

### Chamado ↔ Automação/SLA/Situações
- **Automação:** funciona na abertura (Alta prioridade → Técnico Demo).
- **SLA:** calculado e exibido corretamente (SLA OK, SLA violado, tempo restante).
- **Situação pausando SLA:** configurado no módulo Situações (PENDENTE pausa SLA). Não testado end-to-end por falta de chamado adequado.

### Chamado ↔ Mudança/Problema
- **Navegação do detalhe do chamado para Problema vinculado?** Não existe link direto. Usuário precisa ir a Problemas > procurar. Gap de integração.

### Chamado ↔ Termo de Equipamento
- **Fluxo completo testado via v4:** preparar → assinar → PDF. PDF gerado (term_5629bf8f9cb84b80821497d466a06701.pdf confirmado via API).
- **Nesta rodada:** apenas verificado que o termo existe e foi assinado.

### Usuário ↔ Perfil ↔ Permissões
- **Funciona?** Sim. Login como `usuario@local` mostra portal simplificado (Abrir chamado, Meus chamados, Ajuda). Login como `admin@local` mostra todos os módulos. A troca de perfil muda o que é visto.

### Ativo ↔ Acesso remoto
- **Da página do ativo:** botão "Acesso remoto" abre modal de sessão. Funciona.
- **Do detalhe do chamado (com ativo vinculado):** botão "Conectar remoto" na lateral. Funciona.
- **Bug de persistência:** a sessão de acesso remoto fica visível como banner `Acesso remoto · NB-DEMO-001 (Conectando…)` em todas as telas até ser encerrada. Não é um bug funcional mas causa confusão de contexto.

---

## 6. Facilidade de Uso por Perfil

### Técnico / Admin
- A fila de chamados é eficiente: filtros rápidos (Meus, Não atribuídos, SLA violado), busca, paginação, bulk actions, menu de contexto por linha.
- ⌘K funciona e cobre navegação + abertura de chamado.
- Configurar SLA, automações, situações: compreensível sem treinamento; descriptions curtas em cada módulo ajudam muito.
- **Trava principal:** resolver um chamado requer ResolveTicketDialog mas o botão de resolver não aparece claramente no cabeçalho do detalhe — está no dropdown de situação que não inclui "Resolvido" como opção direta. O fluxo real de resolução provavelmente usa o botão "Resolver chamado" que aparece em condições específicas; no chamado testado (Aberto, sem ser responsável) os únicos botões eram "Assumir" e "Transferir".
- A "Sugestão da IA" está bem posicionada na lateral e funciona sem travamentos.

### Usuário leigo
- Portal simplificado e limpo: 3 itens na sidebar (Abrir chamado, Meus chamados, Ajuda).
- Abre chamado sem treino? Sim — formulário passo a passo com tipos visuais (cards com ícone + descrição) e validação inline clara.
- Entende o status? Sim — badge colorido no card de chamado. "Resolvido", "Em atendimento", "Aberto" são claros.
- Sabe o que vem depois? Parcialmente — não há timeline ou progress bar de "próximos passos". Após abrir chamado, o usuário não sabe em quantos passos/dias terá resposta.
- **Trava:** se o usuário tenta clicar no card de chamado na lista (div clicável sem role="button" nem cursor pointer explícito), pode não perceber que é clicável.

---

## 7. Linguagem (UX Writing)

| Onde | Texto atual | Texto proposto | Motivo |
|------|-------------|----------------|--------|
| Formulário abertura — rodapé | `0 anexo(s)` | `0 anexos` | Plural natural; o "(s)" é padrão de dev, não de escrita |
| Fila de chamados — coluna | `Status` | `Situação` | Alinhar com o resto do produto |
| Mudanças — filtros | Faltam filtros de "Análise" e "Rejeitados" | Adicionar nas presets | "Em análise" e "Rejeitados" são estados relevantes para gestão |
| Problemas — badge | `0 chamado(s)` | `0 chamados` | Mesmo motivo dos anexos |
| Acesso remoto — banner | `Conectando…` (infinito sem timeout) | Adicionar tempo estimado ou "Tentar novamente" após N segundos | Sem feedback de progresso |
| Detalhe chamado — header | `Erro em sistema • Sistema • Atualizado há 1h` | OK — conciso e informativo | Mantido |
| Dashboard — descrição | `Painel de controle do suporte técnico com dados em tempo real.` | Avaliar remover — ocupa espaço sem agregar valor após o usuário aprender | O título "Visão geral" já diz tudo |
| Relatórios — bloco | `Resolução no 1º contato (FCR): 100%` | Bem escrito — mantido | Usa sigla com expansão |
| Mudanças — status | `ANALISE` (em contexto) | `Análise` | Bug de casing — código interno vazando |
| Ticket create — dica | `O que aconteceu? Quando começou? Como isso afeta seu trabalho?` | OK — excelente microcopy | Mantido |
| Fila — estado vazio | Não testado | — | — |
| Validação inline | `Escreva um título com pelo menos 5 caracteres.` | OK — claro e acionável | Mantido |
| Validação inline | `Descreva o que está acontecendo.` | OK — direto | Mantido |
| Toast de validação | `Revise os campos destacados antes de continuar.` | OK | Mantido |

---

## 8. Design 2026 & Poluição Visual

### Detalhe do Chamado (mudança desta rodada)
- **2 colunas em desktop (≥1024px):** 597px + 380px. Proporção 61/39 — adequada para leitura da conversa.
- **Toggle ocultar/mostrar coluna lateral:** funciona corretamente; "Ocultar detalhes" → "Mostrar detalhes". Ícone PanelRightClose/PanelRightOpen.
- **Accordion "Informações para o suporte":** fecha por padrão (aria-expanded="false"), abre ao clicar. Correto.
- **Mobile (375px):** empilha em coluna única; botão "Ocultar detalhes" oculto. Correto.
- **Poluição:** a lateral mostra ATENDIMENTO + SLA + SOLICITANTE + EQUIPAMENTO + INFORMAÇÕES — 5 seções. Em chamados com ativo vinculado e checklist, a lateral fica longa. Considerar collapsing por grupo, não só o accordion do checklist.

### Relatórios (bug de duplicação)
- O card "Por prioridade" renderiza barras visuais E badges com os mesmos números abaixo, sem separação clara. O usuário vê CRITICA/ALTA/MEDIA/BAIXA duas vezes. Remove-se um dos dois ou os separa com clareza de intenção.

### Dashboard
- Cards de métricas clickáveis (Chamados ativos, Em andamento, etc.) — bom padrão de "drill-down by click".
- Filtros de período e situação no topo: ao mudar, parecem filtrar a lista de chamados recentes mas não os 4 cards de métrica. Inconsistência de comportamento esperado.

### Fila de chamados
- Colunas sem sort visual. Usuário experiente vai tentar clicar nos headers para ordenar — padrão esperado em 100% dos SaaS de mesa enterprise. Cursor pointer nem ícone de sort.
- Densidade: adequada. 10 rows por página, informação relevante por coluna.

### Sidebar de navegação
- Categorizada em seções (ATIVOS, ITSM, CONHECIMENTO, MONITORAMENTO, ADMINISTRAÇÃO, CONFIGURAÇÕES). Boa hierarquia.
- Em modo desktop com sidebar fixa: sidebar toma 288px (w-72) de 1366px = 21% da tela. Adequado.

### Badges e cores
- Status de chamado: verde (Aberto) / azul (Em atendimento) / vermelho (SLA violado) — consistente.
- SLA: barra de progresso com `progressbar` aria role. Correto.
- "Alta" como badge vermelho no header do chamado — visualmente correto.

### Estados
- Estado vazio (Segurança sem conectores, Notificações vazias, Histórico de telemetria sem dados): todos com mensagens explicativas adequadas. Padrão correto.
- Estado de loading: "Carregando chamado..." com spinner. Correto.
- Estado de erro: não testado explicitamente.

---

## 9. Top 10 Ações Priorizadas

| # | Ação | Impacto | Esforço | Ganho | Referência de mercado |
|---|------|---------|---------|-------|----------------------|
| 1 | **Corrigir duplicação de dados no card "Por prioridade" (Relatórios)** | Alto | Baixo | Remove confusão visual e dado redundante | Freshservice Analytics |
| 2 | **Adicionar botão primário "Resolver chamado" no cabeçalho do detalhe** quando o chamado está em atendimento e o usuário é o responsável | Alto | Baixo | Reduz de 3 para 1 clique para resolver — ação mais comum do técnico | Zendesk "Resolve" no topo |
| 3 | **Padronizar "Situação" em todas as telas** (fila usa "Status", detalhe usa "Situação") | Médio | Baixo | Consistência terminológica; zero confusão para novos usuários | — |
| 4 | **Adicionar sort clicável nas colunas da fila de chamados** (ID, Prioridade, Atualizado, SLA) | Alto | Médio | Triagem sem filtro — poder primário de um técnico experiente | Linear, Zendesk, Freshservice |
| 5 | **Incluir "Resolvido" e todos os status no dropdown inline de situação** no cabeçalho do chamado | Alto | Baixo | Resolve chamado em 2 cliques; hoje requer dialog separado | Zendesk inline status |
| 6 | **Adicionar link "Problema vinculado"** no detalhe do chamado quando ele estiver vinculado a um problema | Médio | Baixo | Navegação bidirecional Chamado ↔ Problema | Jira SM "Linked issues" |
| 7 | **Corrigir plurais "(s)"** em "anexo(s)", "chamado(s)" para pluralização natural | Baixo | Muito baixo | Qualidade de escrita enterprise | — |
| 8 | **Adicionar "Análise" e "Rejeitados" nos filtros de Mudanças** | Médio | Baixo | Visibilidade de mudanças pendentes de decisão | ServiceNow Change Management |
| 9 | **Exibir timeline de próximos passos no portal do usuário** após abertura do chamado | Médio | Médio | Usuário leigo sabe o que esperar — reduz ansiedade e chamadas de status | Intercom, Freshdesk portal |
| 10 | **Corrigir pré-seleção de ativo ao abrir chamado da página do ativo** | Médio | Baixo | Hoje detecta o ativo do usuário logado, não o ativo clicado na tela | — |

---

## Cobertura de Módulos

| # | Módulo | Testado |
|---|--------|---------|
| 1 | Dashboard/Visão geral | ✅ |
| 2 | Fila de chamados | ✅ |
| 3 | Abrir chamado | ✅ |
| 4 | Detalhe do chamado | ✅ |
| 5 | Portal do colaborador | ✅ |
| 6 | Inventário de equipamentos | ✅ |
| 7 | Estoque | ✅ |
| 8 | Impressoras | ✅ |
| 9 | Monitoramento de rede | ✅ |
| 10 | Segurança (XDR) | ✅ |
| 11 | Acesso remoto | ✅ |
| 12 | Problemas | ✅ |
| 13 | Mudanças | ✅ |
| 14 | Base de conhecimento | ✅ |
| 15 | Documentação | ✅ |
| 16 | Termos de equipamento | ✅ |
| 17 | Modelos de termo | ✅ |
| 18 | Equipes | ✅ |
| 19 | Relatórios | ✅ |
| 20 | Auditoria | ✅ |
| 21 | Usuários | ✅ |
| 22 | Perfis/permissões | ✅ |
| 23 | Configurações gerais | ✅ |
| 24 | Unidades | ✅ |
| 25 | Localizações | ✅ |
| 26 | Tipos/Categorias/Situações | ✅ |
| 27 | Automações & Webhooks | ✅ |

Todos os 27 módulos testados. Nenhum omitido.

---

## Verificação Específica das Mudanças v5

| Mudança | Verificada | Resultado |
|---------|-----------|-----------|
| Layout 2 colunas no detalhe | ✅ | Funciona: 597px + 380px em 1366px; mobile empilha |
| Accordion "Informações" fechado por padrão | ✅ | aria-expanded="false" confirmado; abre ao clicar |
| Botão "Ocultar/Mostrar detalhes" | ✅ | Toggle funciona; grid passa de 2 colunas para 1 |
| Sem erros de hidratação | ✅ | Console limpo (sem erros JavaScript) |
| Vínculo de chamados a Problemas | ✅ | Vincular e Remover funcionam; contagem atualiza |
| Validação inline título (mín 5 chars) | ✅ | aria-invalid + texto de erro abaixo do campo |
| Validação inline descrição | ✅ | Idem; toast + inline simultâneos |
| Workflow Mudanças (transições ITIL) | ✅ | Testado: APROVADO → IMPLEMENTANDO → CONCLUÍDO |
| Inventário software "Ver todos" | ⚠️ | Código correto (condicional > 6 itens); sem dados reais no demo para ativar |
| "Sugestão da IA" (era "Explicar") | ✅ | Botão presente na lateral técnica; popover abre com análise |
| "Histórico" (era "Eventos") | ✅ | Tab "Histórico (n)" confirmado |
| "Resolução no 1º contato (FCR)" | ✅ | Presente nos Relatórios |
| Descrição Estoque | ✅ | "baixa automática ao resolver chamados" presente |
| Descrição Problemas | ✅ | "Agrupe incidentes recorrentes e registre a causa raiz" presente |
| Descrição Mudanças | ✅ | Descrição presente e coerente |
