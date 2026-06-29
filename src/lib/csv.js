"use client";

// Helpers de importação/exportação por planilha (CSV separado por ";", com BOM p/ Excel pt-BR).
// header: array de chaves (1ª linha). rows: array de arrays de valores.
export function downloadCsv(fileName, header, rows = []) {
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Lê um CSV (";") e retorna array de objetos chaveados pelo cabeçalho.
export function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const columns = lines[0].split(";").map((item) => item.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const values = line.match(/("([^"]|"")*"|[^;]+)/g)?.map((item) => item.replace(/^"|"$/g, "").replaceAll('""', '"').trim()) || [];
    return Object.fromEntries(columns.map((column, index) => [column, values[index] || ""]));
  });
}
