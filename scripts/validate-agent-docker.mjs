#!/usr/bin/env node
/**
 * Valida que o instalador Windows do agente está presente antes do docker build.
 * Rode npm run build:agent no Windows antes de docker compose build.
 */
import fs from "node:fs";
import path from "node:path";

const AGENT_VERSION = "1.2.0";
const dir = path.join(process.cwd(), "public", "downloads", "agent");
const exe = path.join(dir, "FunevDeskAgenteSetup.exe");
const manifestPath = path.join(dir, "manifest.json");

function fail(msg) {
  console.error(`[validate:agent-docker] ${msg}`);
  console.error("Execute no Windows: npm run build:agent");
  process.exit(1);
}

if (!fs.existsSync(exe)) fail(`EXE ausente: ${exe}`);
if (!fs.existsSync(manifestPath)) fail(`manifest.json ausente`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.agentVersion !== AGENT_VERSION) {
  fail(`manifest.agentVersion=${manifest.agentVersion} (esperado ${AGENT_VERSION})`);
}

const size = fs.statSync(exe).size;
if (size < 5 * 1024 * 1024) fail(`EXE muito pequeno (${size} bytes)`);

const buf = Buffer.alloc(2);
const fd = fs.openSync(exe, "r");
fs.readSync(fd, buf, 0, 2, 0);
fs.closeSync(fd);
if (buf[0] !== 0x4d || buf[1] !== 0x5a) fail("EXE não é um PE válido");

console.log(JSON.stringify({ ok: true, agentVersion: AGENT_VERSION, exeBytes: size }, null, 2));
