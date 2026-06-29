#!/usr/bin/env node
const { createRequire } = require("node:module");
const path = require("node:path");

const requireDb = createRequire(
  path.join(process.cwd(), "node_modules", "nexus-desk-db", "package.json")
);

console.log("[entrypoint] Inicializando banco de dados...");
requireDb(".").getDb();
console.log("[entrypoint] Banco pronto. Iniciando servidor...");

require(path.join(process.cwd(), "server.js"));
