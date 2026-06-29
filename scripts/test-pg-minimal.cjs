const { createPgDatabase } = require("../src/lib/pg-adapter.cjs");

console.log("connecting...");
const db = createPgDatabase(process.env.DATABASE_URL);
console.log("creating org table...");
db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
  );
`);
console.log("counting...");
console.log(db.prepare("SELECT COUNT(*) AS total FROM organizations").get());
console.log("done");
