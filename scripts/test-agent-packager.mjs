import fs from "node:fs/promises";
import path from "node:path";
import { buildAgentPayloadFiles, buildLegacyMsiInstaller, buildLegacySelfExtractingExe } from "../src/lib/agent-packager.js";

async function agentFiles() {
  const root = path.join(process.cwd(), "agent");
  return {
    agent: await fs.readFile(path.join(root, "NexusAgent.ps1"), "utf8"),
    chat: await fs.readFile(path.join(root, "NexusChat.ps1"), "utf8"),
    install: await fs.readFile(path.join(root, "Install-GPO.ps1"), "utf8"),
  };
}

async function main() {
  const outDir = path.join(process.cwd(), "agent", "dist");
  await fs.mkdir(outDir, { recursive: true });

  const files = await agentFiles();
  const serverUrl = process.env.NEXUS_URL || "http://localhost:3000";
  const token = process.env.NEXUS_TOKEN || "demo-agent-cps";
  const payload = buildAgentPayloadFiles(files, serverUrl, token);

  console.log("Gerando EXE...");
  const exe = await buildLegacySelfExtractingExe(payload, "FunevDeskAgenteSetup.exe");
  await fs.writeFile(path.join(outDir, "FunevDeskAgenteSetup.exe"), exe);
  console.log(`EXE OK (${exe.length} bytes)`);

  console.log("Gerando MSI...");
  const msi = await buildLegacyMsiInstaller(payload);
  await fs.writeFile(path.join(outDir, "FunevDeskAgente.msi"), msi);
  console.log(`MSI OK (${msi.length} bytes)`);

  console.log(`\nArquivos em: ${outDir}`);
}

main().catch((error) => {
  console.error("Falha:", error.message);
  process.exit(1);
});
