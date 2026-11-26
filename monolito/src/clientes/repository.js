import { pool } from "../compartilhado/db.js";

export async function insertClient({ id, name, phone, passwordHash }) {
  const result = await pool.query(`
    INSERT INTO clientes (id, nome, telefone, senha_hash)
    VALUES ($1, $2, $3, $4)
    RETURNING id, nome, telefone, receber_notificacoes, canal
  `, [id, name, phone, passwordHash]);
  return result.rows[0];
}

export async function selectClientById(id) {
  const result = await pool.query(`
    SELECT id, nome, telefone, receber_notificacoes, canal
    FROM clientes WHERE id = $1
  `, [id]);
  return result.rows[0];
}

export async function selectClientByPhone(phone) {
  const result = await pool.query(`
    SELECT id, nome, telefone, receber_notificacoes, canal
    FROM clientes WHERE telefone = $1
  `, [phone]);
  return result.rows[0];
}

export async function saveNotificationPreferences({ id, enabled, channel }) {
  const result = await pool.query(`
    UPDATE clientes SET receber_notificacoes = $2, canal = $3
    WHERE id = $1
    RETURNING id, nome, telefone, receber_notificacoes, canal
  `, [id, enabled, channel]);
  return result.rows[0];
}
