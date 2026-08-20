// Guarda de segurança operacional (FASE 17 da missão): nunca deixa os agentes de QA
// mirarem em produção, mesmo que alguém passe BASE errado por engano.
const KNOWN_PROD_HINTS = ["funevdesk.com", "funev.com.br", ".prod.", "app.funev"];

export function resolveBaseUrl() {
  const base = process.env.BASE || "http://localhost:3000";
  const looksProd = KNOWN_PROD_HINTS.some((hint) => base.includes(hint));
  const isProdEnv = process.env.NODE_ENV === "production";
  if ((looksProd || isProdEnv) && process.env.QA_ALLOW_PROD !== "1") {
    throw new Error(
      `Recusando rodar QA contra um alvo que parece produção: ${base}\n` +
      `Se isso for intencional (nunca deveria ser para os agentes chaos/permission), defina QA_ALLOW_PROD=1.`
    );
  }
  return base;
}

export function requireDevDatabase() {
  // Agent 6 (Database/State) só pode ler SQLite local — nunca abre Postgres remoto.
  if (process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL está definido (Postgres) — Database/State Agent só opera em SQLite local de dev.");
  }
}

export const timestamp = () => new Date().toISOString().replace(/[:.]/g, "-");
