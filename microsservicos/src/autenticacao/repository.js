import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

// Tabelas do módulo: usuarios_barbearia, credenciais_clientes.

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
    "SELECT cliente_id AS id, senha_hash FROM credenciais_clientes WHERE telefone = $1",
    [phone]
  );
  return result.rows[0];
}

// O telefone já foi reservado pelo módulo clientes (dono da unicidade). Uma credencial
// anterior com o mesmo telefone só pode ter sobrado de um cadastro desfeito, então é substituída.
export async function upsertClientCredentials({ clientId, phone, passwordHash }) {
  await pool.query(`
    INSERT INTO credenciais_clientes (cliente_id, telefone, senha_hash)
    VALUES ($1, $2, $3)
    ON CONFLICT (telefone) DO UPDATE
      SET cliente_id = EXCLUDED.cliente_id, senha_hash = EXCLUDED.senha_hash
  `, [clientId, phone, passwordHash]);
}

export async function deleteClientCredentials(clientId) {
  await pool.query("DELETE FROM credenciais_clientes WHERE cliente_id = $1", [clientId]);
}
