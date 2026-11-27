import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

// Tabelas do módulo: barbeiros, servicos.

const serviceColumns = "id, nome, duracao_minutos, preco_centavos, custo_centavos";

export async function listBarberRows(active) {
  return active === undefined
    ? pool.query("SELECT id, nome, ativo FROM barbeiros ORDER BY nome")
    : pool.query("SELECT id, nome, ativo FROM barbeiros WHERE ativo = $1 ORDER BY nome", [active]);
}

export async function findBarberRow(id, includeInactive) {
  return pool.query(
    `SELECT id, nome, ativo FROM barbeiros WHERE id = $1${includeInactive ? "" : " AND ativo = true"}`,
    [id]
  );
}

export async function findBarberRowsByIds(ids) {
  return pool.query("SELECT id, nome, ativo FROM barbeiros WHERE id = ANY($1::uuid[])", [ids]);
}

export async function insertBarber(name) {
  return pool.query(`
    INSERT INTO barbeiros (id, nome) VALUES ($1, $2)
    RETURNING id, nome, ativo
  `, [randomUUID(), name]);
}

export async function saveBarber(id, name) {
  return pool.query(`
    UPDATE barbeiros SET nome = $2 WHERE id = $1
    RETURNING id, nome, ativo
  `, [id, name]);
}

export async function deactivateBarberRow(id) {
  return pool.query(`
    UPDATE barbeiros SET ativo = false WHERE id = $1
    RETURNING id, nome, ativo
  `, [id]);
}

export async function listServiceRows() {
  return pool.query(`SELECT ${serviceColumns} FROM servicos ORDER BY nome`);
}

export async function findServiceRow(id) {
  return pool.query(`SELECT ${serviceColumns} FROM servicos WHERE id = $1`, [id]);
}

export async function findServiceRowsByIds(ids) {
  return pool.query(`SELECT ${serviceColumns} FROM servicos WHERE id = ANY($1::uuid[])`, [ids]);
}

export async function insertService({ nome, duracao, preco, custo }) {
  return pool.query(`
    INSERT INTO servicos (id, nome, duracao_minutos, preco_centavos, custo_centavos)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${serviceColumns}
  `, [randomUUID(), nome, duracao, preco, custo]);
}

export async function saveService(id, { nome, duracao, preco, custo }) {
  return pool.query(`
    UPDATE servicos SET nome = $2, duracao_minutos = $3, preco_centavos = $4, custo_centavos = $5
    WHERE id = $1
    RETURNING ${serviceColumns}
  `, [id, nome, duracao, preco, custo]);
}
