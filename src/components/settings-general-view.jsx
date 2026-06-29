"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Bot,
  Building2,
  Clock3,
  Copy,
  Download,
  HardDriveDownload,
  Image as ImageIcon,
  KeyRound,
  LayoutPanelTop,
  Monitor,
  Package,
  PanelLeft,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Settings,
  SlidersHorizontal,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { ListLoadingSkeleton } from "@/components/list-loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AGENT_VERSION = "1.2.7";

const DEFAULT_SLA_POLICY = {
  CRITICA: { firstResponseMinutes: 15, resolutionHours: 2 },
  ALTA: { firstResponseMinutes: 30, resolutionHours: 4 },
  MEDIA: { firstResponseMinutes: 60, resolutionHours: 8 },
  BAIXA: { firstResponseMinutes: 240, resolutionHours: 16 },
};
const SLA_PRIORITIES = [
  { code: "CRITICA", label: "Crítica", dot: "bg-destructive" },
  { code: "ALTA", label: "Alta", dot: "bg-destructive/70" },
  { code: "MEDIA", label: "Média", dot: "bg-primary" },
  { code: "BAIXA", label: "Baixa", dot: "bg-muted-foreground" },
];

// Progressive disclosure: a config geral é dividida em abas para não assustar
// (padrão Atlassian/ServiceNow) — uma seção por vez em vez de uma página longa.
const SETTINGS_TABS = [
  { id: "marca", label: "Marca" },
  { id: "sla", label: "SLA & horário" },
  { id: "sistema", label: "Sistema" },
  { id: "agente", label: "Agente Windows" },
];

async function downloadFile(url, filename) {
  const response = await fetch(url, { credentials: "include" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const result = contentType.includes("json") ? await response.json().catch(() => ({})) : {};
    throw new Error(result.error || `Não foi possível baixar (${response.status}).`);
  }
  if (contentType.includes("zip")) {
    throw new Error("Recebeu ZIP em vez do instalador EXE. Tente novamente.");
  }
  if (contentType.includes("json")) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "Resposta inválida do servidor.");
  }
  const blob = await response.blob();
  if (!blob.size) throw new Error("Arquivo vazio. Tente novamente.");
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
  const saveAs = match?.[1] || filename;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = saveAs;
  link.click();
  URL.revokeObjectURL(link.href);
  return saveAs;
}

function ToggleCard({ active, icon: Icon, title, description, onClick }) {
  return (
    <Button type="button" variant="outline" className="h-auto justify-start gap-4 p-4 text-left" onClick={onClick}>
      <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-xs font-normal text-muted-foreground">{description}</p>
      </div>
      <Badge variant={active ? "success" : "muted"}>{active ? "Ativo" : "Desativado"}</Badge>
    </Button>
  );
}

export function SettingsGeneralView({ settings, onSave }) {
  const [organizationName, setOrganizationName] = useState(() => settings?.organizationName || "");
  const [appName, setAppName] = useState(() => settings?.appName || "FunevDesk");
  const [logoUrl, setLogoUrl] = useState(() => settings?.logoUrl || "");
  const [primaryColor, setPrimaryColor] = useState(() => settings?.primaryColor || "#102033");
  const [secondaryColor, setSecondaryColor] = useState(() => settings?.secondaryColor || "#bff2e6");
  const [navigationMode, setNavigationMode] = useState(() => settings?.navigationMode || "NAVBAR");
  const [slaHours, setSlaHours] = useState(() => String(settings?.slaHours || 8));
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState(() => settings?.remoteAccessEnabled ?? true);
  const [automaticTicketsEnabled, setAutomaticTicketsEnabled] = useState(() => settings?.automaticTicketsEnabled ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => settings?.notificationsEnabled ?? true);
  const [escalationEnabled, setEscalationEnabled] = useState(() => settings?.escalationEnabled ?? true);
  const [businessStart, setBusinessStart] = useState(() => settings?.businessHours?.start || "08:00");
  const [businessEnd, setBusinessEnd] = useState(() => settings?.businessHours?.end || "18:00");
  const [slaPolicy, setSlaPolicy] = useState(() => settings?.slaPolicy || DEFAULT_SLA_POLICY);
  const [downloading, setDownloading] = useState("");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [softwarePackages, setSoftwarePackages] = useState([]);
  const [swName, setSwName] = useState("");
  const [swId, setSwId] = useState("");
  const [swBusy, setSwBusy] = useState(false);
  const [tab, setTab] = useState("marca");
  const logoInputRef = useRef(null);

  // Detecção de alterações não salvas: compara o formulário em memória com o
  // `settings` carregado. Considera apenas os campos que o botão "Salvar" persiste.
  const isDirty =
    organizationName !== (settings?.organizationName || "") ||
    appName !== (settings?.appName || "FunevDesk") ||
    logoUrl !== (settings?.logoUrl || "") ||
    primaryColor !== (settings?.primaryColor || "#102033") ||
    secondaryColor !== (settings?.secondaryColor || "#bff2e6") ||
    navigationMode !== (settings?.navigationMode || "NAVBAR") ||
    Number(slaHours) !== Number(settings?.slaHours || 8) ||
    remoteAccessEnabled !== (settings?.remoteAccessEnabled ?? true) ||
    automaticTicketsEnabled !== (settings?.automaticTicketsEnabled ?? true) ||
    notificationsEnabled !== (settings?.notificationsEnabled ?? true) ||
    escalationEnabled !== (settings?.escalationEnabled ?? true) ||
    businessStart !== (settings?.businessHours?.start || "08:00") ||
    businessEnd !== (settings?.businessHours?.end || "18:00") ||
    JSON.stringify(slaPolicy) !== JSON.stringify(settings?.slaPolicy || DEFAULT_SLA_POLICY);

  // Avisa ao sair da página com alterações pendentes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Catálogo de software (apps que aparecem no diálogo de instalação dos ativos).
  useEffect(() => {
    fetch("/api/software", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { packages: [] }))
      .then((data) => setSoftwarePackages(data.packages || []))
      .catch(() => setSoftwarePackages([]));
  }, []);

  async function addSoftwarePackage() {
    const name = swName.trim();
    const wingetId = swId.trim();
    if (!name || !wingetId) return toast.error("Informe o nome e o ID winget do aplicativo.");
    setSwBusy(true);
    try {
      const response = await fetch("/api/software", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, wingetId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível adicionar o aplicativo.");
      setSoftwarePackages(result.packages || []);
      setSwName("");
      setSwId("");
      toast.success("Aplicativo adicionado ao catálogo.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSwBusy(false);
    }
  }

  async function removeSoftwarePackage(id) {
    setSwBusy(true);
    try {
      const response = await fetch(`/api/software/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Não foi possível remover o aplicativo.");
      setSoftwarePackages(result.packages || []);
      toast.success("Aplicativo removido do catálogo.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSwBusy(false);
    }
  }

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "";

  if (!settings) {
    return (
      <div className="space-y-5 pb-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3.5">
              <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Settings className="size-5" /></span>
              <div>
                <h1 className="page-title text-[26px]">Configurações gerais</h1>
                <p className="page-copy max-w-md">Organização, marca, SLA, notificações e agente.</p>
              </div>
            </div>
          </div>
        </div>
        <ListLoadingSkeleton />
      </div>
    );
  }

  async function uploadLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem PNG, JPG, WEBP ou GIF.");
    const formData = new FormData();
    formData.append("arquivo", file);
    const response = await fetch("/api/uploads", { method: "POST", body: formData });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return toast.error(result.error || "Não foi possível enviar a logo.");
    setLogoUrl(result.publicUrl);
    toast.success("Logo enviada. Clique em salvar para aplicar.");
  }

  async function handleDownload(type, filename) {
    setDownloading(type);
    const slowBuild = ["exe", "gpo-msi"].includes(type);
    if (slowBuild) toast.info(`Preparando instalador v${AGENT_VERSION} (até 1 minuto)…`);
    try {
      // O download gera automaticamente a chave de enrollment e a embute no instalador,
      // dispensando a cópia manual de tokens. O servidor guarda apenas o hash da chave.
      const keyResponse = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerateAgentEnrollmentKey: true }),
      });
      const keyResult = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyResult.agentEnrollmentKey) {
        throw new Error(keyResult.error || "Não foi possível gerar a chave de enrollment.");
      }
      const params = new URLSearchParams({ type, serverUrl, enrollmentKey: keyResult.agentEnrollmentKey });
      const savedAs = await downloadFile(`/api/agent/download?${params}`, filename);
      const version = savedAs.includes(AGENT_VERSION) ? `v${AGENT_VERSION}` : "";
      toast.success(version ? `Instalador ${version} baixado. Execute como Administrador.` : "Download concluído.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setDownloading("");
    }
  }

  // Gera/rotaciona a chave de enrollment manualmente (caso precise instalar o agente por
  // outro meio que não os downloads acima). Gerar uma nova invalida a anterior. O servidor
  // guarda só o hash — a chave em texto puro aparece UMA vez, aqui.
  async function regenerateEnrollmentKey() {
    setGeneratingKey(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ regenerateAgentEnrollmentKey: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.agentEnrollmentKey) {
        throw new Error(result.error || "Não foi possível gerar a chave de enrollment.");
      }
      setEnrollmentKey(result.agentEnrollmentKey);
      toast.success("Nova chave gerada. Copie agora — ela não será exibida novamente.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setGeneratingKey(false);
    }
  }

  function save() {
    onSave({
      organizationName,
      appName,
      logoUrl,
      primaryColor,
      secondaryColor,
      navigationMode,
      slaHours: Number(slaHours),
      remoteAccessEnabled,
      automaticTicketsEnabled,
      notificationsEnabled,
      escalationEnabled,
      businessHours: { start: businessStart, end: businessEnd, days: [1, 2, 3, 4, 5] },
      slaPolicy,
    });
  }

  function updatePolicy(code, field, value) {
    const numeric = Math.max(1, Math.round(Number(value) || 0));
    setSlaPolicy((prev) => ({ ...prev, [code]: { ...prev[code], [field]: numeric } }));
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Settings className="size-5" /></span>
            <div>
              <h1 className="page-title text-[26px]">Configurações gerais</h1>
              <p className="page-copy max-w-md">Organização, aparência, SLA, notificações e agente Windows.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-xl bg-muted/40 p-1">
            {SETTINGS_TABS.map((item) => (
              <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>
            ))}
          </div>
          {tab === "marca" && (<>
          <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="size-[18px]" /></span>
                <CardTitle className="text-[15px]">Organização e marca</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-1 sm:grid-cols-2">
              <div><Label htmlFor="settings-organization-name" className="mb-2 block">Nome da organização</Label><Input id="settings-organization-name" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></div>
              <div><Label htmlFor="settings-app-name" className="mb-2 block">Nome do sistema</Label><Input id="settings-app-name" value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="Ex.: Helpdesk" /></div>
              <div className="sm:col-span-2">
                <Label htmlFor="settings-logo-url" className="mb-2 block">Logo do sistema</Label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border bg-transparent">
                    {logoUrl ? <img src={logoUrl} alt="Logo do sistema" className="h-full w-full object-contain" /> : <ImageIcon className="size-6 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input id="settings-logo-url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="/uploads/logo.png ou https://..." />
                    <div className="flex gap-2">
                      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadLogo} />
                      <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}><ImageIcon className="size-4" /> Escolher imagem</Button>
                      {logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setLogoUrl("")}>Remover</Button>}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutPanelTop className="size-[18px]" /></span>
                <div className="min-w-0">
                  <CardTitle className="text-[15px]">Aparência</CardTitle>
                  <CardDescription>Cores e navegação usadas em todo o sistema.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-1 sm:grid-cols-2">
              <div><Label htmlFor="settings-primary-color" className="mb-2 block">Cor primária</Label><div className="flex gap-2"><Input type="color" aria-label="Cor primária (seletor)" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="h-10 w-14 p-1" /><Input id="settings-primary-color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} className="font-mono text-xs" /></div></div>
              <div><Label htmlFor="settings-secondary-color" className="mb-2 block">Cor secundária</Label><div className="flex gap-2"><Input type="color" aria-label="Cor secundária (seletor)" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} className="h-10 w-14 p-1" /><Input id="settings-secondary-color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} className="font-mono text-xs" /></div></div>
              <div className="sm:col-span-2">
                <p className="mb-2 text-sm font-medium">Navegação</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant={navigationMode === "NAVBAR" ? "secondary" : "outline"} className="justify-start" onClick={() => setNavigationMode("NAVBAR")}><LayoutPanelTop /> Navbar superior</Button>
                  <Button type="button" variant={navigationMode === "SIDEBAR" ? "secondary" : "outline"} className="justify-start" onClick={() => setNavigationMode("SIDEBAR")}><PanelLeft /> Sidebar lateral</Button>
                </div>
              </div>
            </CardContent>
          </Card>
          </>)}

          {tab === "sla" && (<>
          <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Clock3 className="size-[18px]" /></span>
                <div className="min-w-0">
                  <CardTitle className="text-[15px]">Horário comercial</CardTitle>
                  <CardDescription>Usado no cálculo de SLA e escalonamento.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-1 sm:grid-cols-3">
              <div><Label htmlFor="settings-sla-hours" className="mb-2 block">SLA padrão em horas</Label><Input id="settings-sla-hours" type="number" min="1" max="720" value={slaHours} onChange={(event) => setSlaHours(event.target.value)} /></div>
              <div><Label htmlFor="settings-business-start" className="mb-2 block">Início</Label><Input id="settings-business-start" type="time" value={businessStart} onChange={(event) => setBusinessStart(event.target.value)} /></div>
              <div><Label htmlFor="settings-business-end" className="mb-2 block">Fim</Label><Input id="settings-business-end" type="time" value={businessEnd} onChange={(event) => setBusinessEnd(event.target.value)} /></div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Timer className="size-[18px]" /></span>
                <div className="min-w-0">
                  <CardTitle className="text-[15px]">Metas de SLA por prioridade</CardTitle>
                  <CardDescription>Prazo de 1ª resposta e de resolução aplicados a novos chamados.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-1">
              <div className="grid grid-cols-[1fr_120px_120px] items-center gap-x-3 gap-y-2">
                <p className="text-[11px] font-medium text-muted-foreground">Prioridade</p>
                <p className="text-[11px] font-medium text-muted-foreground">1ª resposta (min)</p>
                <p className="text-[11px] font-medium text-muted-foreground">Resolução (h)</p>
                {SLA_PRIORITIES.map(({ code, label, dot }) => (
                  <div key={code} className="contents">
                    <div className="flex items-center gap-2 text-sm font-medium"><span className={`size-2 rounded-full ${dot}`} />{label}</div>
                    <Input
                      type="number"
                      min="1"
                      aria-label={`1ª resposta para prioridade ${label} em minutos`}
                      value={slaPolicy[code]?.firstResponseMinutes ?? ""}
                      onChange={(event) => updatePolicy(code, "firstResponseMinutes", event.target.value)}
                      className="h-9"
                    />
                    <Input
                      type="number"
                      min="1"
                      aria-label={`Resolução para prioridade ${label} em horas`}
                      value={slaPolicy[code]?.resolutionHours ?? ""}
                      onChange={(event) => updatePolicy(code, "resolutionHours", event.target.value)}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </>)}

          {tab === "sistema" && (
          <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="size-[18px]" /></span>
                <CardTitle className="text-[15px]">Recursos do sistema</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-1">
              <ToggleCard active={remoteAccessEnabled} icon={Monitor} title="Acesso remoto" description="Console no navegador via WebRTC — o colaborador aceita no agente." onClick={() => setRemoteAccessEnabled((value) => !value)} />
              <ToggleCard active={automaticTicketsEnabled} icon={Bot} title="Chamados automáticos" description="Alertas de CPU, memória ou disco abrem chamados." onClick={() => setAutomaticTicketsEnabled((value) => !value)} />
              <ToggleCard active={notificationsEnabled} icon={Bell} title="Notificações in-app" description="Alertas de chamados e mensagens." onClick={() => setNotificationsEnabled((value) => !value)} />
              <ToggleCard active={escalationEnabled} icon={Clock3} title="Escalonamento automático" description="Regras de SLA e filas." onClick={() => setEscalationEnabled((value) => !value)} />
            </CardContent>
          </Card>
          )}

          {tab === "agente" && (
          <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10">
            <CardHeader className="border-b">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="size-[18px]" /></span>
                <div className="min-w-0">
                  <CardTitle className="text-[15px]">Agente Windows</CardTitle>
                  <CardDescription>Telemetria, inventário, chamados e acesso remoto no navegador.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">
                Baixe o instalador e execute como Administrador na máquina. A chave de enrollment é gerada e embutida automaticamente a cada download — não é preciso copiar nenhum token.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button type="button" variant="outline" className="h-auto justify-start gap-4 p-4 text-left" disabled={downloading === "exe"} onClick={() => handleDownload("exe", `FunevDeskAgenteSetup-${AGENT_VERSION}.exe`)}><HardDriveDownload className="size-5" /><div><p className="font-medium">{downloading === "exe" ? "Gerando..." : `Instalador EXE v${AGENT_VERSION}`}</p><p className="text-xs font-normal text-muted-foreground">Agente completo — arquivo .exe, não ZIP.</p></div></Button>
                <Button type="button" variant="outline" className="h-auto justify-start gap-4 p-4 text-left" disabled={downloading === "installer"} onClick={() => handleDownload("installer", "Install-FunevDeskAgente.ps1")}><Download className="size-5" /><div><p className="font-medium">{downloading === "installer" ? "Baixando..." : "Script PowerShell"}</p><p className="text-xs font-normal text-muted-foreground">Fallback para instalação manual.</p></div></Button>
                <Button type="button" variant="outline" className="h-auto justify-start gap-4 p-4 text-left" disabled={downloading === "gpo-msi"} onClick={() => handleDownload("gpo-msi", `FunevDeskAgente-${AGENT_VERSION}.msi`)}><Package className="size-5" /><div><p className="font-medium">{downloading === "gpo-msi" ? "Gerando..." : `Pacote MSI v${AGENT_VERSION} (GPO)`}</p><p className="text-xs font-normal text-muted-foreground">Implantação por política de grupo.</p></div></Button>
              </div>

              <div className="space-y-3 rounded-xl border border-dashed p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="size-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Chave de enrollment</p>
                    <p className="text-xs text-muted-foreground">Já é embutida automaticamente nos downloads acima. Gere manualmente só se precisar instalar o agente por outro meio. Gerar uma nova invalida a anterior.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Chave atual:</span>
                  <code className="rounded bg-muted px-2 py-1 font-mono">{settings.agentEnrollmentKeyPrefix || "nenhuma gerada"}</code>
                </div>
                {enrollmentKey && (
                  <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/40">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Copie agora — esta chave não será exibida novamente.</p>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={enrollmentKey} className="font-mono text-xs" onFocus={(event) => event.target.select()} />
                      <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard?.writeText(enrollmentKey); toast.success("Chave copiada."); }}><Copy className="size-4" /></Button>
                    </div>
                  </div>
                )}
                <Button type="button" variant="outline" disabled={generatingKey} onClick={regenerateEnrollmentKey}><RefreshCw className="size-4" /> {generatingKey ? "Gerando..." : "Gerar nova chave"}</Button>
              </div>

              <div className="space-y-3 rounded-xl border border-dashed p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="size-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Catálogo de software</p>
                    <p className="text-xs text-muted-foreground">Apps que aparecem para instalar nos ativos. Cadastre os que sua empresa usa (nome + ID winget).</p>
                  </div>
                </div>
                {softwarePackages.length > 0 ? (
                  <div className="space-y-1">
                    {softwarePackages.map((pkg) => (
                      <div key={pkg.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
                        <Package className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-medium">{pkg.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{pkg.wingetId}</span>
                        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground hover:text-destructive" disabled={swBusy} onClick={() => removeSoftwarePackage(pkg.id)} aria-label={`Remover ${pkg.name}`}><Trash2 className="size-4" /></Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">Catálogo vazio. Adicione abaixo os aplicativos que poderão ser instalados nos equipamentos.</p>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Input value={swName} onChange={(event) => setSwName(event.target.value)} placeholder="Nome (ex.: Google Chrome)" disabled={swBusy} />
                  <Input value={swId} onChange={(event) => setSwId(event.target.value)} placeholder="ID winget (ex.: Google.Chrome)" disabled={swBusy} onKeyDown={(event) => { if (event.key === "Enter") addSoftwarePackage(); }} />
                  <Button type="button" variant="outline" disabled={swBusy || !swName.trim() || !swId.trim()} onClick={addSoftwarePackage}><Plus className="size-4" /> Adicionar</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">O ID winget é o identificador exato do pacote (ex.: <span className="font-mono">Google.Chrome</span>). Encontre com <span className="font-mono">winget search</span> no Windows.</p>
              </div>
            </CardContent>
          </Card>
          )}

        </div>

        <Card className="rounded-2xl border-0 shadow-none ring-1 ring-foreground/10 xl:sticky xl:top-24">
          <CardHeader className="border-b">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><SlidersHorizontal className="size-[18px]" /></span>
              <CardTitle className="text-[15px]">Resumo</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-1">
            <div className="flex gap-3"><Clock3 className="size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">SLA padrão</p><p className="font-medium">{slaHours || 0} horas · {businessStart}-{businessEnd}</p></div></div>
            <div className="flex gap-3"><LayoutPanelTop className="size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Navegação</p><p className="font-medium">{navigationMode === "SIDEBAR" ? "Sidebar lateral" : "Navbar superior"}</p></div></div>
            {isDirty && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300" role="status">
                <AlertTriangle className="size-4 shrink-0" />
                <p className="text-xs font-medium">Alterações não salvas. Clique em salvar para aplicar.</p>
              </div>
            )}
            <Button className="w-full" onClick={save}><Save /> Salvar configurações{isDirty && <Badge variant="warning" className="ml-1">Não salvo</Badge>}</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
