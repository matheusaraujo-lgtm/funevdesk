import fs from "node:fs/promises";
import path from "node:path";

const stubPath = path.join(process.cwd(), "agent", "stub", "FunevDeskSetupStub.exe");
const outputPath = path.join(process.cwd(), "src", "lib", "agent-stub-binary.js");

const stub = await fs.readFile(stubPath);
const base64 = stub.toString("base64");

const source = `// Gerado por scripts/generate-stub-module.mjs — não edite manualmente
import { Buffer } from "node:buffer";

let cachedStub = null;

export function getEmbeddedStubExe() {
  if (cachedStub) return cachedStub;
  cachedStub = Buffer.from("${base64}", "base64");
  return cachedStub;
}
`;

await fs.writeFile(outputPath, source, "utf8");
console.log(`Stub embutido (${stub.length} bytes) em ${outputPath}`);
