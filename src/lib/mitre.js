// Mapeamento heurístico de alertas de segurança para o framework MITRE ATT&CK.
// Não substitui um SIEM, mas dá ao analista o contexto de tática/técnica que os
// líderes (Sentinel, CrowdStrike) exibem — derivado do título/tipo do alerta.

const RULES = [
  { match: /ransom|crypto.?lock|encrypt/i, tactic: "Impacto", tacticId: "TA0040", technique: "Dados criptografados para impacto", techniqueId: "T1486" },
  { match: /phish|spoof|email|smishing/i, tactic: "Acesso inicial", tacticId: "TA0001", technique: "Phishing", techniqueId: "T1566" },
  { match: /brute.?force|credential|senha|password|login fail/i, tactic: "Acesso a credenciais", tacticId: "TA0006", technique: "Força bruta", techniqueId: "T1110" },
  { match: /lateral|smb|psexec|remote service/i, tactic: "Movimento lateral", tacticId: "TA0008", technique: "Serviços remotos", techniqueId: "T1021" },
  { match: /exfil|data leak|upload|vazamento/i, tactic: "Exfiltração", tacticId: "TA0010", technique: "Exfiltração por canal C2", techniqueId: "T1041" },
  { match: /persist|startup|scheduled task|registry run/i, tactic: "Persistência", tacticId: "TA0003", technique: "Execução automática na inicialização", techniqueId: "T1547" },
  { match: /privilege|escalat|uac bypass|admin/i, tactic: "Escalonamento de privilégio", tacticId: "TA0004", technique: "Exploração para escalonamento", techniqueId: "T1068" },
  { match: /c2|command.?and.?control|beacon|botnet/i, tactic: "Comando e controle", tacticId: "TA0011", technique: "Protocolo de camada de aplicação", techniqueId: "T1071" },
  { match: /sem antiv[íi]rus|tempo real (desativ|deslig)|adultera[çc][ãa]o (desativ|deslig)|assinaturas desatualiz|tamper.*(off|deslig|desativ)|firewall (off|deslig|desativ)/i, tactic: "Evasão de defesa", tacticId: "TA0005", technique: "Enfraquecer defesas (Impair Defenses)", techniqueId: "T1562" },
  { match: /evasion|obfusc|disable.*(defender|antivirus)|tamper/i, tactic: "Evasão de defesa", tacticId: "TA0005", technique: "Ofuscação de arquivos/informação", techniqueId: "T1027" },
  { match: /trojan|malware|virus|backdoor|worm|pua|suspicious exec/i, tactic: "Execução", tacticId: "TA0002", technique: "Execução pelo usuário", techniqueId: "T1204" },
  { match: /recon|scan|discovery|enumera/i, tactic: "Descoberta", tacticId: "TA0007", technique: "Varredura de rede", techniqueId: "T1046" },
];

export function mitreForAlert(alert) {
  const haystack = `${alert?.alert_type || ""} ${alert?.title || ""} ${alert?.description || ""} ${alert?.threat_name || ""}`;
  const rule = RULES.find((r) => r.match.test(haystack));
  if (!rule) return null;
  return { tactic: rule.tactic, tacticId: rule.tacticId, technique: rule.technique, techniqueId: rule.techniqueId };
}
