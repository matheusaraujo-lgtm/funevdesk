import { createRequire } from "node:module";
import path from "node:path";

function loadDbModule() {
  const requireFromPkg = createRequire(
    path.join(process.cwd(), "node_modules", "nexus-desk-db", "package.json")
  );
  return requireFromPkg(".");
}

export function getDb() {
  return loadDbModule().getDb();
}

export function makeId(prefix) {
  return loadDbModule().makeId(prefix);
}
