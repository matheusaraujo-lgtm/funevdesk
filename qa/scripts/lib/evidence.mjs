import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { timestamp } from "../../config/environment.mjs";

const QA_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function saveEvidence(phase, data) {
  const dir = join(QA_ROOT, "evidence");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${phase}-${timestamp()}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

export function qaPath(...parts) {
  return join(QA_ROOT, ...parts);
}
