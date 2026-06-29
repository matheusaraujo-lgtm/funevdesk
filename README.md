# FunevDesk

Plataforma full-stack de chamados, monitoramento e suporte para matriz e filiais.

## Stack

- Next.js 16 com App Router e Route Handlers.
- React 19 em JavaScript.
- shadcn/ui v4 com Tailwind CSS v4 e componentes Base UI.
- SQLite com `better-sqlite3` no desenvolvimento.
- Agente Windows em Electron (telemetria, inventário, chamados, acesso remoto no navegador).
- Agente PowerShell legado ainda disponível como fallback GPO.

## Executar

```powershell
npm install
npm run dev
```

Abra `http://localhost:3000`. O banco e os dados demonstrativos são criados automaticamente em `data/nexus-desk.db`.

## Recursos implementados

- Organização com matriz e múltiplas filiais.
- Filtro operacional por unidade.
- Perfis graduados de administrador, técnico e usuário.
- Administrador com visão de todas as unidades.
- Técnico limitado aos chamados, ativos, conversa e acesso remoto de sua filial.
- Usuário limitado aos próprios chamados, conversa e máquina associada.
- Chamados vinculados à filial e ao ativo.
- Página de detalhes com descrição, origem, solicitante, telemetria e histórico.
- Catálogo administrável de tipos de chamado.
- Formulários dinâmicos com texto curto, texto longo, lista, data, arquivo e captura de tela.
- Campos obrigatórios validados novamente no servidor.
- Respostas personalizadas e anexos exibidos nos detalhes.
- Inventário e telemetria de CPU, memória, disco, usuário e IP.
- API autenticada por token individual do agente.
- Alertas básicos gerados pela telemetria.
- Chat persistido por chamado entre técnico e colaborador.
- Agente com abertura de chamado e janela de conversa.
- Instalador PowerShell para distribuição por GPO.

## Instalação do agente Windows (Electron)

1. Em **Configurações > Agente Windows**, selecione a chave de enrollment ou token do ativo.
2. Baixe o **Instalador Electron (EXE)** ou **MSI (GPO)**.
3. Execute como Administrador (ou use `/S` / `msiexec /qn` para instalação silenciosa).
4. O agente aparece na bandeja do sistema; use-o para abrir chamados e conversar com o suporte.
5. O técnico inicia o acesso remoto no portal; o colaborador aceita no agente e a sessão abre no navegador (WebRTC).

Artefatos pré-compilados: `npm run build:agent` (requer Windows).

## Instalação legada (PowerShell / GPO)

1. Copie a pasta `agent` para um compartilhamento somente leitura.
2. Gere no servidor um token individual para cada ativo.
3. Execute `Install-GPO.ps1` por script de inicialização da máquina:

```powershell
.\Install-GPO.ps1 `
  -ServerUrl "https://suporte.suaempresa.com" `
  -AgentToken "TOKEN_DO_ATIVO"
```

O agente de telemetria roda como `SYSTEM` no início da máquina. A interface de chat roda no logon do colaborador.

## Segurança antes de produção

- Trocar SQLite por PostgreSQL.
- Adicionar login corporativo OIDC/SAML, MFA e RBAC.
- Armazenar tokens dos agentes como hash e implementar rotação/revogação.
- Migrar anexos de `public/uploads` para armazenamento privado S3/MinIO com links temporários.
- Aplicar antivírus, verificação de conteúdo e política de retenção aos anexos.
- Usar TLS válido e restringir CORS/origens.
- Assinar scripts, binários e pacote MSI.
- Não expor RDP diretamente. Use o acesso remoto integrado (WebRTC com consentimento no agente) e mantenha auditoria nos logs.
- Adicionar retenção de logs, trilha de auditoria e política LGPD.

## Próximas camadas

- WebSocket/Redis para chat em múltiplas instâncias.
- Catálogo de serviços e formulários configuráveis.
- SLA, filas, equipes, escalonamento e notificações.
- Descoberta SNMP, ICMP, Prometheus e Zabbix.
- Empacotamento MSI do agente e atualização automática assinada.
