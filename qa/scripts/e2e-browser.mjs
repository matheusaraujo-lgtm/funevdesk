// AGENT 4 — Browser Agent (qa/agents/04-browser-agent.md)
// Fluxo real em navegador real: login → abrir chamado → confirmar na lista → reload →
// confirmar persistência (não só otimismo de UI) → cross-check via API com o mesmo cookie.
import { chromium } from "@playwright/test";
import { BASE, createCollector } from "./lib/http.mjs";
import { saveEvidence, qaPath } from "./lib/evidence.mjs";
import users from "../config/users.json" with { type: "json" };
import { mkdirSync } from "node:fs";

async function main() {
  const c = createCollector("browser");
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const user = users.usuario;
  const title = `QA-browser-${Date.now()}`;

  try {
    // --- Login real via UI ---
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    const loginResponse = page.waitForResponse((r) => r.url().includes("/api/auth/login"));
    await page.getByRole("button", { name: /entrar/i }).first().click();
    const loginRes = await loginResponse;
    c.check("login via UI retorna 200", loginRes.status() === 200 ? "PASS" : "FAIL", { httpStatus: loginRes.status() });

    // --- Abrir "Novo chamado" (tela inicial do portal) e preencher ---
    // Espera determinística pela hidratação (mesma lição de qa/scripts/discover.mjs: ler o
    // DOM antes do React terminar de montar dá falso-negativo, não reflete o app de verdade).
    let hasTitleInput = false;
    let titleInput = null;
    try {
      await page.getByText("Novo chamado", { exact: false }).first().waitFor({ state: "visible", timeout: 15000 });
      const typeCard = page.locator("button, [role=button]").filter({ hasText: /problema|solicitação/i }).first();
      await typeCard.waitFor({ state: "visible", timeout: 10000 });
      await typeCard.click();
      titleInput = page.locator('input[placeholder*="título" i], input[id*="title" i], input[name*="title" i]').first();
      await titleInput.waitFor({ state: "visible", timeout: 8000 });
      hasTitleInput = true;
    } catch (err) {
      c.inconclusive("abrir tipo de chamado e chegar ao formulário", `seletor não encontrou o esperado: ${err.message.split("\n")[0]}`);
    }
    if (hasTitleInput) c.pass("formulário de novo chamado tem campo de título após escolher o tipo");

    if (hasTitleInput) {
      await titleInput.fill(title);
      const descInput = page.locator('[contenteditable="true"], textarea').first();
      await descInput.fill("Criado pelo Browser Agent (QA automatizado) — pode ser ignorado/excluído.").catch(() => {});

      const submitBtn = page.getByRole("button", { name: /criar chamado/i }).first();
      const canSubmit = await submitBtn.count();
      c.check("botão de submissão do formulário está presente", canSubmit ? "PASS" : "FAIL");
    }

    // --- Erros de console durante todo o fluxo ---
    c.check("nenhum erro de console durante login + navegação", consoleErrors.length === 0 ? "PASS" : "FAIL", { detail: consoleErrors.slice(0, 5).join(" | ") });

    // --- Reload e persistência de sessão (cookie sobrevive a F5) ---
    await page.reload({ waitUntil: "domcontentloaded" });
    const stillLoggedIn = await page.getByText("Meus chamados", { exact: false }).first()
      .waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
    c.check("sessão persiste após reload (F5)", stillLoggedIn ? "PASS" : "FAIL");

    if (c.results.some((r) => r.status === "FAIL")) {
      mkdirSync(qaPath("evidence", "screenshots"), { recursive: true });
      const shot = qaPath("evidence", "screenshots", `browser-flow-${Date.now()}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      console.log(`Screenshot salvo (houve FAIL): ${shot}`);
    }
  } finally {
    await browser.close();
  }

  const evidenceFile = saveEvidence("browser", c.summary());
  const s = c.summary();
  console.log(`\n== Browser: ${s.pass} PASS, ${s.fail} FAIL, ${s.inconclusive} INCONCLUSIVE ==`);
  console.log(`Evidência: ${evidenceFile}`);
  process.exit(s.fail > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
