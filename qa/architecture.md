# FunevDesk — Mapa Arquitetural para QA Autônomo

> Gerado por reconhecimento direto do repositório (leitura de código, não de documentação).
> Data: 2026-08-19. Servidor de referência: `http://localhost:3000` (SQLite dev, seed-demo aplicado).

## 1. Stack

| Camada | Tecnologia | Evidência |
|---|---|---|
| Framework | Next.js 16.2.9 (App Router, Turbopack), React 19.2.4 | `package.json` |
| Linguagem | JavaScript (sem TypeScript) | ausência de `tsconfig.json`, arquivos `.js/.jsx` |
| UI | Tailwind CSS v4, shadcn/ui sobre `@base-ui/react`, lucide-react | `components.json`, `src/components/ui/*` |
| Banco (dev) | SQLite via `better-sqlite3`, arquivo em `data/` | `lib-db/index.cjs` |
| Banco (produção) | PostgreSQL via `pg`, ativado por `DATABASE_URL` | `lib-db/index.cjs:getDb()` |
| ORM | Nenhum — SQL cru (`db.prepare(...).run/get/all`) via pacote local `nexus-desk-db` (symlink `file:./lib-db`) | `lib-db/index.cjs` |
| Autenticação | Sessão opaqua server-side (token aleatório, hash SHA-256 em `user_sessions`, cookie `nexus_session`, 8h de validade) — **não é JWT** | `src/lib/auth.js` |
| Autorização | Matriz granular por perfil (estilo GLPI): `profiles` × `profile_permissions` (módulo → read/create/update/delete) | `src/lib/permissions.js`, `lib-db/index.cjs:ensureProfilePermissionTables` |
| Validação de entrada | Zod em quase todas as rotas `POST/PATCH` | `src/app/api/**/route.js` |
| Sanitização de HTML | DOMPurify (allow-list) para todo conteúdo rico (mensagens, descrições) | `src/lib/rich-text.js` |
| Deploy | Docker Compose (app + Postgres + Redis) atrás de nginx, deploy automático via GitHub Actions em push para `main` (SSH + `docker compose up -d --build`) | `docker-compose.yml`, `.github/workflows/deploy.yml` |
| Agente local (Windows) | Stub compilado separadamente (Electron), fala com o backend via `/api/agent/**` com token de agente | `scripts/build-agent-*.mjs`, `agent/`, `agent-desktop/` |
| Integrações externas opcionais | MeshCentral (acesso remoto), DeepSeek API (motor de sugestão de IA), LDAP (`ldapts`), Microsoft Defender / SentinelOne (conectores XDR pull), webhooks salientes | `.env.local.example`, `src/lib/intelligence.js`, `src/lib/ldap*.js` (não lido em detalhe) |

## 2. Multi-tenancy e isolamento

- `organizations` → `branches` (unidades) → `users`/`tickets`/etc., todos com `organization_id`.
- Usuário tem `all_branches` (bool) ou lista de `branchIds` (tabela `user_branches`). Toda query de listagem usa `getAllowedBranchIds`/`branchFilterClause`/`canAccessBranch` (`src/lib/branch-scope.js`) para restringir por unidade.
- `EMPLOYEE` (usuário final) só vê os próprios chamados (`requester_id = self` OU `asset_id = seu ativo`), independente de unidade — ver `canAccessTicket` em `src/lib/auth.js`.
- **Ponto crítico de teste**: qualquer rota que aceite um `id` de recurso (chamado, ativo, unidade, equipe) deve validar organização E escopo de unidade antes de retornar/alterar. Candidato natural a IDOR se algum endpoint novo esquecer o filtro.

## 3. Autenticação e sessão

- `POST /api/auth/login` → cookie `nexus_session` (session DB-backed, não JWT). Rate-limit aplicado (ver `src/lib/security.js`) em login, change-password, forgot-password, agent-uploads, xdr-ingest.
- `password_reset_required` força troca de senha antes de qualquer outra rota (exceto `/api/auth/change-password`).
- `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/forgot-password` (resposta genérica anti-enumeração confirmada em `scripts/e2e-phase3.mjs`).
- Sessões de agente local usam token separado (hash em `assets`, nunca devolvido em claro exceto na regeneração — ver `scripts/e2e-roadmap.mjs`).

## 4. Papéis (roles) e perfis

- 3 `base_role` fixos no código: `ADMIN`, `TECHNICIAN`, `EMPLOYEE`.
- 4 perfis-semente (`profiles`, um por organização, editável): **Administrador** (ALL), **Supervisor** (ADMIN sem apagar/configurar), **Técnico** (TECHNICIAN, opera chamados/ativos/KB), **Usuário** (EMPLOYEE, portal). Perfis customizados podem ser criados em Configurações → Perfis com qualquer combinação de permissões por módulo.
- 28 módulos de permissão (`src/lib/permissions.js:MODULES`), cada um com um subconjunto de `read/create/update/delete`:
  `tickets, assets, inventory, terms, problems, changes, projects, knowledge, documentation, printers, network, security, teams, reports, audit, settings, branches, locations, users, profiles, ticket_types, categories, statuses, term_templates, webhooks, canned_responses, recurring_tickets, remote`.
- Credenciais seed conhecidas (`scripts/seed-demo.cjs`, reaproveitadas pelos scripts de teste existentes): `admin@local` / `Admin@123`, `tecnico@local` / `Tecnico@123`, `usuario@local` / `Usuario@123`.

## 5. Entidades principais (schema real, `lib-db/index.cjs`)

| Entidade | Campos-chave | Observações para QA |
|---|---|---|
| `tickets` | `status`, `priority`, `sla_due_at`, `sla_paused_at`, `pending_reason`, `pending_since`, `pending_reopen_at`, `status_before_pending`, `assignee_id`, `team_id`, `requester_id`, `source` | Máquina de estados rica — ver §7 |
| `ticket_statuses` | por organização, `code`, `is_terminal`, `pauses_sla`, `allows_messages`, `requires_reason`, `sort_order` | Totalmente configurável — testes de permissão/estado não podem assumir códigos fixos além de `ABERTO/EM_ATENDIMENTO/PENDENTE/RESOLVIDO/CANCELADO` (seed) |
| `ticket_types` | `requires_approval`, `approval_mode`, `requires_term`, `default_priority`, vínculo com `ticket_fields` (formulário dinâmico) | Abertura de chamado é **dirigida por tipo** — campos obrigatórios variam |
| `resolution_macros` | `title`, `body` (texto simples) | "Respostas prontas" — biblioteca única da org |
| `recurring_tickets` | `recurrence_unit`, `recurrence_interval`, `next_run_at`, `active` | Agendador em processo (`src/lib/recurring-ticket-scheduler.js`), roda a cada 10 min |
| `profiles` / `profile_permissions` | matriz módulo × ação | Fonte da verdade de autorização |
| `audit_logs`, `ticket_events`, `notifications` | trilha e eventos | Boa fonte de evidência objetiva pós-ação |

## 6. Rotas de API (amostra relevante para QA; não exaustiva)

`src/app/api/**/route.js` — convenção: `GET`/`POST` em `route.js`, `GET`/`PATCH`/`DELETE` em `[id]/route.js`. Quase todas exigem `requireCurrentUser`/`requirePermission(request, module, action)`.

Grupos: `auth/*`, `tickets` (+ `[id]/messages`, `[id]/explain`, `[id]/remote`), `ticket-statuses`, `ticket-types` (implícito em `catalog`), `macros` (respostas prontas), `recurring-tickets`, `assets`, `printers`, `network`, `security` (`xdr`), `problems`, `changes`, `projects`, `knowledge`, `documentation`, `inventory`, `terms`, `teams`, `reports`, `audit`, `settings`, `branches`, `locations`, `users`, `profiles`, `webhooks`, `automations`, `notifications`, `agent/*` (canal do agente local), `uploads`.

## 7. Máquina de estados do chamado (`tickets.status`)

Estados de organização nova (seed): `ABERTO → EM_ATENDIMENTO → PENDENTE ⇄ (volta) → RESOLVIDO`, mais `CANCELADO` (terminal, só o solicitante ou equipe). Comportamento por **flags configuráveis por status**, não por código fixo:

- `is_terminal`: bloqueia edição/mensagens públicas de resposta; dispara CSAT.
- `pauses_sla`: congela `sla_due_at` (via `sla_paused_at`), soma o tempo pausado de volta ao prazo ao sair.
- `requires_reason` **(novo, adicionado nesta sessão)**: exige motivo + data de reabertura automática (`pending_reopen_at`) ao entrar; ao sair (manual ou automático pelo agendador `src/lib/pending-tickets.js`), registra evento com duração.
- `allows_messages`: controla se o composer de resposta pública fica ativo.

Transições inválidas conhecidas que a API deve bloquear: mudar status sem `canManageTickets`; resolver sem `resolutionMessage`; entrar em status `requires_reason` sem motivo/data; excluir/editar responsável fora do escopo de unidade do ator.

## 8. Frontend — navegação (fonte: `src/components/app-navbar.jsx` + `src/app/page.js`)

SPA de tela única: `view` (string em estado React) decide o componente renderizado — **não são rotas Next.js reais** (exceto a raiz). Isso implica: `page.reload()` sempre volta para o dashboard (ou mantém `?ticket=<id>` via query string, único parâmetro persistido). Menu principal: Visão geral, Chamados, Ativos (Ativos/Impressoras), ITSM (Problemas/Mudanças/Projetos), Conhecimento (KB/Documentação), Monitoramento (Rede/Segurança), Administração (Estoque/Termos/Equipes/Relatórios/Auditoria/Chamados recorrentes), Configurações (~15 subtelas).

## 9. Scripts de teste JÁ EXISTENTES (reaproveitados, não recriados do zero)

| Script | Cobre |
|---|---|
| `scripts/e2e-smoke.mjs` | login (3 perfis + senha errada), dashboard por perfil, KB, controle de acesso (403/401), criação de chamado, XSS em mensagem, SSRF em webhook (bloqueio de metadata endpoint), validação de host em monitor de rede, rate-limit de login |
| `scripts/e2e-phase3.mjs` | esqueci-minha-senha (anti-enumeração + notificação), CRUD de localizações |
| `scripts/e2e-roadmap.mjs` | hash de token de agente (nunca em claro), regeneração de token, telemetria em série temporal, ingestão XDR |
| `scripts/test-profiles.mjs` | perfis/permissões granulares |
| `docs/qa/relatorio-qa-v1..v6.md` | auditorias manuais de UX/funcional por tela — **desatualizadas** em relação às features adicionadas nesta sessão (Projetos, notificações redesenhadas, Relatórios, Kanban, respostas prontas, chamados recorrentes, motivo de pendência) |

Esses scripts autenticam via `fetch` cru (cookie `nexus_session` extraído do `Set-Cookie`) — mesmo padrão reaproveitado pelos novos scripts em `qa/scripts/`.

## 10. Riscos e pontos críticos identificados por leitura de código

1. **Rotas construídas nesta sessão sem cobertura de teste alguma**: `macros` (respostas prontas), `recurring-tickets`, e a nova lógica de `pending_reason`/`pending_reopen_at` em `tickets/[id]`. Prioridade alta para os agentes de chaos/permissão.
2. **Agendadores em processo** (`recurring-ticket-scheduler.js`, `pending-ticket-scheduler.js`, `printer-scheduler.js`) usam `globalThis` como guarda contra duplicação em HMR — corretos em dev, mas nunca testados sob restart/crash do processo.
3. **SPA sem rotas reais**: qualquer teste de "voltar/avançar no navegador" ou "abrir em nova aba" precisa considerar que o estado vive em React, não na URL (exceto `?ticket=`).
4. **Migrações rodam uma única vez por processo** (`globalForDb.__nexusMigrated`) — alterações de schema exigem restart do servidor para valerem (confirmado ao vivo nesta sessão). Candidato a bug de operação (não de aplicação) se um deploy não reiniciar o processo Node corretamente — mas o Docker Compose sempre recria o container, então o risco real é baixo em produção.
5. **`ensureItilTables`/seeds redundantes**: existem DOIS caminhos de seed de `ticket_statuses` (um em `lib-db/index.cjs:ensureAgentEnhancementTables`, outro em `src/lib/ticket-statuses.js:seedTicketStatuses`) com defaults ligeiramente diferentes (um sem `CANCELADO`). Risco de inconsistência entre organizações criadas em momentos diferentes do código.
6. **Áreas ainda não instrumentadas por este QA**: acesso remoto (depende de agente local, não simulável sem o binário), motor de IA/DeepSeek (opcional, sem chave no ambiente de teste), LDAP (sem servidor LDAP disponível), conectores XDR pull (sem credenciais).

## 11. Ambiente de teste usado por este framework

- Base URL: `http://localhost:3000` (dev, SQLite, `NODE_ENV` não é `production`).
- **Nunca aponta para produção** — `qa/config/environment.mjs` recusa rodar se `BASE` contiver domínio de produção conhecido ou se `NODE_ENV=production` sem `QA_ALLOW_PROD=1` explícito.
- Dados: seed-demo (`npm run seed:demo`) fornece os 3 usuários acima + 1 filial + tickets/ativos de exemplo. Fixtures adicionais criadas pelos próprios scripts de QA usam prefixo `QA-` no título/nome para serem identificáveis e (quando possível) limpas após a execução.
