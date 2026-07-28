"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Check, ImageIcon, KeyRound, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

// Espelha EXATAMENTE a política de /api/auth/change-password. Fica visível como checklist para
// o usuário não descobrir a regra por tentativa e erro.
const PASSWORD_RULES = [
  { label: "Pelo menos 8 caracteres", test: (value) => value.length >= 8 },
  { label: "Uma letra maiúscula", test: (value) => /[A-Z]/.test(value) },
  { label: "Uma letra minúscula", test: (value) => /[a-z]/.test(value) },
  { label: "Um número", test: (value) => /[0-9]/.test(value) },
  { label: "Um símbolo (! @ # $ …)", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export function ProfileView({ currentUser, onBack, onAvatarChanged }) {
  const [avatarUrl, setAvatarUrl] = useState(currentUser?.avatarUrl || "");
  const [preview, setPreview] = useState("");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const fileRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // LDAP: a senha vive no diretório da unidade, o app não tem o que trocar.
  const isLocal = (currentUser?.authProvider || "LOCAL") === "LOCAL";
  const shownAvatar = preview || avatarUrl;

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem PNG, JPG, WEBP ou GIF.");
    setSavingPhoto(true);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    try {
      const formData = new FormData();
      formData.append("arquivo", file);
      const upload = await fetch("/api/uploads", { method: "POST", body: formData });
      const uploaded = await upload.json().catch(() => ({}));
      if (!upload.ok) {
        setPreview("");
        return toast.error(uploaded.error || "Não foi possível enviar a foto.");
      }
      const response = await fetch("/api/me/avatar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarUrl: uploaded.publicUrl }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPreview("");
        return toast.error(result.error || "Não foi possível salvar a foto.");
      }
      setAvatarUrl(result.avatarUrl);
      setPreview("");
      onAvatarChanged?.(result.avatarUrl);
      toast.success("Foto atualizada.");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function removePhoto() {
    setSavingPhoto(true);
    try {
      const response = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!response.ok) return toast.error("Não foi possível remover a foto.");
      setAvatarUrl("");
      setPreview("");
      onAvatarChanged?.("");
      toast.success("Foto removida. Voltamos a mostrar suas iniciais.");
    } finally {
      setSavingPhoto(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    if (PASSWORD_RULES.some((rule) => !rule.test(newPassword))) {
      return toast.error("A nova senha não atende aos requisitos.");
    }
    if (newPassword !== confirmPassword) return toast.error("A confirmação não confere com a nova senha.");
    if (newPassword === currentPassword) return toast.error("A nova senha precisa ser diferente da atual.");
    setSavingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) return toast.error(result.error || "Não foi possível trocar a senha.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Senha alterada com sucesso.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex items-start gap-3.5">
          <Button type="button" variant="outline" size="icon" className="mt-0.5 bg-card/70" onClick={onBack} aria-label="Voltar">
            <ArrowLeft />
          </Button>
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex">
            <UserRound className="size-5" />
          </span>
          <div>
            <h1 className="page-title text-[26px]">Meu perfil</h1>
            <p className="page-copy max-w-md">Sua foto e sua senha de acesso.</p>
          </div>
        </div>
      </div>

      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ImageIcon className="size-[18px]" /></span>
            Foto de perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="size-20 shrink-0">
              {shownAvatar && <AvatarImage src={shownAvatar} alt={currentUser?.name || "Foto de perfil"} />}
              <AvatarFallback className="text-lg font-semibold">{initials(currentUser?.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium">{currentUser?.name}</p>
                <p className="text-xs text-muted-foreground">{currentUser?.roleLabel} · {currentUser?.branchName}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={uploadPhoto} />
                <Button type="button" variant="outline" size="sm" disabled={savingPhoto} onClick={() => fileRef.current?.click()}>
                  <ImageIcon className="size-4" /> {avatarUrl ? "Trocar foto" : "Escolher foto"}
                </Button>
                {avatarUrl && (
                  <Button type="button" variant="ghost" size="sm" disabled={savingPhoto} onClick={removePhoto}>
                    <X className="size-4" /> Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Opcional. PNG, JPG, WEBP ou GIF de até 10 MB. Sem foto, mostramos suas iniciais.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><KeyRound className="size-[18px]" /></span>
            Trocar senha
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 py-5">
          {!isLocal ? (
            <p className="text-sm text-muted-foreground">
              Sua senha é gerenciada pelo diretório (LDAP) da sua unidade e precisa ser trocada por lá.
            </p>
          ) : (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitPassword} noValidate>
              <div className="sm:col-span-2">
                <Label htmlFor="profile-current-password" className="mb-2 block">Senha atual</Label>
                <Input id="profile-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="profile-new-password" className="mb-2 block">Nova senha</Label>
                <Input id="profile-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="profile-confirm-password" className="mb-2 block">Confirmar nova senha</Label>
                <Input id="profile-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={confirmPassword && newPassword !== confirmPassword ? true : undefined} />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="mt-1.5 text-xs font-medium text-destructive">A confirmação não confere.</p>
                )}
              </div>
              <ul className="grid gap-1 sm:col-span-2">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(newPassword);
                  return (
                    <li key={rule.label} className={cn("flex items-center gap-1.5 text-xs", ok ? "text-primary" : "text-muted-foreground")}>
                      {ok ? <Check className="size-3.5 shrink-0" /> : <X className="size-3.5 shrink-0 opacity-40" />}
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={savingPassword || !currentPassword || !newPassword}>
                  {savingPassword ? "Salvando..." : "Trocar senha"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
