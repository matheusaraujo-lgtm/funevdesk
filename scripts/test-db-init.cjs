const { getDb } = require("../src/lib/db-native.cjs");

console.log("Initializing database...");
const db = getDb();
const orgs = db.prepare("SELECT COUNT(*) AS total FROM organizations").get();
console.log("Organizations:", orgs);
