// Eventos de impressora que podem abrir chamado automaticamente.
// Config global por organização em system_settings.printer_alert_events (JSON { key: bool }).

// Erros reportados pela impressora (Printer-MIB / hrPrinterDetectedErrorState — BITS).
export const PRINTER_ERROR_BITS = [
  { key: "lowPaper", label: "Pouco papel" },
  { key: "noPaper", label: "Sem papel" },
  { key: "lowToner", label: "Toner baixo (reportado)" },
  { key: "noToner", label: "Sem toner" },
  { key: "doorOpen", label: "Tampa/porta aberta" },
  { key: "jammed", label: "Atolamento de papel" },
  { key: "offlineBit", label: "Offline (reportado pela impressora)" },
  { key: "serviceRequested", label: "Serviço técnico requerido" },
  { key: "inputTrayMissing", label: "Bandeja de entrada ausente" },
  { key: "outputTrayMissing", label: "Bandeja de saída ausente" },
  { key: "markerSupplyMissing", label: "Suprimento ausente" },
  { key: "outputNearFull", label: "Saída quase cheia" },
  { key: "outputFull", label: "Saída cheia" },
  { key: "inputTrayEmpty", label: "Bandeja de papel vazia" },
  { key: "overduePreventMaint", label: "Manutenção preventiva atrasada" },
];

// Condições de monitoramento (não vêm do bitmask de erro).
export const PRINTER_EXTRA_EVENTS = [
  { key: "supplyLow", label: "Suprimento abaixo do limite configurado" },
  { key: "offline", label: "Impressora sem resposta (offline)" },
  { key: "unreachable", label: "Sem comunicação SNMP" },
];

export const ALL_PRINTER_EVENTS = [...PRINTER_EXTRA_EVENTS, ...PRINTER_ERROR_BITS];

// Padrão: liga o que indica problema real; deixa de fora os meramente informativos.
export const DEFAULT_PRINTER_EVENTS = {
  supplyLow: true, offline: true, unreachable: false,
  lowPaper: false, noPaper: true, lowToner: false, noToner: true,
  doorOpen: true, jammed: true, offlineBit: true, serviceRequested: true,
  inputTrayMissing: true, outputTrayMissing: false, markerSupplyMissing: true,
  outputNearFull: false, outputFull: true, inputTrayEmpty: true, overduePreventMaint: false,
};

export function resolvePrinterEvents(json) {
  let saved = {};
  try { saved = json ? JSON.parse(json) : {}; } catch { saved = {}; }
  return { ...DEFAULT_PRINTER_EVENTS, ...saved };
}
