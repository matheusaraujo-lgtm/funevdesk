// Configuração de servidores ICE (STUN/TURN) para o acesso remoto WebRTC.
//
// Só STUN não basta quando agente e técnico estão em redes/NATs diferentes (cenário típico
// internet-facing): o P2P não fecha e a sessão trava em "Aguardando canal de controle". Um
// servidor TURN faz o relay e resolve. O TURN é configurado por ambiente (segredos fora do código):
//
//   TURN_URLS=turn:turn.suaempresa.com:3478,turns:turn.suaempresa.com:5349
//   TURN_USERNAME=funevdesk
//   TURN_CREDENTIAL=<senha do TURN>
//
// Sem TURN configurado, mantém apenas o STUN público (acesso remoto só funciona na mesma rede).
export function getIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  const turnUrls = (process.env.TURN_URLS || process.env.TURN_URL || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (turnUrls.length) {
    const turn = { urls: turnUrls };
    if (process.env.TURN_USERNAME) turn.username = process.env.TURN_USERNAME;
    if (process.env.TURN_CREDENTIAL) turn.credential = process.env.TURN_CREDENTIAL;
    servers.push(turn);
  }
  return servers;
}
