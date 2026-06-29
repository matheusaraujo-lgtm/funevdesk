# Relatório de QA + UX — FunevDesk

- **Data:** 26/06/2026
- **Build testado:** dev server (porta 3000), branch `master`
- **Perfis testados:** Usuário final (`usuario@local`), Técnico (`tecnico@local`), Admin (`admin@local`)
- **Método:** navegação real na aplicação rodando (preview headless), validação de cada ação (UI + persistência via API + console + network), testes de borda e responsividade (375 / 1366 / 1920).
- **Ambiente:** seed já populado (28–29 chamados, 3 ativos, 4 usuários, 4 perfis, 2 unidades). Não foi necessário rodar `seed-demo.cjs`.

---

## 1. Resumo executivo

O FunevDesk é um helpdesk/ITSM **surpreendentemente maduro** para o estágio. Os fluxos-coração funcionam de ponta a ponta: abertura de chamado pelo portal (com formulário progressivo e detecção automática de unidade/ativo), auto-roteamento por automação na abertura, fila do técnico com filtros ricos, ações rápidas (assumir/atribuir/resolver), conversa pública/interna, mudança de status inline, SLA calculado e exibido, resolução com mensagem ao cliente, e um diferencial real de IA ("Explicar / Como resolver") que traduz sintoma técnico em linguagem leiga. Console e network ficaram **limpos** (zero erros JS, zero 4xx/5xx inesperados) durante toda a sessão.

Os problemas encontrados são, na maioria, **de polimento e consistência** — não há bloqueador de fluxo principal. O achado mais sério é de **privacidade/visibilidade** (checklist interno exposto ao solicitante) e o mais visível é de **consistência de métricas** (card "Alta/crítica" conta resolvidos e estoura o total de ativos).

### Bugs por severidade
| Severidade | Qtd |
|---|---|
| Crítico | 0 |
| Alto | 2 |
| Médio | 3 |
| Baixo | 2 |

### Nota de maturidade/UX: **7,5 / 10**
Fluxos sólidos, visual consistente e moderno, microcopy em pt-BR de boa qualidade, recursos avançados (IA, SLA, automação, agente, webhooks). Perde pontos por: vazamento de checklist ao usuário, métricas inconsistentes, ausência de deep-linking (recarregar perde o contexto do chamado) e feedback de erro/sucesso pobre em alguns formulários.

### Veredito
**Apto para piloto controlado.** Antes de produção ampla, corrigir os 2 bugs Altos (vazamento de checklist + contagem de métricas) e o feedback de validação no cadastro de usuário. Deep-linking deveria entrar no roadmap próximo por impacto direto na operação do técnico.

---

## 2. Bugs (está errado)

### BUG-01 · [Alto] · Checklist técnico interno fica visível para o usuário final (solicitante)
- **Tela/fluxo:** Portal do usuário → Meus chamados → abrir chamado → bloco "Informações para o suporte / Checklist técnico".
- **Passos:** Logar como `usuario@local`; abrir qualquer chamado em "Meus chamados"; rolar o detalhe.
- **Esperado:** O checklist de atendimento (itens internos da equipe) não deveria aparecer para quem abriu o chamado; o próprio rótulo diz "visível para toda a equipe de suporte".
- **Obtido:** O solicitante vê o card "Checklist técnico" com itens internos (ex.: "Analisar arquivos > 1GB", "Limpar temporários", "Esvaziar lixeira", "Validar espaço livre"). Confirmado via inspeção: 4 itens renderizados no portal do usuário.
- **Evidência/causa:** `src/components/ticket-details.jsx:208` renderiza `<TicketIncidentForm>` incondicionalmente. O gate `canEdit={permissions.canManageTickets && !isTerminal}` controla só a edição — o componente é **exibido** para todos os papéis. O rótulo está em `src/components/ticket-incident-form.jsx:197-198`.
- **Recomendação:** Envolver o bloco em uma condição de papel (ex.: `permissions.canManageTickets` / não-`isEmployee`) ou só renderizá-lo quando o usuário pertence à equipe de suporte.

### BUG-02 · [Alto] · Card "Prioridade alta/crítica" conta chamados resolvidos e ultrapassa o total de ativos
- **Tela/fluxo:** Dashboard (Visão geral) e Fila de chamados (cards do topo).
- **Passos:** Logar como admin ou técnico; observar os cards. Dashboard mostra "Chamados ativos 28" e "Prioridade alta/crítica 31"; a fila mostra "Alta/crítica 32".
- **Esperado:** O contador de prioritários deveria considerar apenas chamados ativos (ou o rótulo deveria deixar claro que inclui resolvidos). 31/32 prioritários não pode ser maior que 28 ativos.
- **Obtido:** O card soma TODOS os chamados alta/crítica, inclusive RESOLVIDO/FECHADO. Validação por API: `high_all = 31`, `high_active = 24`, `active = 28`.
- **Evidência/causa:**
  - `src/components/dashboard-view.jsx:193` → `critical = periodFilteredTickets.filter(p === 'CRITICA' || 'ALTA')` sem excluir status terminal, enquanto as linhas 192/194/195 (`inProgress`, `unassigned`, `mine`) excluem resolvidos.
  - `src/components/tickets-view.jsx:168` → mesmo padrão (`critical` sobre todos os `tickets`).
- **Recomendação:** Filtrar por status ativo no cálculo de `critical` (alinhar com `inProgress`), ou renomear o card para "Alta/crítica (total)".

### BUG-03 · [Médio] · Cadastro de usuário não indica qual campo está errado
- **Tela/fluxo:** Configurações → Usuários → Novo usuário → "Criar usuário".
- **Passos:** Preencher só Nome e E-mail (ex.: "Maria QA Teste" / `maria.qa@local`) e clicar em "Criar usuário".
- **Esperado:** Mensagem indicando o campo pendente (ex.: "Selecione um perfil" / "Defina a senha").
- **Obtido:** Toast genérico "Revise os dados do usuário." sem apontar o campo. Com todos os campos vazios, o clique nem dá feedback (cai na validação HTML5 nativa "Preencha este campo." via balão do browser, inconsistente com o toast).
- **Evidência:** Dois caminhos de validação convivem (required HTML5 + validação custom com toast genérico), sem destaque de campo (`aria-invalid` permaneceu 0).
- **Recomendação:** Validação inline por campo (borda + mensagem abaixo do input) e mensagem específica. Unificar o estilo de erro.

### BUG-04 · [Médio] · Recarregar a página dentro de um chamado perde o contexto (sem deep-linking)
- **Tela/fluxo:** Qualquer detalhe de chamado (técnico ou usuário).
- **Passos:** Abrir um chamado; observar que a URL continua `http://localhost:3000/`; recarregar (F5).
- **Esperado:** A URL deveria refletir o chamado (ex.: `/chamados/1038`) e o reload manter a tela.
- **Obtido:** A rota é só estado client-side; ao recarregar, o app volta para "Visão geral" e o técnico perde o que estava vendo. Também impossibilita abrir chamado em nova aba ou compartilhar link.
- **Recomendação:** Roteamento por URL para entidades (chamado, ativo, problema...). Padrão consagrado em GLPI/Zendesk/Freshservice — cada chamado tem URL própria.

### BUG-05 · [Médio] · Feedback de sucesso ausente em ações de chamado (assumir, mudar status, resolver)
- **Tela/fluxo:** Fila e detalhe do técnico.
- **Passos:** "Assumir chamado" pelo menu de ações; mudar status inline para "Pendente"; resolver chamado.
- **Esperado:** Toast de confirmação ("Chamado assumido", "Status atualizado", "Chamado resolvido").
- **Obtido:** As ações **persistem corretamente** (validado por API: assignee atribuído, status `PENDENTE`/`RESOLVIDO`, `resolved_at` preenchido), mas não observei toast de confirmação — a única pista é a UI mudar/lista atualizar. Para ações que mudam de tela ou removem a linha, o usuário fica sem confirmação explícita.
- **Recomendação:** Toast curto de confirmação após cada ação de estado (visibilidade do status do sistema — Nielsen #1).

### BUG-06 · [Baixo] · Portal do usuário dispara requisições repetidas a agente local inexistente
- **Tela/fluxo:** Portal do usuário → Abrir chamado.
- **Passos:** Abrir a tela de novo chamado sem o agente desktop instalado; observar o network.
- **Esperado:** Sondagem silenciosa e limitada.
- **Obtido:** ~18 requisições `GET http://127.0.0.1:47832/api/local` com `ERR_ABORTED` poluindo o painel de rede. É intencional (sonda o agente para auto-vincular o ativo), mas o `useEffect` depende de `[assets]` e pode reiniciar a sondagem a cada mudança de referência.
- **Evidência/causa:** `src/components/ticket-create-view.jsx:163-206` (probe com até 6 tentativas; dependência `[assets]`).
- **Recomendação:** Memoizar/estabilizar a dependência, reduzir tentativas e silenciar os erros esperados (já há `catch`, mas o browser ainda loga o ERR_ABORTED).

### BUG-07 · [Baixo] · Chamado resolvido não oferece reabrir nem comentar para o técnico
- **Tela/fluxo:** Detalhe do chamado após resolução (técnico).
- **Passos:** Resolver um chamado; permanecer no detalhe.
- **Esperado:** Possibilidade de reabrir e/ou adicionar nota interna mesmo resolvido.
- **Obtido:** O editor de resposta e os botões Resolver/Transferir somem; restam apenas "Explicar" e "Conectar remoto". Não há ação clara de reabertura no detalhe.
- **Recomendação:** Manter a caixa de nota interna disponível em chamados resolvidos e expor "Reabrir chamado" (padrão Zendesk/Freshservice).

---

## 3. Melhorias de UX (poderia ser melhor)

### UX-01 · [Alto impacto] · Tabela de chamados em mobile usa scroll horizontal de 1248px
- **Problema:** Em 375px, a fila vira uma tabela com `overflow-x: auto` (1248px de largura num container de 343px). O técnico precisa rolar lateralmente para ler responsável/SLA/prioridade.
- **Heurística:** Flexibilidade e eficiência de uso; correspondência com o dispositivo.
- **Recomendação:** Em mobile, trocar a tabela por **cards empilhados por chamado** (nº, título, status, SLA, responsável) — padrão do app mobile de Zendesk/Freshservice. A tela "Meus chamados" do portal já usa cards e funciona bem; replicar a abordagem na fila.

### UX-02 · [Alto impacto] · Cards de status ocupam toda a primeira dobra em mobile
- **Problema:** Os 5 cards (Abertos, Em andamento, SLA violado, Alta/crítica, Concluídos) empilham verticalmente; é preciso rolar bastante antes de ver a fila.
- **Heurística:** Design minimalista; eficiência.
- **Recomendação:** Em mobile, condensar em 2 colunas ou um carrossel/resumo compacto, priorizando a lista de chamados acima da dobra.

### UX-03 · [Médio impacto] · Mensagens de erro/sucesso pouco visíveis e inconsistentes
- **Problema:** Convivem validação HTML5 nativa (balão do browser) e toasts genéricos; ações bem-sucedidas frequentemente sem confirmação. (Ver BUG-03 e BUG-05.)
- **Heurística:** Visibilidade do status; ajuda a reconhecer/recuperar de erros.
- **Recomendação:** Padronizar um único sistema de feedback (toasts + validação inline por campo) em todo o app.

### UX-04 · [Médio impacto] · Microcopy de status do chamado mistura termos
- **Problema:** Há "Aguardando" na lista do portal e "Pendente" no menu de status do técnico para situações próximas; convém confirmar se é a mesma situação com rótulos diferentes.
- **Heurística:** Consistência e padrões.
- **Recomendação:** Alinhar o vocabulário de status entre portal e fila (mesmo label para o mesmo estado).

### UX-05 · [Baixo impacto] · Card de chamado no portal é DIV[role=button] sem cursor pointer evidente em todos os ancestrais
- **Problema:** Os itens de "Meus chamados" são `div[role=button][tabindex=0]` (acessíveis por teclado, bom), mas a affordance de clique podia ser reforçada visualmente (hover/cursor).
- **Heurística:** Affordance/descoberta.
- **Recomendação:** Garantir `cursor: pointer` e estado hover claro no card inteiro.

---

## 4. Achados por perfil

### Usuário final (o que funcionou / o que doeu)
- **Funcionou bem:** Abertura de chamado é leiga-amigável — seleção de tipo com busca, formulário progressivo ("Do que você precisa?" → "Conte o que está acontecendo"), detecção automática de unidade/equipamento, prevenção de erro (botão Enviar desabilitado sem texto). "Meus chamados" com cards de status e filtros. Central de Ajuda com busca/categoria. Conversa com editor rich-text. Acompanhamento de SLA visível.
- **Doeu:** Vê o "Checklist técnico" interno (BUG-01). Sem URL por chamado (BUG-04). A prioridade do chamado é definida automaticamente como "Alta" sem o usuário entender por quê (transparência — poderia explicar "definimos prioridade alta porque...").

### Técnico (o que funcionou / o que doeu)
- **Funcionou bem:** Fila completa (5 cards de métrica, 3 abas, 7 filtros, seleção em massa). Ações rápidas (Abrir/Assumir/Resolver) no menu de linha. "Assumir" muda status para EM_ATENDIMENTO automaticamente. Status inline. SLA calculado corretamente (inclusive detecção de violado). Resolução com mensagem ao cliente (campo obrigatório, anexos). Aba "Interno" para notas. **"Explicar / Como resolver"** (IA) gera análise causa→impacto→passos correlacionando com a telemetria do ativo (disco 97%) — diferencial forte.
- **Doeu:** Sem toast de confirmação (BUG-05). Reload perde o chamado (BUG-04). Chamado resolvido trava ações (BUG-07).

### Admin (o que funcionou / o que doeu)
- **Funcionou bem:** Configurações com 11 seções coerentes. Perfis com matriz de permissões por tela (Ver/Criar/Modificar/Apagar) — muito acima da média de mercado nesse estágio. SLA por prioridade (1ª resposta em min + resolução em h). Automações de roteamento (regra "Alta → Técnico Demo" validada end-to-end na abertura do #1038). Webhooks com status. Permissões realmente aplicadas (técnico não vê Administração/Monitoramento; printers/remote read-only).
- **Doeu:** Cadastro de usuário com feedback fraco (BUG-03). Métricas inconsistentes (BUG-02).

---

## 5. Responsividade & visual

| Breakpoint | Resultado |
|---|---|
| **1920×1080** | Saudável. Conteúdo em container centralizado (~1568px, margens de 168px). Sem overflow. |
| **1366×768** | Bom. Conteúdo usa a largura toda (validado via `getBoundingClientRect`, não confiar no screenshot do preview que renderiza em escala enganosa). Navbar, filtros e tabela OK. |
| **375×812 (mobile)** | Navbar colapsa em hambúrguer (bom). Cards de status empilham (UX-02). Filtros empilham um por linha (funcional, longo). Fila vira tabela com scroll-x de 1248px (UX-01). Sem overflow horizontal de página. |

- **Visual geral:** consistente e moderno — hierarquia clara, uso de cores de status (vermelho p/ crítico, verde p/ ok), badges de prioridade, painel lateral de contexto rico (SLA, solicitante, equipamento com CPU/Mem/Disco). Acessibilidade básica presente: `role=button`+`tabindex` em cards, `aria-label` em ações, progressbars com valor.
- **Nota técnica de método:** os screenshots do preview aparentavam "metade da tela em branco", mas a inspeção de layout (`preview_inspect`/bounding boxes) confirmou que o conteúdo ocupa a largura correta — era artefato de captura, não bug de CSS.

---

## 6. Top 5 ações recomendadas

1. **Esconder o checklist técnico do solicitante** (BUG-01) — privacidade/visibilidade. Gate por papel em `ticket-details.jsx:208`.
2. **Corrigir a contagem "Alta/crítica"** para considerar só ativos (BUG-02) — `dashboard-view.jsx:193` e `tickets-view.jsx:168`. Elimina a inconsistência "31 prioritários > 28 ativos".
3. **Introduzir deep-linking por entidade** (BUG-04) — URL por chamado/ativo. Maior ganho de produtividade para o técnico e habilita compartilhar/abrir em nova aba.
4. **Padronizar feedback** (BUG-03 + BUG-05 + UX-03) — toasts de sucesso nas ações de estado e validação inline por campo no cadastro de usuário.
5. **Layout mobile da fila** (UX-01 + UX-02) — cards empilhados por chamado em vez de tabela com scroll lateral; condensar os cards de métrica.

---

## Anexos — evidências de validação (via API durante os testes)
- Abertura de chamado pelo portal: criado **#1038** ("Sistema de RH não carrega a folha de ponto"), auto-atribuído a Técnico Demo pela automação de prioridade Alta.
- Conversa: resposta do usuário e do técnico apareceram na aba "Público"; resolução publicada na conversa.
- "Assumir": **#1031** passou a `assignee = Técnico Demo`, status `ABERTO → EM_ATENDIMENTO`.
- Status inline: **#1038** `→ PENDENTE` (persistido) e depois `→ RESOLVIDO` com `resolved_at` preenchido.
- SLA: **#1031** corretamente marcado `VIOLADO` (vencido em 25/06).
- Segurança: login inválido retorna 401 com mensagem genérica (não revela existência do e-mail).
- Console/network: **zero** erros JS e **zero** 4xx/5xx inesperados em toda a sessão (único 401 esperado foi pós-logout; falhas `127.0.0.1:47832` são o probe do agente — BUG-06).
