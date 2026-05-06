import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "..", "sql", "schema.sql");

async function main() {
  const sql = await readFile(schemaPath, "utf8");
  await pool.query(sql);
  await pool.end();
  console.log("Database schema applied");
}

main().catch(async (error) => {
  console.error("Database migration failed:", error.message);
  await pool.end().catch(() => null);
  process.exit(1);
});
