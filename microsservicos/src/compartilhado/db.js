import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

// Conexão configurada pelas variáveis PGHOST, PGPORT, PGDATABASE, PGUSER e PGPASSWORD.
// PG_POOL_MAX e PG_APPLICATION_NAME são iguais por processo nas duas arquiteturas.
export const pool = new Pool({
  max: Number(process.env.PG_POOL_MAX || 10),
  application_name: process.env.PG_APPLICATION_NAME || "barbearia"
});

export async function migrate(file) {
  const sql = await readFile(file, "utf8");
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
