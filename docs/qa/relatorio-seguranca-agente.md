# Relatório de Segurança — Agente Desktop FunevDesk (EDR/XDR/EPP)

> Auditoria conduzida pelo agente `auditor-seguranca-agente`. Escopo: `agent-desktop/` (Electron 35) + ingestão XDR/EPP no servidor Next.js (`src/app/api/agent/heartbeat`, `src/lib/security-analyst.js`, `src/app/api/security`).
> **Metodologia:** leitura de código + **simulação real** de heartbeats forjados contra o servidor em execução (porta 3000), verificação direta em `xdr_alerts` e na Central de Segurança (`GET /api/security` autenticado como `admin@local`), e **PoC ao vivo** do bridge local `127.0.0.1:47832`. Dados de teste totalmente limpos ao final (1 org Funev, 4 alertas-semente, 3 ativos, chave de enrollment restaurada).
> Data: 2026-06-27.

Legenda: ✅ provado · ⛔ vulnerável/quebrado (com PoC) · ⚠️ indício.

---

## 1. Resumo executivo

**Postura geral de segurança: 5,5/10.** O ciclo XDR funciona ponta a ponta e o isolamento multi-tenant **resiste** (ambos provados ao vivo), o que é um mérito real. Mas a segurança do **próprio agente** tem falhas concretas — com destaque para o bridge local que vaza identidade da máquina para qualquer site aberto no navegador (PoC ao vivo), e um bug de migração que derruba o servidor inteiro ao criar a 2ª organização.

**Maturidade EPP/XDR vs. mercado:**
- **EPP (coleta):** intermediário. Lê estado do Defender (realtime/antivírus/antispyware/**tamper**/idade de assinatura) e ameaças reais via `Get-MpThreatDetection`. Cobre AV de terceiros (SecurityCenter2) e degrada com elegância (try/catch + fallback). Mas é só **Defender** para ameaças (sem CrowdStrike/SentinelOne reais no endpoint), não há telemetria de processo/rede contínua, e a UI **descarta** o sinal de tamper protection coletado.
- **XDR (ingestão/ciclo):** sólido para o escopo. Dedup correto por `(organization_id, provider, external_id)`, severidade mapeada certo, `detected_at` preservado, abertura de chamado proativo. Falta resposta a incidente (isolar host, matar processo, quarentena remota) — recursos básicos de um EDR de mercado.

**Os 5 riscos que mais preocupam:**
1. ⛔ **[Alto] Bridge local com CORS `*`** vaza hostname, assetId, branchId, usuário de domínio e IP interno para QUALQUER origem web (PoC ao vivo abaixo).
2. ⛔ **[Alto] Bug de migração multi-tenant** (`ensureExtendedCatalogTables`) derruba `getDb()` globalmente — toda a aplicação retorna 500 — quando uma organização sem `ticket_categories` existe (reproduzido ao vivo).
3. ⛔ **[Alto] Auto-update por HTTP sem assinatura** quando o `serverUrl` é `http://` (feed `generic` do electron-updater, `quitAndInstall` silencioso) — vetor de execução remota de código.
4. ⚠️ **[Médio-Alto] Enrollment/segredo em claro no disco** (`C:\ProgramData\FunevDesk\config.json`) e **token permanente legível** por qualquer processo do usuário; sem rotação automática.
5. ⚠️ **[Médio] Acesso remoto / input-simulator** sem trava de origem do comando nem kill-switch local; consentimento existe mas a sessão não tem trilha de auditoria robusta no agente.

---

## 2. EPP — coleta de proteção de endpoint

Arquivo: `agent-desktop/src/inventory.js`.

**O que cobre (bom):**
- `getAntivirus()` (linha 28): decodifica `productState` do **SecurityCenter2** (cobre AV de terceiros) e cai para `Get-MpComputerStatus` se a lista vier vazia; último fallback em `systeminformation`. Cobre **sem AV** (retorna `[]` → UI mostra "Não detectado").
- `getEppStatus()` (linha 59): coleta `RealTimeProtectionEnabled`, `AntivirusEnabled`, `AntispywareEnabled`, **`IsTamperProtected`**, `AntivirusSignatureAge`, versão e datas de scan. Cobertura de estado boa.
- `getDefenderThreats()` (linha 81): junta `Get-MpThreat` (nome/severidade) com `Get-MpThreatDetection` (top 50, ordenado por data), mapeia severidade e ação para PT. Bom.
- **Degradação:** todo bloco PowerShell está em `try/catch` retornando `null`/`[]`; `collectInventory` tem timeout global de 45 s e fallback para só telemetria (linha 373). Falha de PowerShell/política/privilégio **não derruba** o heartbeat. ✅

**Lacunas:**
- ⚠️ **Tamper protection coletado mas descartado na UI.** `getEppStatus` traz `tamperProtection`, mas `renderEpp` (`renderer/app.js:38`) só exibe `product`, `realtimeProtection` e idade de assinatura. **Tamper off** — sinal crítico de comprometimento — nunca chega ao usuário nem vira alerta. **Médio.**
- ⚠️ **Sem AV / AV desabilitado não gera alerta XDR.** `ingestDefenderThreats` só cria alertas a partir de `epp.threats[]`; estado "realtime off", "tamper off" ou "sem AV" **não** vira `xdr_alert`. Um endpoint desprotegido fica invisível na Central. **Médio.**
- ⚠️ **Assinatura "velha" fixa em 7 dias** em dois lugares (`getAntivirus` e `renderEpp`), sem configurável; e a UI esconde o estado quando `signatureAgeDays` é null.
- **Custo/frequência:** a coleta completa dispara **6+ processos PowerShell** (`getAntivirus`, `getLocalAdmins`, `getInstalledSoftware`, `getWindowsSecurity`, `getEppStatus`, `getDefenderThreats`) + extração de ícones (`attachSoftwareIcons`, mais um PowerShell pesado com System.Drawing). Roda a cada `inventoryIntervalMinutes` (padrão **60 min**) — frequência adequada. Há cache (`lastInventorySnapshot`) reutilizado pelo IPC `agent:inventory` quando `refresh=false`. Razoável, mas o pico de 7 processos PowerShell simultâneos é caro em máquinas fracas. **Baixo.**

---

## 3. XDR — ciclo do alerta (com simulação)

Forjei heartbeats reais contra `POST /api/agent/heartbeat` na porta 3000, usando chaves de enrollment conhecidas semeadas para a org real (Funev = "org A") e uma org temporária ("org B"). Verifiquei o efeito em `xdr_alerts` e na Central (`GET /api/security`). Tudo limpo ao final.

| # | Cenário | Enviado | Esperado | Obtido | Evidência |
|---|---------|---------|----------|--------|-----------|
| 1 | Host limpo (enrollment org A) | `inventory.epp.threats: []` | enrollment OK, **0 alertas** | enrollment 200 + `agentToken` `nxd_wOSQ…`; nenhum `xdr_alert` criado | ✅ HTTP 200 `{enrolled:true}`; consulta `external_id LIKE 'AUDIT-EXT-%'` = 0 |
| 2 | 1 CRÍTICA + 1 MÉDIA | threat `severity:"Grave"` (`AUDIT-EXT-CRIT`) + `severity:"Moderada"` (`AUDIT-EXT-MED`) | 2 alertas com **CRITICAL** e **MEDIUM** | 2 linhas: `AUDIT-EXT-CRIT`→`CRITICAL`, `AUDIT-EXT-MED`→`MEDIUM`; `detected_at` preservado (10:00Z / 09:00Z) | ✅ Mapeamento `DEFENDER_SEVERITY` (security-analyst.js:22) confirmado |
| 3 | Reenvio do mesmo `external_id` | `AUDIT-EXT-CRIT` de novo, `action` de "Quarentena"→**"Removida"** | **atualiza, não duplica** | `COUNT` por `(org,external_id)` = **1**; `raw_json.action` virou "Removida" | ✅ **Upsert provado** (`ON CONFLICT … DO UPDATE`) |
| 4 | Cross-tenant (org B, mesmo `external_id`) | org B envia `AUDIT-EXT-CRIT` com título "ORG-B-Ameaca-Diferente", `severity:"Baixa"` | **NÃO** sobrescreve o alerta de A | 2 linhas distintas: A mantém `CRITICAL`/"Ransom…"; B cria `LOW`/"ORG-B…". Central de A **não** mostra o de B | ✅ **Isolamento resiste** — `UNIQUE(organization_id, provider, external_id)` |

**Verificação na Central de Segurança** (`GET /api/security` logado como admin de Funev): retornou exatamente os 2 alertas de `AUDIT-HOST-A` (CRITICAL + MEDIUM) com `hostname`, `branch_name`, `description` (ação/recurso/processo) e `severity`. O alerta da org B **não apareceu** (escopo `x.organization_id=?` na rota). ✅

**Conclusões do ciclo XDR:**
- ✅ Ponta a ponta funciona: ameaça → heartbeat → `ingestDefenderThreats` → `xdr_alerts` → Central.
- ✅ Dedup/upsert correto; ✅ severidade correta; ✅ `detected_at` preservado.
- ✅ **Isolamento multi-tenant resiste** (a migração `migrateXdrAlertsUnique` em `lib-db/index.cjs:939` consertou a constraint global antiga). Histórico: o comentário no código confirma que a constraint **antiga** era `UNIQUE(provider, external_id)` GLOBAL e permitia cross-tenant — hoje corrigida.
- ⚠️ **Falta contexto MITRE ATT&CK** no alerta (nem técnica, nem tática). Defender/Sentinel sempre trazem. **Baixo/Médio.**
- ⚠️ A severidade de ameaça do Defender desconhecida cai para `MEDIUM` por padrão (security-analyst.js:62) — pode subnotificar uma "Grave" que venha com rótulo inesperado.

---

## 4. Segurança do agente

### [ALTO] ⛔ Bridge local `127.0.0.1:47832` com CORS `*` vaza identidade da máquina
- **Arquivo:** `agent-desktop/src/local-bridge.js:55-68` (e preflight 24-30).
- **Risco:** o servidor responde `GET /api/local` com `access-control-allow-origin: *` **e** `access-control-allow-private-network: true`. Qualquer página web aberta no navegador do colaborador pode fazer `fetch('http://127.0.0.1:47832/api/local')` e **ler** a resposta — fingerprinting/deanonimização do dispositivo corporativo, correlação de usuário, reconhecimento para ataque dirigido.
- **PoC (ao vivo, com o agente rodando nesta máquina):**
  ```
  $ curl -s -H "Origin: https://evil-attacker.example" http://127.0.0.1:47832/api/local
  {"ok":true,"serverUrl":"http://localhost:3000","hostname":"DESKTOP-OBMS9TA",
   "assetId":"ast_0e465568e70c44edb0285db2a38a3487","branchId":"br_939e9ab7…",
   "loggedUser":"DESKTOP-OBMS9TA\\Usuario","ipAddress":"10.10.1.1"}
  Headers: access-control-allow-origin: *  /  access-control-allow-private-network: true
  ```
  Vazou hostname, assetId, branchId, **usuário (domínio\login)** e **IP interno** para uma origem arbitrária. ✅ provado.
- **Correção:** trocar `*` por uma **allowlist** de origens (o(s) domínio(s) do próprio FunevDesk lidos do `config.serverUrl`); ecoar o `Origin` só se permitido; exigir um header/segredo de handshake; e minimizar o payload (não expor `loggedUser` nem `ipAddress` — para auto-detecção da máquina basta `hostname`/`assetId`).

### [ALTO] ⛔ Bug de migração multi-tenant derruba o servidor inteiro
- **Arquivo:** `lib-db/index.cjs:1216-1232` (`ensureExtendedCatalogTables`, chamada por `getDb()` em toda requisição).
- **Risco:** a migração verifica `ticket_categories` de **uma só** organização (`SELECT id FROM organizations LIMIT 1`) e, se `catCount=0`, insere categorias com **IDs fixos** (`cat_sistema`, `cat_acesso`, …). Numa instância com 2+ orgs, basta uma org sem categorias para o `INSERT` colidir com os IDs já existentes de outra org → `UNIQUE constraint failed: ticket_categories.id` lançado dentro de `getDb()` → **todas** as rotas (heartbeat, login, Central) passam a retornar **500**.
- **PoC:** ao criar a org de teste "ORG-AUDIT-B", todo `POST /api/agent/heartbeat` passou a responder **500** com exatamente esse stack (capturado em `preview_logs`). Ao pré-semear 1 categoria para a org nova, `getDb()` voltou a funcionar e o heartbeat respondeu 200. ✅ reproduzido e revertido.
- **Correção:** iterar **todas** as orgs e gerar IDs de categoria por org com `makeId('cat')` (como já faz `ensureXdrAlertSeeds`), ou usar `INSERT OR IGNORE` + IDs compostos por org. Migração nunca deve lançar dentro de `getDb()`.

### [ALTO] ⚠️ Auto-update por HTTP sem assinatura verificável
- **Arquivo:** `agent-desktop/src/updater.js:23-38, 58-76`.
- **Risco:** o feed é `${serverUrl}/downloads/agent/updates` com `provider: "generic"`, `autoDownload=true` e `quitAndInstall(true,true)` **silencioso**. Como o `serverUrl` é white-label por organização e o `config.js` aceita `http:` (validação em `config.js:49` permite `http:`), um cliente configurado com `http://` recebe **instalador NSIS por HTTP sem TLS e sem verificação de assinatura de código no app** — um atacante na rede (MITM) pode entregar um `Setup.exe` malicioso que é instalado e executado automaticamente. Execução remota de código na frota.
- **Correção:** exigir `https://` para o feed de update (recusar `http:`); validar **assinatura Authenticode** do instalador antes de aplicar; idealmente fixar a chave pública (pinning) do publisher.

### [MÉDIO-ALTO] ⚠️ Segredos em claro no disco e sem rotação no cliente
- **Arquivos:** `agent-desktop/src/config.js:8-9, 133-145` (grava `config.json` em `C:\ProgramData\FunevDesk\` com `agentToken` em texto puro) e `auth.js` (chave de enrollment vem do `build-config.json` empacotado, também em claro).
- **Risco:** qualquer processo do usuário (ou malware sem privilégio elevado) lê o token permanente `nxd_…` e passa a se autenticar como o ativo. A chave de enrollment `nxen_…` empacotada permite registrar **novos** ativos na org. No servidor os segredos são hasheados em repouso (`hashToken` = SHA-256 **sem salt**, `security.js:190`) — bom para o servidor, mas o **cliente** guarda o plaintext. Não há rotação automática do token.
- **Correção:** proteger `config.json` com DPAPI (`CredProtect`/`ProtectData`) por máquina/usuário; restringir ACL do diretório; suportar rotação do token de ativo; trocar SHA-256 puro por HMAC com segredo de servidor (defesa contra dicionário, ainda que tokens sejam aleatórios).

### [MÉDIO] ⚠️ Acesso remoto e input-simulator sem trava forte
- **Arquivos:** `webrtc-service.js`, `input-simulator.js`, `popups.js` (`acceptRemote`).
- **Positivo:** há **consentimento explícito** via popup (`consent.html`) antes de iniciar o host WebRTC; janelas WebRTC com `contextIsolation:true`/`nodeIntegration:false`.
- **Risco:** uma vez aceito, `webrtc:simulate` (heartbeat.js:466) executa qualquer ação de mouse/teclado vinda do canal sem validar a sessão/origem do comando; não há **kill-switch local** sempre-visível nem **trilha de auditoria** no próprio agente (só `appendLog`). O `input-simulator` constrói PowerShell por interpolação de coordenadas/teclas (`${x}`, `${vk}`) — os valores vêm do técnico remoto, baixo risco de injeção (numéricos), mas sem sanitização explícita.
- **Correção:** vincular cada `simulate` à sessão ativa consentida; barra de sessão remota persistente com botão "Encerrar agora"; log assinado de início/fim/ações; validar tipos numéricos antes de montar o PS.

### [BAIXO] ⚠️ CSP ausente em `webrtc-host.html` e `setup.html`
- **Evidência:** `index.html`, `consent.html`, `reply.html` têm `<meta Content-Security-Policy>` (`default-src 'self'; script-src 'self'`), mas `setup.html` e **`webrtc-host.html`** não. O webrtc-host processa dados de sinalização não confiáveis.
- **Correção:** aplicar a mesma CSP `script-src 'self'` a todas as páginas do renderer.

**Electron hardening — geral (bom):** todas as `BrowserWindow` usam `contextIsolation:true` + `nodeIntegration:false` + preloads dedicados que expõem só o necessário (`preload.js`, `popup-preload.js`, `webrtc-preload.js`). Não há `nodeIntegration:true`, `webSecurity:false` nem `enableRemoteModule`. Não há `setWindowOpenHandler` (nenhuma janela abre conteúdo externo, então o risco é baixo). IPC é via `ipcMain.handle` com canais nomeados.

---

## 5. Funcionalidades — o que falta vs. EDR de mercado

- **Resposta a incidente ausente:** não há **isolar host da rede**, **matar processo**, **quarentena remota de arquivo** nem **coletar artefato** a partir do alerta. A Central só abre chamado. CrowdStrike/SentinelOne/Defender for Endpoint têm "Network Contain" e "Kill" em um clique.
- **Sem telemetria contínua de processo/rede** (árvore de processos, conexões, hashes). A coleta é snapshot a cada 60 min, não streaming de eventos.
- **EPP só sinaliza ameaça, não postura:** sem AV / realtime off / **tamper off** / firewall off não viram alerta acionável.
- **Sem MITRE ATT&CK** no alerta (tática/técnica), nem severidade de confiança.
- **Sem log de sessão remota** auditável (gravação/eventos) no padrão de mercado.
- **Bom que já existe:** abertura de chamado proativo a partir do alerta, vínculo alerta↔chamado (dedup), análise por IA opcional, conectores XDR plugáveis (`xdr-connectors`).

---

## 6. Design & UX da UI do agente

- **Estado de proteção pouco visível:** `renderEpp` (`renderer/app.js:38`) mostra tags "Tempo real: ativo/desligado" e "Assinaturas: atualizadas/desatualizadas" **dentro do detalhe de inventário** — não há um **banner de saúde** no topo ("Você está protegido" verde / "Em risco" vermelho) como a bandeja do Defender/CrowdStrike. O usuário leigo não percebe o estado num relance.
- **Tamper protection não aparece** (coletado e descartado) — lacuna de transparência.
- **Microcopy:** pt-BR claro e correto ("Nenhuma ameaça detectada", "ameaça(s) detectada(s) pelo antivírus"). Status de conexão usa "Conectando ao servidor…/Online/Offline" — adequado.
- **Cores semânticas:** usa `.warn` para estados ruins e `sev-*` por severidade; bom, mas sem um verde "protegido" forte de destaque.
- **Estados de borda cobertos parcialmente:** "sem AV" → "Não detectado" (ok); "ameaça ativa" → lista (ok); "agente offline" → status (ok); "sem consentimento" → popup (ok). Falta o estado consolidado de **risco** (AV off + tamper off).
- **Acessibilidade:** ícones/ texto via `escapeHtml` (bom contra XSS); convém checar contraste das tags `.warn` e adicionar `aria-label` ao indicador de status (ponto colorido).
- **Redesenhar:** promover um **cabeçalho de saúde de proteção** no topo da janela principal, somando realtime + tamper + assinatura + firewall num selo único (verde/âmbar/vermelho), com CTA "Resolver".

---

## 7. Top 10 ações priorizadas (impacto × esforço)

| # | Ação | Sev. | Esforço | Ganho / padrão de mercado |
|---|------|------|---------|---------------------------|
| 1 | Restringir CORS do bridge local a allowlist de origem + minimizar payload (sem `loggedUser`/`ipAddress`) | Alto | Baixo | Fecha vazamento de identidade comprovado; alinha com bridges de agente seguros |
| 2 | Corrigir migração `ensureExtendedCatalogTables` para ser multi-tenant (IDs por org, iterar todas) | Alto | Baixo | Elimina 500 global; pré-requisito de qualquer cliente multi-org |
| 3 | Forçar `https://` no feed de update + validar assinatura Authenticode antes de instalar | Alto | Médio | Bloqueia RCE via update MITM; padrão electron-updater seguro |
| 4 | Proteger `config.json`/token com DPAPI + ACL restrita + rotação de token | Médio-Alto | Médio | Segredo deixa de ficar em claro; reduz roubo de credencial de ativo |
| 5 | Gerar `xdr_alert` para postura ruim (sem AV, realtime off, **tamper off**, firewall off) | Médio | Médio | Endpoint desprotegido fica visível; paridade EPP de mercado |
| 6 | Surfacing de **tamper protection** + banner de saúde de proteção na UI | Médio | Baixo | Transparência ao usuário; UX no nível Defender/CrowdStrike |
| 7 | Travar `webrtc:simulate` à sessão consentida + kill-switch e log assinado de sessão remota | Médio | Médio | Auditoria e contenção de acesso remoto |
| 8 | Adicionar MITRE ATT&CK + confiança ao alerta XDR | Médio | Médio | Contexto de triagem como Sentinel/Defender |
| 9 | Aplicar CSP a `webrtc-host.html` e `setup.html` | Baixo | Baixo | Defesa em profundidade no renderer |
| 10 | Ações de resposta a incidente (isolar host, matar processo, quarentena) a partir do alerta | Alto | Alto | Recurso central de EDR ausente hoje |
