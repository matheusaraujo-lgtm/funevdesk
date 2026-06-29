import fs from "node:fs";
import path from "node:path";

let cachedStub = null;

export function getEmbeddedStubExe() {
  if (cachedStub) return cachedStub;

  const stubPath = path.join(process.cwd(), "agent", "stub", "FunevDeskSetupStub.exe");
  if (fs.existsSync(stubPath)) {
    cachedStub = fs.readFileSync(stubPath);
    return cachedStub;
  }

  throw new Error(
    "Stub do instalador não encontrado. O servidor tentará IExpress; se falhar, execute: npm run build:agent-stub"
  );
}
