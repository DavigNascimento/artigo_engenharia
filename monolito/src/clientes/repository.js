import { pool } from "../compartilhado/db.js";

// Tabela do módulo: clientes.

const clientColumns = "id, nome, telefone, receber_notificacoes, canal";

export async function insertClient({ id, name, phone }) {
  const result = await pool.query(`
    INSERT INTO clientes (id, nome, telefone)
    VALUES ($1, $2, $3)
    RETURNING ${clientColumns}
  `, [id, name, phone]);
  return result.rows[0];
}

export async function deleteClient(id) {
  await pool.query("DELETE FROM clientes WHERE id = $1", [id]);
}

export async function selectClientById(id) {
  const result = await pool.query(`SELECT ${clientColumns} FROM clientes WHERE id = $1`, [id]);
  return result.rows[0];
}

export async function selectClientByPhone(phone) {
  const result = await pool.query(`SELECT ${clientColumns} FROM clientes WHERE telefone = $1`, [phone]);
  return result.rows[0];
}

export async function selectClientsByIds(ids) {
  const result = await pool.query(
    `SELECT ${clientColumns} FROM clientes WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return result.rows;
}

export async function saveNotificationPreferences({ id, enabled, channel }) {
  const result = await pool.query(`
    UPDATE clientes SET receber_notificacoes = $2, canal = $3
    WHERE id = $1
    RETURNING ${clientColumns}
  `, [id, enabled, channel]);
  return result.rows[0];
}
