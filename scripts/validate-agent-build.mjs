import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const artifacts = [
  path.join(root, "public", "downloads", "agent", "FunevDeskAgenteSetup.exe"),
  path.join(root, "public", "downloads", "agent", "FunevDeskAgente.msi"),
  path.join(root, "agent-desktop", "src", "main.js"),
  path.join(root, "agent-desktop", "build-config.json"),
];

const apiRoutes = [
  path.join(root, "src", "app", "api", "agent", "remote", "pending", "route.js"),
  path.join(root, "src", "app", "api", "agent", "remote", "acknowledge", "route.js"),
];

async function assertFile(filePath, minBytes = 1024) {
  const stat = await fs.stat(filePath);
  if (stat.size < minBytes) {
    throw new Error(`${filePath} too small (${stat.size} bytes)`);
  }
  return stat.size;
}

async function assertPe(filePath) {
  const handle = await fs.open(filePath, "r");
  const buffer = Buffer.alloc(2);
  await handle.read(buffer, 0, 2, 0);
  await handle.close();
  if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    throw new Error(`${filePath} is not a valid PE executable`);
  }
}

async function main() {
  for (const filePath of [...artifacts, ...apiRoutes]) {
    await fs.access(filePath);
  }

  const exeSize = await assertFile(artifacts[0], 5 * 1024 * 1024);
  await assertPe(artifacts[0]);
  const msiSize = await assertFile(artifacts[1], 5 * 1024 * 1024);

  const config = JSON.parse(await fs.readFile(artifacts[3], "utf8"));
  if (!config.serverUrl) throw new Error("build-config.json missing serverUrl");
  if (config.agentVersion !== "1.2.0") throw new Error(`build-config.json agentVersion must be 1.2.0, got ${config.agentVersion || "missing"}`);

  console.log(JSON.stringify({
    ok: true,
    exeBytes: exeSize,
    msiBytes: msiSize,
    serverUrl: config.serverUrl,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
