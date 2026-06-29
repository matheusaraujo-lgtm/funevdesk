"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function CrudFormLayout({
  title,
  description,
  onCancel,
  onSubmit,
  submitLabel,
  submitting = false,
  submitDisabled = false,
  noValidate = false,
  children,
  icon: Icon,
}) {
  return (
    <form className="space-y-5 pb-6" onSubmit={onSubmit} noValidate={noValidate}>
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/[0.07] via-card to-secondary/25 px-5 py-5 ring-1 ring-foreground/10 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <Button type="button" variant="outline" size="icon" className="mt-0.5 bg-card/70" onClick={onCancel} aria-label="Voltar">
              <ArrowLeft />
            </Button>
            {Icon && <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:flex"><Icon className="size-5" /></span>}
            <div>
              <h1 className="page-title text-[26px]">{title}</h1>
              <p className="page-copy max-w-md">{description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="bg-card/70" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" disabled={submitting || submitDisabled}>{submitLabel}</Button>
          </div>
        </div>
      </div>
      <Card className="gap-0 rounded-2xl border-0 py-0 shadow-none ring-1 ring-foreground/10">
        {Icon && (
          <CardHeader className="border-b px-5 py-4">
            <CardTitle className="flex items-center gap-2 text-[15px]">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-[18px]" /></span>
              Dados do cadastro
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          {children}
        </CardContent>
      </Card>
    </form>
  );
}
