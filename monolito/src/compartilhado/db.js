import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  application_name: "barbearia-monolito"
});

export async function migrate() {
  const directory = dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(join(directory, "../../migrations/001_init.sql"), "utf8");
  await pool.query(sql);
}

export async function withTransaction(operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
