"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input {...props} type={visible ? "text" : "password"} className={`rounded-xl pr-10 pl-10 ${className || ""}`} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function AuthView({ mode = "login", user, onAuthenticated, onPasswordChanged }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [organizations, setOrganizations] = useState([]);
  const [requiresSlug, setRequiresSlug] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  // Modo de recuperação de senha (sem e-mail: notifica os administradores).
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    if (mode !== "login") return;
    const params = new URLSearchParams(window.location.search);
    const urlSlug = params.get("org") || params.get("slug") || "";
    const query = urlSlug ? `?slug=${encodeURIComponent(urlSlug)}` : "";
    fetch(`/api/auth/organizations${query}`).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json();
      setOrganizations(payload.organizations || []);
      setRequiresSlug(Boolean(payload.requiresSlug));
      if (urlSlug) setOrganizationSlug(urlSlug);
      else if (payload.organizations?.length === 1) setOrganizationSlug(payload.organizations[0].slug);
    });
  }, [mode]);

  // Em multi-tenant o usuário informa o código (slug) da empresa; buscamos só o branding dela.
  async function loadOrgBySlug(value) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/auth/organizations?slug=${encodeURIComponent(trimmed)}`);
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    if (payload.organizations?.length) {
      setOrganizations(payload.organizations);
      setRequiresSlug(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, organizationSlug: organizationSlug || undefined }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível entrar.");
    onAuthenticated(result);
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (newPassword !== confirmation) return toast.error("A confirmação da senha não confere.");
    setLoading(true);
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return toast.error(result.error || "Não foi possível alterar a senha.");
    toast.success("Senha alterada com sucesso.");
    onPasswordChanged();
  }

  async function submitForgot(event) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: forgotEmail, organizationSlug: organizationSlug || undefined }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    // Resposta genérica (anti-enumeração) — sempre mostramos a mesma mensagem.
    toast.success(result.message || "Se o e-mail existir, os administradores foram avisados.");
    setForgotMode(false);
    setForgotEmail("");
  }

  const changingPassword = mode === "change-password";
  const selectedOrganization = useMemo(() => {
    if (changingPassword) return user || {};
    return organizations.find((organization) => organization.slug === organizationSlug) || organizations[0] || {};
  }, [changingPassword, organizationSlug, organizations, user]);
  const appName = selectedOrganization.appName || "FunevDesk";
  const logoUrl = selectedOrganization.logoUrl || "";
  const themeStyle = {
    "--primary": selectedOrganization.primaryColor || "#102033",
    "--primary-foreground": "#ffffff",
    "--secondary": selectedOrganization.secondaryColor || "#bff2e6",
    "--secondary-foreground": "#102033",
  };

  useEffect(() => {
    document.title = appName;
  }, [appName]);

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_minmax(0,1fr)]" style={themeStyle}>
      {/* Painel de marca — desktop, no padrão dos helpdesks corporativos */}
      <aside className="relative hidden flex-col overflow-hidden bg-primary p-12 text-primary-foreground lg:flex xl:p-16">
        <div className="pointer-events-none absolute -right-28 -top-28 size-96 rounded-full bg-white/[0.06]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 -left-24 size-[28rem] rounded-full bg-white/[0.04]" aria-hidden />

        <div className="relative flex items-center gap-3">
          <div className={`grid size-11 place-items-center overflow-hidden rounded-xl ${logoUrl ? "bg-white" : "bg-white/10"} font-heading text-lg font-extrabold`}>
            {logoUrl ? <img src={logoUrl} alt={appName} className="h-full w-full object-contain p-1" /> : appName.slice(0, 1).toUpperCase()}
          </div>
          <span className="font-heading text-lg font-bold tracking-tight">{appName}</span>
        </div>

        <div className="relative my-auto max-w-md">
          <h2 className="font-heading text-3xl font-bold leading-tight xl:text-4xl">O canal de suporte de TI da sua empresa.</h2>
          <p className="mt-4 text-sm leading-relaxed text-primary-foreground/75">Precisa de ajuda da TI? Abra um chamado, acompanhe o andamento do atendimento e encontre respostas rápidas — direto com a nossa equipe.</p>
        </div>
      </aside>

      {/* Formulário */}
      <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className={`grid size-14 place-items-center overflow-hidden rounded-xl ${logoUrl ? "bg-transparent" : "bg-primary text-primary-foreground"} font-heading text-2xl font-extrabold shadow-sm`}>
              {logoUrl ? <img src={logoUrl} alt={appName} className="h-full w-full object-contain" /> : appName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-heading text-xl font-bold leading-none tracking-tight">{appName}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">Suporte e operações de TI</p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="font-heading text-2xl font-bold tracking-tight">{changingPassword ? "Crie uma nova senha" : forgotMode ? "Recuperar senha" : "Acesse sua conta"}</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{changingPassword ? `${user?.name || "Usuário"}, altere a senha temporária antes de continuar.` : forgotMode ? "Informe seu e-mail. Avisaremos os administradores para redefinir sua senha." : "Entre com seu e-mail corporativo e sua senha."}</p>
          </div>

          {forgotMode && !changingPassword ? (
              <form className="space-y-5" onSubmit={submitForgot}>
                <fieldset disabled={loading} className="space-y-4">
                  {requiresSlug && (
                    <div className="space-y-2">
                      <Label htmlFor="forgot-org">Código da empresa</Label>
                      <Input id="forgot-org" required value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} onBlur={(event) => loadOrgBySlug(event.target.value)} placeholder="ex: minha-empresa" className="h-11 rounded-xl" />
                    </div>
                  )}
                  <div className="space-y-2"><Label htmlFor="forgot-email">E-mail</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="forgot-email" type="email" autoComplete="username" required value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} placeholder="nome@empresa.com" className="h-11 rounded-xl pl-10" /></div></div>
                </fieldset>
                <Button className="h-11 w-full text-sm font-semibold" type="submit" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <Mail />}{loading ? "Enviando..." : "Solicitar redefinição"}</Button>
                <button type="button" onClick={() => setForgotMode(false)} className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Voltar ao login</button>
              </form>
            ) : changingPassword ? (
              <form className="space-y-5" onSubmit={submitPassword}>
                <fieldset disabled={loading} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="current-password">Senha atual</Label><PasswordInput id="current-password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-11" /></div>
                  <div className="space-y-2"><Label htmlFor="new-password">Nova senha</Label><PasswordInput id="new-password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-11" /></div>
                  <div className="space-y-2"><Label htmlFor="password-confirmation">Confirmar nova senha</Label><PasswordInput id="password-confirmation" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-11" /></div>
                </fieldset>
                <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Use ao menos 8 caracteres, com letra maiúscula, minúscula, número e símbolo.</p>
                <Button className="h-11 w-full text-sm font-semibold" type="submit" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <KeyRound />}{loading ? "Alterando..." : "Alterar senha e continuar"}</Button>
              </form>
            ) : (
              <form className="space-y-5" onSubmit={submitLogin}>
                <fieldset disabled={loading} className="space-y-4">
                  {requiresSlug && (
                    <div className="space-y-2">
                      <Label htmlFor="organization">Código da empresa</Label>
                      <Input id="organization" required value={organizationSlug} onChange={(event) => setOrganizationSlug(event.target.value)} onBlur={(event) => loadOrgBySlug(event.target.value)} placeholder="ex: minha-empresa" className="h-11 rounded-xl" />
                    </div>
                  )}
                  <div className="space-y-2"><Label htmlFor="email">E-mail</Label><div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.com" className="h-11 rounded-xl pl-10" /></div></div>
                  <div className="space-y-2"><Label htmlFor="password">Senha</Label><PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11" /></div>
                </fieldset>
                <Button className="h-11 w-full text-sm font-semibold" type="submit" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}{loading ? "Entrando..." : "Entrar"}</Button>
                <button type="button" onClick={() => setForgotMode(true)} className="block w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground">Esqueci minha senha</button>
              </form>
            )}
        </div>
      </div>
    </main>
  );
}
