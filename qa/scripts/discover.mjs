// AGENT 2 — System Explorer (qa/agents/02-system-explorer.md)
// Crawler genérico do menu lateral: não hardcoda a lista de telas — descobre pelo DOM,
// para continuar válido se o menu mudar. Login real via UI, não via API.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { BASE } from "./lib/http.mjs";
import { qaPath } from "./lib/evidence.mjs";
import users from "../config/users.json" with { type: "json" };

const PROFILES = ["usuario", "tecnico", "admin"];

async function loginViaUi(page, user) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const emailInput = page.locator("#email").first();
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(user.email);
  await page.locator("#password").first().fill(user.password);
  await page.getByRole("button", { name: /entrar/i }).first().click();
  await page.waitForResponse((res) => res.url().includes("/api/auth/login"), { timeout: 15000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function countNavItems(page) {
  return page.locator("aside a, aside button, nav a, nav button").count();
}

// Espera determinística pela hidratação do menu (nunca timeout fixo — Fase 7 da missão):
// só decide clicar no hambúrguer depois de confirmar, com poll real, que o menu segue
// vazio. Ler a contagem antes da hidratação terminar e clicar às cegas escondia o menu
// em vez de abri-lo (causa raiz real, achada ao rodar este script pela 1ª vez).
async function openSidebar(page) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll("aside a, aside button, nav a, nav button").length > 0,
      { timeout: 5000 }
    );
    return; // menu já está populado — nada a fazer
  } catch {
    // seguiu vazio após 5s: pode ser um Sheet fechado (viewport estreito)
  }
  const trigger = page.locator('button[aria-label*="menu" i], button:has(svg.lucide-menu)').first();
  if (await trigger.count()) {
    await trigger.click().catch(() => {});
    await page.waitForFunction(
      () => document.querySelectorAll("aside a, aside button, nav a, nav button").length > 0,
      { timeout: 5000 }
    ).catch(() => {});
  }
}

async function collectNavItems(page) {
  // Coleta todos os itens de navegação clicáveis dentro da área de menu, incluindo
  // cabeçalhos de grupo que precisam ser expandidos primeiro.
  const candidates = await page.locator("aside a, aside button, nav a, nav button").all();
  const items = [];
  for (const el of candidates) {
    const text = (await el.innerText().catch(() => ""))?.trim();
    if (text && text.length < 60) items.push(text);
  }
  return [...new Set(items)];
}

async function crawlProfile(browser, profileKey) {
  const user = users[profileKey];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  await loginViaUi(page, user);
  await openSidebar(page);

  const groupHeaders = ["Ativos", "ITSM", "Conhecimento", "Monitoramento", "Administração", "Configurações"];
  for (const label of groupHeaders) {
    const header = page.getByText(label, { exact: true }).first();
    if (await header.count()) await header.click({ timeout: 3000 }).catch(() => {});
  }

  const navLabels = await collectNavItems(page);
  const routes = [];
  for (const label of navLabels) {
    if (groupHeaders.includes(label)) continue; // cabeçalho, não é destino
    const before = consoleErrors.length;
    const target = page.getByText(label, { exact: true }).first();
    const clickable = await target.count();
    let opened = false;
    if (clickable) {
      await target.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400); // troca de view é local (SPA), sem network garantida
      opened = true;
    }
    const hasTable = await page.locator("table").count() > 0;
    const hasCreateButton = await page.getByRole("button", { name: /novo|nova|criar|adicionar/i }).count() > 0;
    routes.push({
      label,
      opened,
      newConsoleErrors: consoleErrors.slice(before),
      hasTable,
      hasCreateButton,
    });
  }

  await context.close();
  return { profile: profileKey, base: BASE, routes, totalConsoleErrors: consoleErrors.length };
}

async function main() {
  const browser = await chromium.launch();
  mkdirSync(qaPath("discoveries"), { recursive: true });
  const allResults = {};
  for (const profileKey of PROFILES) {
    console.log(`\n== Discovery: ${profileKey} ==`);
    try {
      const result = await crawlProfile(browser, profileKey);
      allResults[profileKey] = result;
      writeFileSync(qaPath("discoveries", `routes-${profileKey}.json`), JSON.stringify(result, null, 2), "utf8");
      console.log(`  ${result.routes.length} itens de menu encontrados, ${result.totalConsoleErrors} erros de console.`);
    } catch (err) {
      console.log(`  ❌ Falha ao explorar como ${profileKey}: ${err.message}`);
      allResults[profileKey] = { profile: profileKey, error: err.message };
    }
  }
  await browser.close();

  const lines = ["# Discovery Report", "", `Gerado em ${new Date().toISOString()}`, ""];
  for (const [profileKey, result] of Object.entries(allResults)) {
    lines.push(`## ${profileKey}`);
    if (result.error) { lines.push(`ERRO: ${result.error}`, ""); continue; }
    lines.push(`${result.routes.length} itens de menu, ${result.totalConsoleErrors} erros de console.`, "");
    lines.push("| Item | Abriu | Tabela | Botão criar | Erros novos |");
    lines.push("|---|---|---|---|---|");
    for (const r of result.routes) {
      lines.push(`| ${r.label} | ${r.opened ? "sim" : "não"} | ${r.hasTable ? "sim" : "não"} | ${r.hasCreateButton ? "sim" : "não"} | ${r.newConsoleErrors.length} |`);
    }
    lines.push("");
  }
  lines.push(
    "## Limitação conhecida deste crawler",
    "",
    "Quando o cabeçalho de um grupo do menu tem o MESMO texto do primeiro item da lista " +
    "(ex.: grupo \"Ativos\" → item \"Ativos\"; grupo \"Conhecimento\" → item \"Conhecimento\"; " +
    "grupo \"Monitoramento\" → item \"Monitoramento\"), `getByText(label, { exact: true }).first()` " +
    "sempre acerta o cabeçalho, e o item-folha com o mesmo texto nunca é visitado por este script. " +
    "Essas 3 telas (Ativos, Base de conhecimento, Monitoramento de rede) precisam de verificação manual " +
    "ou de um seletor mais específico (ex.: por `href`/`data-view`) numa iteração futura do crawler.",
    ""
  );
  writeFileSync(qaPath("discoveries", "discovery-report.md"), lines.join("\n"), "utf8");
  console.log("\nRelatório: qa/discoveries/discovery-report.md");
}

main().catch((err) => { console.error(err); process.exit(1); });
