const deasync = require("deasync");
const pg = require("pg");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let done = false;
let result;
pool.query("SELECT 1 as ok").then((rows) => {
  result = rows;
  done = true;
});
deasync.loopWhile(() => !done);
console.log("deasync ok:", result.rows);
pool.end();
