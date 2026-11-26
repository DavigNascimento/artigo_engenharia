import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

export async function saveBarbershopUser(login, passwordHash) {
  await pool.query(`
    INSERT INTO usuarios_barbearia (id, login, senha_hash)
    VALUES ($1, $2, $3)
    ON CONFLICT (login) DO UPDATE SET senha_hash = EXCLUDED.senha_hash
  `, [randomUUID(), login, passwordHash]);
}

export async function findBarbershopCredentials(login) {
  const result = await pool.query(
    "SELECT id, senha_hash FROM usuarios_barbearia WHERE login = $1",
    [login]
  );
  return result.rows[0];
}

export async function findClientCredentials(phone) {
  const result = await pool.query(
    "SELECT id, senha_hash FROM clientes WHERE telefone = $1",
    [phone]
  );
  return result.rows[0];
}
