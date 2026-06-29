"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv, parseCsv } from "@/lib/csv";

// Botões "Modelo" + "Importar" reutilizáveis. O endpoint deve responder:
//  GET ?mode=template -> { columns, example|examples }
//  POST { rows }      -> { imported, skipped? }
export function ImportTemplateButtons({ endpoint, templateFile, onImported, label = "registro" }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function downloadTemplate() {
    try {
      const response = await fetch(`${endpoint}?mode=template`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao baixar o modelo.");
      const columns = data.columns || [];
      const examples = data.examples || (data.example ? [data.example] : []);
      const rows = examples.map((example) => columns.map((column) => example[column] ?? ""));
      downloadCsv(templateFile, columns, rows);
      toast.info("Modelo baixado. Preencha as linhas e use Importar.");
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("A planilha está vazia.");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível importar a planilha.");
      const count = data.imported ?? rows.length;
      toast.success(`${count} ${label}(s) importado(s).${data.skipped ? ` ${data.skipped} já existente(s) ignorado(s).` : ""}`);
      onImported?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}><FileSpreadsheet /> Modelo</Button>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Upload />} Importar
      </Button>
    </>
  );
}
