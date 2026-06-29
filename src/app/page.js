"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppNavbar } from "@/components/app-navbar";
import { CommandPalette } from "@/components/command-palette";
import { AssetsView } from "@/components/assets-view";
import { AssetDetailView } from "@/components/asset-detail-view";
import { PrintersView } from "@/components/printers-view";
import { SecurityView } from "@/components/security-view";
import { ChangeFormView } from "@/components/change-form-view";
import { ChangesView } from "@/components/changes-view";
import { AuditView } from "@/components/audit-view";
import { ProblemFormView } from "@/components/problem-form-view";
import { ProblemsView } from "@/components/problems-view";
import { ReportsView } from "@/components/reports-view";
import { TeamFormView } from "@/components/team-form-view";
import { TeamsView } from "@/components/teams-view";
import { WebhookFormView } from "@/components/webhook-form-view";
import { WebhooksView } from "@/components/webhooks-view";
import { AutomationsView } from "@/components/automations-view";
import { BranchFormView } from "@/components/branch-form-view";
import { BranchesView } from "@/components/branches-view";
import { CatalogTypeFormView } from "@/components/catalog-type-form-view";
import { CatalogTypeWorkflowView } from "@/components/catalog-type-workflow-view";
import { DocumentationFormView } from "@/components/documentation-form-view";
import { DocumentationDetailView } from "@/components/documentation-detail-view";
import { KnowledgeFormView } from "@/components/knowledge-form-view";
import { KnowledgeDetailView } from "@/components/knowledge-detail-view";
import { NetworkFormView } from "@/components/network-form-view";
import { TermFormView } from "@/components/term-form-view";
import { TermDetailView, TermTemplateDetailView } from "@/components/term-detail-view";
import { UserFormView } from "@/components/user-form-view";
import { AuthView } from "@/components/auth-view";
import { DashboardView } from "@/components/dashboard-view";
import { DocumentationView } from "@/components/documentation-view";
import { KnowledgeView } from "@/components/knowledge-view";
import { NetworkView } from "@/components/network-view";
import { SettingsGeneralView } from "@/components/settings-general-view";
import { SettingsStatusesView } from "@/components/settings-statuses-view";
import { SettingsCategoriesView } from "@/components/settings-categories-view";
import { SettingsLocationsView } from "@/components/settings-locations-view";
import { InventoryView } from "@/components/inventory-view";
import { SettingsTypesView } from "@/components/settings-types-view";
import { TermsView } from "@/components/terms-view";
import { TermTemplateFormView, TermTemplatesView } from "@/components/term-templates-view";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RemoteConsoleEmbed } from "@/components/remote-console-embed";
import { TicketCreateView } from "@/components/ticket-create-view";
import { TicketDetails } from "@/components/ticket-details";
import { TicketsView } from "@/components/tickets-view";
import { MyTicketsView } from "@/components/my-tickets-view";
import { isRichTextEmpty } from "@/lib/rich-text";
import { EmployeePortalNavbar } from "@/components/employee-portal-navbar";
import { UsersView } from "@/components/users-view";
import { ProfilesView } from "@/components/profiles-view";

export default function Home() {
  const [authStatus, setAuthStatus] = useState("loading");
  const [sessionUser, setSessionUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(null);
  const [branchId, setBranchId] = useState("");
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [ticketDetails, setTicketDetails] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [settings, setSettings] = useState(null);
  const [createKey, setCreateKey] = useState(0);
  const [formDraft, setFormDraft] = useState(null);
  const [userEditId, setUserEditId] = useState(null);
  const [branchEditId, setBranchEditId] = useState(null);
  const [teamEditId, setTeamEditId] = useState(null);
  const [termTemplates, setTermTemplates] = useState([]);
  const [ticketStatuses, setTicketStatuses] = useState([]);
  const [agentAssets, setAgentAssets] = useState([]);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [remoteSession, setRemoteSession] = useState(null);
  const [ticketsQueue, setTicketsQueue] = useState(null);
  const deepLinkRestored = useRef(false);
  const [createdCredential, setCreatedCredential] = useState(null);

  const goToTicketsQueue = useCallback((queueTarget) => {
    setTicketsQueue(queueTarget);
    setView("tickets");
  }, []);

  const reloadCatalog = useCallback(async () => {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    if (response.ok) setCatalog((await response.json()).catalog);
  }, []);

  const reloadTermTemplates = useCallback(async () => {
    const response = await fetch("/api/term-templates", { cache: "no-store" });
    if (response.ok) setTermTemplates((await response.json()).templates);
  }, []);

  function refreshLists() {
    setListRefreshKey((current) => current + 1);
    reloadCatalog();
    reloadTermTemplates();
  }

  const resetApplication = useCallback(() => {
    setData(null);
    setCatalog([]);
    setUsers([]);
    setProfiles([]);
    setBranches([]);
    setSettings(null);
    setBranchId("");
    setSelectedTicket(null);
    setTicketDetails(null);
    setFormDraft(null);
    setUserEditId(null);
    setBranchEditId(null);
    setTeamEditId(null);
    setTicketStatuses([]);
    setTermTemplates([]);
    setAgentAssets([]);
    setRemoteSession(null);
  }, []);

  const loadSession = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) {
      resetApplication();
      setSessionUser(null);
      setAuthStatus("unauthenticated");
      return null;
    }
    const result = await response.json();
    setSessionUser(result.user);
    if (result.passwordChangeRequired) {
      setAuthStatus("change-password");
      return result;
    }
    setView(result.user.role === "EMPLOYEE" ? "new-ticket" : "dashboard");
    setAuthStatus("authenticated");
    return result;
  }, [resetApplication]);

  const handleProtectedResponse = useCallback(async (response) => {
    if (response.status === 401) {
      resetApplication();
      setSessionUser(null);
      setAuthStatus("unauthenticated");
      toast.error("Sua sessão expirou. Entre novamente.");
      return false;
    }
    if (response.status === 403) {
      const result = await response.clone().json().catch(() => ({}));
      if (result.code === "PASSWORD_CHANGE_REQUIRED") {
        setAuthStatus("change-password");
        return false;
      }
    }
    return true;
  }, [resetApplication]);

  const loadData = useCallback(async () => {
    const dashboardResponse = await fetch(`/api/dashboard${branchId ? `?branchId=${branchId}` : ""}`, { cache: "no-store" });
    if (!await handleProtectedResponse(dashboardResponse)) return;
    if (!dashboardResponse.ok) return toast.error("Não foi possível carregar o painel.");
    const dashboard = await dashboardResponse.json();
    // Checagem granular a partir da matriz do perfil para decidir o que carregar.
    const pc = (module, action = "read") => Boolean(dashboard.permissionMap?.[module]?.[action]);
    const catalogResponse = await fetch("/api/catalog", { cache: "no-store" });
    if (!await handleProtectedResponse(catalogResponse)) return;
    if (!catalogResponse.ok) return toast.error("Não foi possível carregar os tipos de chamado.");
    setData(dashboard);
    setSessionUser(dashboard.currentUser);
    setTicketStatuses(dashboard.ticketStatuses || []);
    setCatalog((await catalogResponse.json()).catalog);

    // Cada dataset administrativo é buscado conforme a permissão da tela correspondente.
    const needsUsers = pc("users") || dashboard.permissions.canManageTickets;
    const [usersRes, settingsRes, branchesRes, profilesRes, templatesRes] = await Promise.all([
      needsUsers ? fetch("/api/users", { cache: "no-store" }) : null,
      pc("settings") ? fetch("/api/settings", { cache: "no-store" }) : null,
      pc("branches") ? fetch("/api/branches", { cache: "no-store" }) : null,
      (pc("profiles") || pc("users")) ? fetch("/api/profiles", { cache: "no-store" }) : null,
      (pc("term_templates") || pc("ticket_types")) ? fetch("/api/term-templates", { cache: "no-store" }) : null,
    ]);
    setUsers(usersRes?.ok ? (await usersRes.json()).users : []);
    if (settingsRes?.ok) {
      const settingsPayload = await settingsRes.json();
      setSettings(settingsPayload.settings);
      setAgentAssets(settingsPayload.agentAssets || []);
    } else {
      setSettings(null);
      setAgentAssets([]);
    }
    setBranches(branchesRes?.ok ? (await branchesRes.json()).branches : []);
    setProfiles(profilesRes?.ok ? ((await profilesRes.json()).profiles || []) : []);
    setTermTemplates(templatesRes?.ok ? ((await templatesRes.json()).templates || []) : []);
  }, [branchId, handleProtectedResponse]);

  const loadTicketDetails = useCallback(async (ticketId) => {
    const response = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
    if (!await handleProtectedResponse(response)) return null;
    if (!response.ok) {
      toast.error((await response.json()).error || "Não foi possível abrir o chamado.");
      return null;
    }
    const details = await response.json();
    setTicketDetails(details);
    return details;
  }, [handleProtectedResponse]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authStatus === "authenticated") loadData().catch(() => {});
  }, [authStatus, loadData]);

  // Mantém o loadData mais recente sem recriar o intervalo a cada novo `data`.
  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  const lastLoadRef = useRef(0);
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const interval = setInterval(() => {
      // Não consome rede quando a aba está em segundo plano — economiza ~7 GETs/ciclo.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      lastLoadRef.current = Date.now();
      // Falha de rede (servidor reiniciando/offline): ignora; o próximo ciclo tenta de novo.
      loadDataRef.current().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [authStatus]);

  // Revalidação ao voltar o foco (padrão SWR): dados frescos quando o usuário retorna,
  // com guarda de 15s para não repetir os GETs em alternância rápida de abas.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastLoadRef.current < 15000) return;
      lastLoadRef.current = now;
      loadDataRef.current().catch(() => {});
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [authStatus]);

  useEffect(() => {
    const appName = data?.currentUser?.appName || sessionUser?.appName;
    if (appName) document.title = appName;
  }, [data?.currentUser?.appName, sessionUser?.appName]);

  const terminalStatusCodes = useMemo(
    () => ticketStatuses.filter((status) => status.is_terminal).map((status) => status.code),
    [ticketStatuses],
  );
  const terminalStatusCode = terminalStatusCodes[0] || "RESOLVIDO";
  const activeTickets = useMemo(
    () => data?.tickets.filter((ticket) => !terminalStatusCodes.includes(ticket.status)) || [],
    [data, terminalStatusCodes],
  );

  async function requestJson(url, options, fallback) {
    const response = await fetch(url, options);
    if (!await handleProtectedResponse(response)) return null;
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error || fallback);
      return null;
    }
    return result;
  }

  async function createTicket(ticket) {
    const result = await requestJson("/api/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ticket) }, "Revise os dados do chamado.");
    if (!result) return null;
    toast.success(`Chamado #${result.number} criado.`);
    await loadData();
    if (sessionUser?.role === "EMPLOYEE" || data?.currentUser?.role === "EMPLOYEE") {
      await openTicket({ id: result.id, number: result.number, title: ticket.title, status: "ABERTO" });
    }
    return result;
  }

  async function createTicketType(ticketType) {
    const result = await requestJson("/api/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ticketType) }, "Não foi possível salvar o tipo de chamado.");
    if (!result) return false;
    setCatalog(result.catalog);
    toast.success("Tipo de chamado criado.");
    return true;
  }

  async function saveTicketType(ticketTypeId, ticketType) {
    const result = await requestJson(`/api/catalog/${ticketTypeId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(ticketType) }, "Não foi possível salvar o tipo de chamado.");
    if (!result) return false;
    setCatalog(result.catalog);
    toast.success("Tipo de chamado atualizado.");
    return true;
  }

  async function toggleTicketType(ticketTypeId, active) {
    const result = await requestJson("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketTypeId, active }) }, "Não foi possível alterar o tipo.");
    if (!result) return;
    setCatalog((current) => current.map((type) => type.id === ticketTypeId ? { ...type, active } : type));
    toast.success(active ? "Tipo ativado." : "Tipo desativado.");
  }

  async function createUser(user) {
    const result = await requestJson("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(user) }, "Não foi possível criar o usuário.");
    if (!result) return false;
    setUsers(result.users);
    // Senha temporária vai para um diálogo (com copiar), não para um toast que some.
    setCreatedCredential({ name: user.name, password: result.temporaryPassword });
    toast.success("Usuário criado.");
    return true;
  }

  async function saveUser(userId, user) {
    const result = await requestJson(`/api/users/${userId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(user) }, "Não foi possível salvar o usuário.");
    if (!result) return false;
    setUsers(result.users);
    toast.success("Usuário atualizado.");
    return true;
  }

  async function toggleUser(userId, active) {
    const result = await requestJson(`/api/users/${userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active }) }, "Não foi possível alterar o usuário.");
    if (!result) return false;
    setUsers(result.users);
    toast.success(active ? "Usuário ativado." : "Usuário desativado.");
    return true;
  }

  async function deleteUser(userId) {
    const result = await requestJson(`/api/users/${userId}`, { method: "DELETE" }, "Não foi possível excluir o usuário.");
    if (!result) return false;
    setUsers(result.users);
    toast.success("Usuário excluído.");
    return true;
  }

  async function resetUserPassword(userId) {
    const result = await requestJson(`/api/users/${userId}/reset-password`, { method: "POST" }, "Não foi possível resetar a senha.");
    if (!result) return null;
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, passwordResetRequired: true } : user));
    return result;
  }

  async function createBranch(branch) {
    const result = await requestJson("/api/branches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(branch) }, "Não foi possível criar a unidade.");
    if (!result) return false;
    setBranches(result.branches);
    await loadData();
    toast.success("Unidade criada.");
    return true;
  }

  async function saveBranch(branchId, branch) {
    const result = await requestJson(`/api/branches/${branchId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(branch) }, "Não foi possível salvar a unidade.");
    if (!result) return false;
    setBranches(result.branches);
    await loadData();
    toast.success("Unidade atualizada.");
    return true;
  }

  async function deleteBranch(deletedBranchId) {
    const result = await requestJson(`/api/branches/${deletedBranchId}`, { method: "DELETE" }, "Não foi possível excluir a unidade.");
    if (!result) return false;
    setBranches(result.branches);
    if (branchId === deletedBranchId) setBranchId("");
    await loadData();
    toast.success("Unidade excluída.");
    return true;
  }

  async function saveSettings(nextSettings) {
    const result = await requestJson("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(nextSettings) }, "Não foi possível salvar as configurações.");
    if (!result) return;
    setSettings(result.settings || nextSettings);
    await loadData();
    toast.success("Configurações salvas.");
  }

  async function openTicket(ticket) {
    setSelectedTicket(ticket);
    setTicketDetails(null);
    setView("details");
    await loadTicketDetails(ticket.id);
  }

  function openAsset(asset) {
    setSelectedAsset(asset);
    setView("asset-detail");
  }

  const openTicketById = useCallback((ticketId) => {
    if (!ticketId) return;
    setSelectedTicket({ id: ticketId });
    setTicketDetails(null);
    setView("details");
    loadTicketDetails(ticketId);
  }, [loadTicketDetails]);

  useEffect(() => {
    function handleOpenTicket(event) {
      const id = event.detail?.id;
      if (id) openTicketById(id);
    }
    window.addEventListener("nexus:open-ticket", handleOpenTicket);
    return () => window.removeEventListener("nexus:open-ticket", handleOpenTicket);
  }, [openTicketById]);

  // Deep-linking do chamado: reflete o chamado aberto na URL (?ticket=ID) usando replaceState
  // (não polui o histórico). Permite recarregar sem perder o contexto e abrir em nova aba.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    // Não mexe na URL antes do restore tentar ler o ?ticket da carga inicial (senão o apagaria).
    if (!deepLinkRestored.current) return;
    const openId = view === "details" ? (selectedTicket?.id || ticketDetails?.ticket?.id || null) : null;
    const desired = openId ? `?ticket=${openId}` : "";
    if (window.location.search !== desired) {
      window.history.replaceState({}, "", `${window.location.pathname}${desired}`);
    }
  }, [authStatus, view, selectedTicket, ticketDetails]);

  // Restaura o chamado da URL na primeira carga de dados (ex.: reload com ?ticket=ID).
  useEffect(() => {
    if (authStatus !== "authenticated" || !data || deepLinkRestored.current) return;
    deepLinkRestored.current = true;
    const ticketId = new URLSearchParams(window.location.search).get("ticket");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ticketId) openTicketById(ticketId);
  }, [authStatus, data, openTicketById]);

  async function patchTicket(ticketId, payload) {
    const result = await requestJson(`/api/tickets/${ticketId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, "Não foi possível atualizar o chamado.");
    if (!result) return false;
    await Promise.all([loadTicketDetails(ticketId), loadData()]);
    setSelectedTicket((current) => current?.id === ticketId ? { ...current, ...payload } : current);
    return true;
  }

  async function assumeTicket(ticketId) {
    const ok = await patchTicket(ticketId, { assume: true });
    if (ok) toast.success("Chamado assumido.");
    return ok;
  }

  // Ações em massa: reaplica o PATCH por chamado (mantém SLA/eventos/notificações) e recarrega a fila uma vez.
  async function bulkPatchTickets(ids, payload) {
    if (!ids?.length) return null;
    let ok = 0;
    await Promise.all(ids.map(async (id) => {
      const response = await fetch(`/api/tickets/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!await handleProtectedResponse(response)) return;
      if (response.ok) ok += 1;
    }));
    await loadData();
    return { ok, total: ids.length };
  }

  async function changeStatus(status, ticketId, options = {}) {
    const id = ticketId || selectedTicket?.id || ticketDetails?.ticket?.id;
    if (!id) return false;

    const resolving = terminalStatusCodes.includes(status) || ticketStatuses.find((item) => item.code === status)?.is_terminal;
    if (resolving) {
      const resolutionMessage = options.resolutionMessage;
      if (isRichTextEmpty(resolutionMessage)) {
        toast.error("Informe a descrição da resolução para o cliente.");
        return false;
      }
      const messageOk = await requestJson(
        `/api/tickets/${id}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: resolutionMessage, visibility: "PUBLIC", messageType: "RESOLUTION" }),
        },
        "Não foi possível registrar a resolução para o cliente."
      );
      if (!messageOk) return false;
    }

    const payload = { status };
    if (resolving && options.stockDeductions?.length) payload.stockDeductions = options.stockDeductions;
    const ok = await patchTicket(id, payload);
    if (ok) toast.success(resolving ? "Chamado resolvido." : "Situação atualizada.");
    return ok;
  }

  function openRemoteSession(result) {
    if (result?.mode === "nexus-webrtc" && result.sessionId) {
      setRemoteSession({
        sessionId: result.sessionId,
        hostname: result.hostname,
      });
    }
  }

  async function remoteAccess(ticketId) {
    const result = await requestJson(`/api/tickets/${ticketId}/remote`, { method: "POST" }, "Não foi possível iniciar o acesso remoto.");
    openRemoteSession(result);
    return result;
  }

  async function assetRemoteAccess(assetId) {
    const result = await requestJson(`/api/assets/${assetId}/remote`, { method: "POST" }, "Não foi possível iniciar o acesso remoto.");
    openRemoteSession(result);
    return result;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    resetApplication();
    setSessionUser(null);
    setAuthStatus("unauthenticated");
  }

  function closeUserForm() {
    setUserEditId(null);
    setView("users");
  }

  function closeBranchForm() {
    setBranchEditId(null);
    setView("settings-branches");
  }

  function closeTeamForm() {
    setTeamEditId(null);
    setView("teams");
  }

  function closeDraftForm(returnView) {
    setFormDraft(null);
    setView(returnView);
    refreshLists();
  }

  if (authStatus === "loading") return <div className="app-container space-y-5 py-8"><Skeleton className="h-16 w-full" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton className="h-28" key={index} />)}</div><Skeleton className="h-[420px]" /></div>;
  if (authStatus === "unauthenticated") return <AuthView onAuthenticated={(result) => result.passwordChangeRequired ? (setSessionUser(result.user), setAuthStatus("change-password")) : loadSession()} />;
  if (authStatus === "change-password") return <AuthView mode="change-password" user={sessionUser} onPasswordChanged={loadSession} />;
  if (!data) return <div className="app-container space-y-5 py-8"><Skeleton className="h-16 w-full" /><Skeleton className="h-[620px]" /></div>;

  // Checagem granular de permissão por tela/ação, a partir da matriz do perfil (GLPI-like).
  const can = (module, action = "read") => Boolean(data.permissionMap?.[module]?.[action]);

  const themeStyle = {
    "--primary": data.currentUser.primaryColor || "#102033",
    "--primary-foreground": "#ffffff",
    "--secondary": data.currentUser.secondaryColor || "#bff2e6",
    "--secondary-foreground": "#102033",
  };
  const isSidebar = data.currentUser.navigationMode === "SIDEBAR";
  const mainClassName = isSidebar ? "px-4 py-6 md:px-6 md:py-8 lg:ml-60 lg:px-6" : "app-container py-6 md:py-8";

  if (data.currentUser.role === "EMPLOYEE") {
    const employeeViews = ["new-ticket", "my-tickets", "details", "knowledge", "knowledge-detail"];
    const safeView = employeeViews.includes(view) ? view : "new-ticket";

    return <div className="min-h-screen" style={themeStyle}>
      <EmployeePortalNavbar view={safeView} setView={setView} currentUser={data.currentUser} onLogout={logout} />
      <main className={mainClassName}>
        {safeView === "my-tickets" && (
          // O agente já abre os chamados de incidente automaticamente — sem alerta de saúde aqui.
          <MyTicketsView
            tickets={data.tickets}
            onOpenTicket={openTicket}
            onNewTicket={() => setView("new-ticket")}
          />
        )}
        {safeView === "knowledge" && (
          <KnowledgeView
            key={listRefreshKey}
            permissions={data.permissions}
            onOpen={(item) => { setFormDraft(item); setView("knowledge-detail"); }}
          />
        )}
        {safeView === "knowledge-detail" && formDraft && (
          <KnowledgeDetailView item={formDraft} permissions={data.permissions} onBack={() => setView("knowledge")} onNewTicket={() => setView("new-ticket")} />
        )}
        {safeView === "new-ticket" && (
          <TicketCreateView
            key={createKey}
            branches={data.branches}
            assets={data.assets}
            defaultBranchId={data.currentUser.branchId}
            onCreate={createTicket}
            onCancel={() => setView("my-tickets")}
            currentUser={data.currentUser}
            permissions={data.permissions}
            catalog={catalog}
            ticketStatuses={ticketStatuses}
          />
        )}
        {safeView === "details" && (
          <TicketDetails
            details={ticketDetails}
            users={[]}
            currentUser={data.currentUser}
            ticketStatuses={ticketStatuses}
            terminalStatusCode={terminalStatusCode}
            onBack={() => setView("my-tickets")}
            onStatusChange={changeStatus}
            onRemoteAccess={remoteAccess}
            onPatchTicket={patchTicket}
            onAssumeTicket={assumeTicket}
            onReload={() => {
              const id = selectedTicket?.id || ticketDetails?.ticket?.id;
              if (id) loadTicketDetails(id);
            }}
          />
        )}
      </main>
    </div>;
  }

  return <div className="min-h-screen" style={themeStyle}>
    <CommandPalette can={can} permissions={data.permissions} setView={setView} onNewTicket={() => setView("new-ticket")} />
    <AppNavbar view={view} setView={setView} ticketCount={activeTickets.length} branches={data.branches} branchId={branchId} setBranchId={setBranchId} onNewTicket={() => setView("new-ticket")} currentUser={data.currentUser} permissions={data.permissions} can={can} onLogout={logout} />
    <main className={mainClassName}>
      {view === "dashboard" && <DashboardView data={data} currentUser={data.currentUser} openTicket={openTicket} onNavigate={setView} onNavigateQueue={goToTicketsQueue} onNewTicket={() => setView("new-ticket")} />}
      {view === "tickets" && can("tickets", "read") && <TicketsView tickets={data.tickets} catalog={catalog} users={users} currentUser={data.currentUser} permissions={data.permissions} ticketStatuses={ticketStatuses} terminalStatusCode={terminalStatusCode} initialQueue={ticketsQueue} onQueueApplied={() => setTicketsQueue(null)} onOpenTicket={openTicket} onRemoteAccess={remoteAccess} onStatusChange={changeStatus} onAssumeTicket={assumeTicket} onBulkPatch={bulkPatchTickets} />}
      {view === "assets" && data.permissions.canViewAssets && <AssetsView assets={data.assets} allAssets={data.assets} networkDevices={data.networkDevices || []} tickets={data.tickets} permissions={data.permissions} onNewTicket={() => setView("new-ticket")} onRemoteAccess={remoteAccess} onRemoteAsset={assetRemoteAccess} onOpenTicket={openTicket} onImported={loadData} onOpenMonitoring={() => setView("network")} onOpenAsset={openAsset} />}
      {view === "asset-detail" && data.permissions.canViewAssets && <AssetDetailView asset={data.assets.find((item) => item.id === selectedAsset?.id) || selectedAsset} tickets={data.tickets} permissions={data.permissions} onBack={() => setView("assets")} onRemoteAsset={assetRemoteAccess} onNewTicket={() => setView("new-ticket")} onOpenTicket={openTicket} onReload={loadData} />}
      {view === "documentation" && can("documentation", "read") && <DocumentationView key={listRefreshKey} branches={data.branches} branchId={branchId} permissions={data.permissions} onNew={() => { setFormDraft(null); setView("documentation-form"); }} onEdit={(item) => { setFormDraft(item); setView("documentation-form"); }} onOpen={(item) => { setFormDraft(item); setView("documentation-detail"); }} />}
      {view === "documentation-form" && <DocumentationFormView item={formDraft} branches={data.branches} permissions={data.permissions} onCancel={() => closeDraftForm("documentation")} onSaved={refreshLists} />}
      {view === "documentation-detail" && formDraft && <DocumentationDetailView item={formDraft} permissions={data.permissions} onBack={() => closeDraftForm("documentation")} onEdit={(item) => { setFormDraft(item); setView("documentation-form"); }} onDeleted={refreshLists} onSaved={refreshLists} />}
      {view === "knowledge" && can("knowledge", "read") && <KnowledgeView key={listRefreshKey} permissions={data.permissions} onNew={() => { setFormDraft(null); setView("knowledge-form"); }} onEdit={(item) => { setFormDraft(item); setView("knowledge-form"); }} onOpen={(item) => { setFormDraft(item); setView("knowledge-detail"); }} />}
      {view === "knowledge-form" && <KnowledgeFormView item={formDraft} branches={data.branches} permissions={data.permissions} onCancel={() => closeDraftForm("knowledge")} onSaved={refreshLists} />}
      {view === "knowledge-detail" && formDraft && <KnowledgeDetailView item={formDraft} permissions={data.permissions} onBack={() => closeDraftForm("knowledge")} onEdit={(item) => { setFormDraft(item); setView("knowledge-form"); }} onDeleted={refreshLists} onSaved={refreshLists} />}
      {view === "terms" && can("terms", "read") && <TermsView key={listRefreshKey} permissions={data.permissions} onNew={() => setView("terms-form")} onOpen={(item) => { setFormDraft(item); setView("terms-detail"); }} />}
      {view === "terms-form" && <TermFormView assets={data.assets} users={users} onCancel={() => closeDraftForm("terms")} onSigned={refreshLists} />}
      {view === "terms-detail" && formDraft && <TermDetailView item={formDraft} permissions={data.permissions} onBack={() => closeDraftForm("terms")} onDeleted={refreshLists} />}
      {view === "printers" && can("printers", "read") && <PrintersView branches={data.branches} branchId={branchId} defaultBranchId={branchId || data.currentUser.branchId} permissions={data.permissions} />}
      {view === "network" && can("network", "read") && <NetworkView key={listRefreshKey} permissions={data.permissions} branchId={branchId} onNew={() => { setFormDraft(null); setView("network-form"); }} onEdit={(item) => { setFormDraft(item); setView("network-form"); }} />}
      {view === "network-form" && <NetworkFormView item={formDraft} branches={data.branches} permissions={data.permissions} onCancel={() => closeDraftForm("network")} onSaved={refreshLists} />}
      {view === "security" && can("security", "read") && <SecurityView permissions={data.permissions} onOpenTicket={openTicketById} />}
      {view === "details" && <TicketDetails details={ticketDetails} users={users} assets={data.assets} currentUser={data.currentUser} ticketStatuses={ticketStatuses} terminalStatusCode={terminalStatusCode} onBack={() => setView("tickets")} onStatusChange={changeStatus} onRemoteAccess={remoteAccess} onPatchTicket={patchTicket} onAssumeTicket={assumeTicket} onReload={() => { const id = selectedTicket?.id || ticketDetails?.ticket?.id; if (id) loadTicketDetails(id); }} />}
      {view === "users" && can("users", "read") && <UsersView users={users} currentUserId={data.currentUser.id} createdCredential={createdCredential} onAckCredential={() => setCreatedCredential(null)} onNew={() => { setUserEditId(null); setView("users-form"); }} onEdit={(id) => { setUserEditId(id); setView("users-form"); }} onToggle={toggleUser} onDelete={deleteUser} onResetPassword={resetUserPassword} />}
      {view === "users-form" && can("users", "read") && <UserFormView userId={userEditId} users={users} branches={data.branches} assets={data.assets} profiles={profiles} onCreate={createUser} onSave={saveUser} onCancel={closeUserForm} />}
      {view === "profiles" && can("profiles", "read") && <ProfilesView can={can} onProfilesChanged={setProfiles} />}
      {view === "settings" && can("settings", "read") && <SettingsGeneralView settings={settings} agentAssets={agentAssets} onSave={saveSettings} onRefreshSettings={loadData} />}
      {view === "settings-branches" && can("branches", "read") && <BranchesView branches={branches} onNew={() => { setBranchEditId(null); setView("settings-branches-form"); }} onEdit={(id) => { setBranchEditId(id); setView("settings-branches-form"); }} onDelete={deleteBranch} />}
      {view === "settings-branches-form" && (can("branches", "create") || can("branches", "update")) && <BranchFormView branchId={branchEditId} branches={branches} onCreate={createBranch} onSave={saveBranch} onCancel={closeBranchForm} />}
      {view === "settings-types" && can("ticket_types", "read") && <SettingsTypesView catalog={catalog} onToggleType={toggleTicketType} onNew={() => { setFormDraft(null); setView("settings-types-form"); }} onEdit={(type) => { setFormDraft(type); setView("settings-types-form"); }} onConfigureWorkflow={(type) => { setFormDraft(type); setView("settings-types-workflow"); }} />}
      {view === "settings-types-form" && (can("ticket_types", "create") || can("ticket_types", "update")) && <CatalogTypeFormView ticketType={formDraft} branches={branches.length ? branches : data.branches} users={users} onCreateType={createTicketType} onSaveType={saveTicketType} onCancel={() => closeDraftForm("settings-types")} />}
      {view === "settings-types-workflow" && can("ticket_types", "update") && formDraft && <CatalogTypeWorkflowView ticketType={formDraft} users={users} termTemplates={termTemplates} onCancel={() => closeDraftForm("settings-types")} onSaved={refreshLists} />}
      {view === "settings-statuses" && can("statuses", "read") && <SettingsStatusesView />}
      {view === "settings-categories" && can("categories", "read") && <SettingsCategoriesView />}
      {view === "settings-locations" && can("locations", "read") && <SettingsLocationsView branches={branches.length ? branches : data.branches} />}
      {view === "inventory" && can("inventory", "read") && <InventoryView key={`inventory-${branchId}`} branches={branches.length ? branches : data.branches} defaultBranchId={branchId} canConfigure={can("inventory", "create") || can("inventory", "update")} />}
      {view === "new-ticket" && <TicketCreateView branches={data.branches} assets={data.assets} users={users} defaultBranchId={branchId || data.currentUser.branchId} onCreate={createTicket} onCancel={() => setView("tickets")} currentUser={data.currentUser} permissions={data.permissions} catalog={catalog} />}
      {view === "teams" && can("teams", "read") && <TeamsView key={`${listRefreshKey}-${branchId}`} branchId={branchId} canConfigure={can("teams", "create") || can("teams", "update")} onNew={() => { setTeamEditId(null); setView("teams-form"); }} onEdit={(id) => { setTeamEditId(id); setView("teams-form"); }} />}
      {view === "teams-form" && (can("teams", "create") || can("teams", "update")) && <TeamFormView teamId={teamEditId} branches={branches.length ? branches : data.branches} users={users} onCancel={closeTeamForm} onSaved={refreshLists} />}
      {view === "problems" && can("problems", "read") && <ProblemsView key={`${listRefreshKey}-${branchId}`} branchId={branchId} onNew={() => { setFormDraft(null); setView("problems-form"); }} onEdit={(item) => { setFormDraft(item); setView("problems-form"); }} />}
      {view === "problems-form" && (can("problems", "create") || can("problems", "update")) && <ProblemFormView item={formDraft} branches={data.branches} defaultBranchId={branchId || data.currentUser.branchId} users={users} onCancel={() => closeDraftForm("problems")} onSaved={refreshLists} />}
      {view === "changes" && can("changes", "read") && <ChangesView key={`${listRefreshKey}-${branchId}`} branchId={branchId} onNew={() => { setFormDraft(null); setView("changes-form"); }} onEdit={(item) => { setFormDraft(item); setView("changes-form"); }} />}
      {view === "changes-form" && (can("changes", "create") || can("changes", "update")) && <ChangeFormView item={formDraft} branches={data.branches} defaultBranchId={branchId || data.currentUser.branchId} users={users} onCancel={() => closeDraftForm("changes")} onSaved={refreshLists} />}
      {view === "reports" && data.permissions.canViewReports && <ReportsView branchId={branchId} branches={data.branches} />}
      {view === "audit" && data.permissions.canViewAudit && <AuditView key={`${listRefreshKey}-${branchId}`} branchId={branchId} branches={data.branches} />}
      {view === "webhooks" && can("webhooks", "read") && <WebhooksView key={listRefreshKey} onNew={() => { setFormDraft(null); setView("webhooks-form"); }} onEdit={(hook) => { setFormDraft(hook); setView("webhooks-form"); }} />}
      {view === "automations" && data.permissions.canConfigure && <AutomationsView key={listRefreshKey} />}
      {view === "webhooks-form" && (can("webhooks", "create") || can("webhooks", "update")) && <WebhookFormView hook={formDraft} onCancel={() => closeDraftForm("webhooks")} onSaved={refreshLists} />}
      {view === "term-templates" && can("term_templates", "read") && <TermTemplatesView key={listRefreshKey} onNew={() => { setFormDraft(null); setView("term-templates-form"); }} onEdit={(item) => { setFormDraft(item); setView("term-templates-form"); }} onOpen={(item) => { setFormDraft(item); setView("term-templates-detail"); }} />}
      {view === "term-templates-form" && (can("term_templates", "create") || can("term_templates", "update")) && <TermTemplateFormView item={formDraft} onCancel={() => closeDraftForm("term-templates")} onSaved={refreshLists} />}
      {view === "term-templates-detail" && formDraft && can("term_templates", "read") && <TermTemplateDetailView item={formDraft} permissions={data.permissions} onBack={() => closeDraftForm("term-templates")} onEdit={(item) => { setFormDraft(item); setView("term-templates-form"); }} onDeleted={refreshLists} onSaved={refreshLists} />}
      {remoteSession && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-5xl p-3 md:bottom-4 md:px-6">
          <RemoteConsoleEmbed
            sessionId={remoteSession.sessionId}
            hostname={remoteSession.hostname}
            onClose={() => setRemoteSession(null)}
          />
        </div>
      )}
    </main>
  </div>;
}
