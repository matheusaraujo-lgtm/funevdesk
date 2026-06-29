import { buildElectronAgent } from "./build-agent-electron.mjs";

const serverUrl = process.env.NEXUS_URL || "http://localhost:3000";
const agentToken = process.env.NEXUS_TOKEN || "";

buildElectronAgent({ serverUrl, agentToken })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
