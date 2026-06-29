import { createRequire } from "node:module";
import pg from "pg";

const require = createRequire(import.meta.url);
const deasync = require("deasync");
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let done = false;
let result;
pool.query("SELECT 1 as ok").then((rows) => {
  result = rows;
  done = true;
});
deasync.loopWhile(() => !done);
console.log("createRequire deasync ok:", result.rows);
await pool.end();
