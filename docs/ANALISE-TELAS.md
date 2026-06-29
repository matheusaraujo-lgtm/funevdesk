# FunevDesk — Análise de Telas por Perfil (UX + Funcional)

> Relatório especialista, tela a tela, dos 3 perfis (Usuário, Técnico, Admin), com botões,
> funções/endpoints, avaliação de UX e lacunas priorizadas (P = pequeno, M = médio, G = grande).
> Base: leitura dos componentes reais em `src/components/**` e do roteamento em `src/app/page.js`.
> Gerado na sessão de validação (jun/2026).

## Como ler
- **P / M / G** = esforço estimado. Itens marcados 🔴 são *informação falsa/enganosa na tela* (prioridade alta de correção).
- Permissões base em [`src/lib/auth.js`](../src/lib/auth.js): ADMIN (tudo), TECHNICIAN (opera, sem configurar), EMPLOYEE (autoatendimento).

---

# 1. Perfil USUÁRIO (EMPLOYEE)

Portal enxuto (`page.js` bloco `role === "EMPLOYEE"`). Telas: Novo chamado (inicial), Meus chamados, Minha máquina, Ajuda (KB), Detalhe do chamado. Login cai direto em "Novo chamado".

### 1.1 Login / Troca de senha (`auth-view.jsx`)
- Campos: Empresa (se houver várias), E-mail, Senha → `POST /api/auth/login`. Troca forçada → `POST /api/auth/change-password`.
- **Lacunas:** sem "Esqueci minha senha" (G); sem toggle mostrar senha e validação inline diverge da regra exibida (M/P).

### 1.2 Novo chamado (`ticket-create-view.jsx`)
- Form adaptativo por tipo (campos dinâmicos, upload via `/api/uploads`), resumo lateral com "fila de atendimento", aprovador/termo conforme o tipo. Botão **Criar chamado**.
- **Problemas de UX:**
  - 🔴 Botão **"Limpar formulário"** na verdade **navega para "Meus chamados"** (não limpa) (P).
  - **Enter na Descrição envia o chamado** (risco de envio acidental) (P/M).
  - O usuário **não vê nem corrige a máquina detectada/vinculada** (usa sempre `assets[0]`) (M).

### 1.3 Meus chamados (`my-tickets-view.jsx`)
- Busca, filtro de status, cards (Abertos/Em atendimento/Concluídos), tabela paginada, "Ver".
- **Lacuna:** filtros/cards usam **status fixos no código** — não refletem status customizados da organização (M). Linhas não focáveis por teclado (P).

### 1.4 Minha máquina / Saúde do computador (`my-device-health.jsx`) — *novo*
- Traduz telemetria em linguagem leiga (Motor de Tradução). Badge de saúde + sinais com ação sugerida.
- **Lacuna:** botão **"Abrir chamado" só aparece em estado crítico** — em "atenção" (warning) o usuário lê o problema mas não tem CTA (M). Sem "última verificação" nem "atualizar" (P).

### 1.5 Detalhe do chamado (visão podada)
- Vê: conversa pública, anexos, **aprovação** (se for aprovador), **assinatura de termo** (reautenticação por senha), **CSAT** (1–5). Não vê notas internas, gestão nem acesso remoto (correto).
- **Problemas:**
  - 🔴 **Clipe de anexo no compositor é decorativo** (sem ação) (P).
  - **Anexos** abre **só o primeiro** (M). CSAT fica no rodapé, pouco visível, sem legenda 1–5 (M/P).

### 1.6 Ajuda / Base de conhecimento (`knowledge-view.jsx`) — *novo (somente leitura)*
- Busca + leitura de artigos. Sem editar/excluir (correto).
- **Lacunas:** nomenclatura "Ajuda" (navbar) vs "Base de conhecimento" (título) inconsistente (P); sem filtro por categoria (M); sem CTA "Não resolveu? Abrir chamado" (M).

### 1.7 Notificações (`notifications-bell.jsx`)
- 🔴 **Sino oculto no mobile** (`hidden sm:inline-flex`) — perda funcional num portal usado em celular (M). Itens **não clicáveis** (não abrem o chamado) (M).

---

# 2. Perfil TÉCNICO (TECHNICIAN)

Opera quase tudo; em vários módulos só lê (botões escondidos por `canConfigure`). Menus: Visão geral, Chamados, Ativos, Administração (Equipes, Catálogo, Problemas, Mudanças), Operações (Documentação, KB, Termos, Rede).

### 2.1 Dashboard (`dashboard-view.jsx`)
- KPIs, atalhos (Meus/Não atribuídos/SLA violado), chamados recentes, alertas de agente, dispositivos com incidente.
- **Lacunas:** atalhos e cards **levam à fila sem pré-aplicar o filtro** correspondente (M); checkboxes de seleção em massa **sem ação** (P).

### 2.2 Chamados / Fila (`tickets-view.jsx`)
- Presets (Todos/Meus/Não atribuídos/Abertos), filtros ricos (status dinâmico, prioridade, SLA, responsável, equipe, tipo), ⋮ por linha (Abrir/Assumir/Remoto/Resolver).
- **Problemas:**
  - 🔴 Cards trazem **tendências "↗ +18%" fixas/fictícias** (`change` hardcoded) — informação falsa (M).
  - Cards não são clicáveis (diferente do dashboard) (M); seleção em massa sem ação (P).

### 2.3 Detalhe do chamado / atendimento (`ticket-details.jsx` + subcomponentes)
- Assumir, Transferir, Resolver (exige texto de resolução), conversa pública/interna, acesso remoto WebRTC (mouse/teclado/arquivo/tela cheia).
- **Lacunas (importantes):**
  - 🔴 **Não há troca de status intermediário** na UI — só "Resolver" (pílulas de status são só exibição). Limita o fluxo ITIL ao binário abrir/resolver (G).
  - 🔴 **Checklist técnico só em `localStorage`** com "Salvar" simulado (`setTimeout`) — engana o usuário (M).
  - 🔴 Campos de incidente **mock fixos** ("Limpeza de disco"…) quando não há respostas reais (M).
  - Anexos abre só o primeiro; "Filtrar conversa" é decorativo (P).

### 2.4 Ativos (`assets-view.jsx`)
- Telemetria + inventário Windows + import/export CSV; painel lateral por ativo/rede.
- **Problemas:**
  - 🔴 Selo **"Proteção: Ativa" hardcoded** — não reflete o antivírus real (M).
  - ⋮ das linhas de ativo **não faz nada**; sem acesso remoto direto pelo ativo (M); import/export **sem gate de permissão** (P/M).

### 2.5 Monitoramento de rede (`network-view.jsx`)
- Para o técnico vira **somente leitura + "Verificar agora"** (criar/editar/excluir exigem `canConfigure`).
- **Lacuna:** tela "sem ações" sem explicar o porquê; gating inconsistente vs problemas/mudanças (P/M).

### 2.6 Problemas e Mudanças (`problems-view.jsx`, `changes-view.jsx`)
- Técnico tem **CRUD completo** (gate `canManageTickets`).
- **Mudanças:** ao **editar** perdem-se tipo/risco/datas/aprovador (só status muda); fluxo de aprovação incompleto (M).

### 2.7 Documentação e Base de conhecimento
- **Somente leitura** para o técnico (exigem `canConfigure`).
- **Lacuna:** técnico não contribui com KB/documentação — contraria o objetivo de "reduzir chamados repetidos" (M).

### 2.8 Termos de equipamento (`terms-view.jsx`)
- Cria e abre PDFs; não exclui (só admin). Coerente.

---

# 3. Perfil ADMIN (telas administrativas)

### 3.1 Configurações gerais (`settings-general-view.jsx`)
- White-label (logo/cores/navegação), SLA, toggles, **agente** (regenerar enrollment, download EXE/MSI/PowerShell), reposição de estoque, SSO.
- **Problemas:**
  - **Persistência mista** (logo/chave aplicam na hora; cor/nome/toggles só no "Salvar") **sem aviso de alterações não salvas** (G).
  - `businessHours.days` **fixo seg–sex** (sem editor) (M); SSO é **decorativo** ("integração futura") (M); tipos de download mortos `gpo-exe`/`msi` (P).

### 3.2 Tipos de chamado + Fluxo (`settings-types-view.jsx`, `catalog-type-form-view.jsx`, `catalog-type-workflow-view.jsx`)
- Tipos com campos dinâmicos (8 tipos de campo), escopo/roteamento por filial, aprovação, termo. Criação de categoria inline.
- **Problemas:** 🔴 ícone **`GripVertical` sugere arrastar campos, mas não há drag** (M); lixeira não desabilita para campos já em uso (regra só no backend) (M); **workflow duplica** o que o form de tipo já faz (manutenção dupla) (M).

### 3.3 Categorias / Situações / Localizações (`settings-categories/statuses/locations-view.jsx`)
- **Categorias:** cores em inglês cru sem swatch; **sem confirmação de exclusão**; sem empty state (M/P).
- **Situações:** edição inline com flags (finaliza/pausa SLA/mensagens) **sem indicador de "não salvo"** (M).
- 🔴 **Localizações: não há editar nem excluir** — erro de digitação é permanente (G).

### 3.4 Usuários e Filiais (`users-view.jsx`, `branches-view.jsx`)
- Bem construídos: painel lateral, proteção contra auto-exclusão, senha temporária one-time, LDAP por filial, código de filial auto-slug.
- **Lacunas:** `aria-label` ausente nos menus ⋮ (M); reset de senha sem confirmação prévia (P).

### 3.5 Equipes e Serviços (`teams-view.jsx`, `services-view.jsx`)
- CRUD com `canConfigure`. Serviços com SLA e aprovação.
- **Lacunas:** edita 1 carregando a lista inteira (ineficiente) (M); tipo de chamado imutável na edição sem aviso (P).

### 3.6 Estoque / Inventário (`inventory-view.jsx`)
- Reposição automática (abre chamado no mínimo) bem modelada.
- 🔴 **"+ Entrada" sempre soma 1** (50 cliques p/ 50 itens) e **não há saída/baixa** (G); sem editar/excluir item; sem empty state (M).

### 3.7 Relatórios (`reports-view.jsx`)
- KPIs (MTTR, SLA, CSAT, FCR), por unidade/prioridade.
- **Lacunas:** **sem filtro de período, sem exportação, sem gráficos** (G); trava no skeleton se a API falhar (M).

### 3.8 Auditoria (`audit-view.jsx`)
- Trilha com busca.
- **Lacunas:** **limite fixo de 200 sem paginação** (auditoria antiga inacessível) (G); sem filtros por data/ação; sem exportação (compliance) (M).

### 3.9 Webhooks (`webhooks-view.jsx`)
- CRUD + **"Testar disparo"** (ótimo feedback com status HTTP). Segredo write-only.
- **Lacunas:** eventos em código cru (`TICKET_NEW`) sem rótulo amigável (M); sem busca na lista (P).

### 3.10 Modelos de termo (`term-templates-view.jsx`)
- Editor de texto rico + **editor visual de layout do PDF** (diferencial).
- 🔴 Métrica **"Vinculados" hardcoded** (`id === "tmpl_equipamento_padrao"`) — sempre 0/1 (M).

---

# 4. Temas transversais

**Acessibilidade (M, recorrente):** menus ⋮ sem `aria-label`; rótulos via `<p>` em vez de `<label htmlFor>`; linhas de tabela clicáveis não focáveis por teclado; botões "Fechar painel" inconsistentes.

**Dados falsos/enganosos na tela (🔴, prioridade alta):**
1. Tendências "↗ +18%" fixas na fila de chamados.
2. "Proteção: Ativa" hardcoded em Ativos.
3. Checklist técnico "Salvar" simulado (localStorage).
4. Campos de incidente mock fixos.
5. Métrica "Vinculados" hardcoded em Modelos de termo.

**Consistência (M):** persistência mista sem "dirty state"; confirmação de exclusão ausente em Categorias; empty state ausente em Categorias/Inventário; header `PageHeader` vs `<h1>` manual (Relatórios, form de Termos).

**Tratamento de erro (M):** telas que dependem de fetch inicial sem `onError` (Relatórios trava no skeleton; Auditoria/Equipes/Serviços ficam vazias em silêncio na falha de rede).

---

# 5. Backlog priorizado (consolidado)

## 🔴 Correções de credibilidade (rápidas, alto impacto) — fazer primeiro
- Remover/alimentar com dados reais: tendências "+%" da fila, "Proteção: Ativa", métrica "Vinculados".
- Persistir o **checklist técnico** no servidor (ou remover o "Salvar" falso) e não exibir campos de incidente mock.
- Corrigir rótulo **"Limpar formulário"** e o **clipe decorativo** no compositor.

## Grandes (G)
- **Troca de status intermediário** do chamado na UI (Pendente/Em atendimento/Aguardando) — maior limitação de fluxo.
- **Relatórios:** filtro de período + exportação (+ gráficos).
- **Auditoria:** paginação/filtros server-side (compliance).
- **Inventário:** quantidade na entrada + saída/baixa de estoque.
- **Localizações:** editar/excluir.
- **Login do usuário:** "Esqueci minha senha".

## Médias (M)
- Atalhos/cards do dashboard pré-aplicando filtros na fila.
- Notificações no mobile + itens clicáveis (deep-link ao chamado).
- "Minha máquina": CTA de abrir chamado também em estado "atenção".
- Edição de Mudança preservando tipo/risco/datas/aprovador.
- Anexos: listar todos (não só o primeiro).
- Permitir técnico contribuir com KB/Documentação.
- `aria-label` nos menus ⋮ e rótulos `<label htmlFor>` (acessibilidade).
- Aviso de "alterações não salvas" em Configurações gerais.

## Pequenas (P)
- Ícone do menu mobile (hambúrguer), marca clicável, toggle mostrar senha.
- Filtros por categoria em KB/Documentação/Termos; busca em Webhooks.
- Empty states e confirmações de exclusão faltantes; unificar headers.
- Acentuação ("memoria", "automatico", "maquina").

---

## Pontos fortes a preservar
- Motor de Tradução (saúde em linguagem leiga) — diferencial.
- Catálogo de tipos com campos dinâmicos + roteamento por filial.
- Editor visual de layout de PDF (termos).
- "Testar disparo" de webhooks.
- Acesso remoto WebRTC próprio com consentimento.
- Isolamento multi-tenant e escopo por filial consistentes.
