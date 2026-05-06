import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function query(text, params = []) {
  const result = await pool.query(text, params);
  return result;
}
