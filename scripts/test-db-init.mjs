import { getDb } from "../src/lib/db.js";

console.log("Initializing database...");
const db = getDb();
const orgs = db.prepare("SELECT COUNT(*) AS total FROM organizations").get();
console.log("Organizations:", orgs);
const tables = db.prepare("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'").all();
console.log("Tables:", tables.length);
