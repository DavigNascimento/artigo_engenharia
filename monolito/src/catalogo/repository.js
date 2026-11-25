import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

export async function listBarberRows(active) {
  return active === undefined
    ? pool.query("SELECT id, nome, ativo FROM barbeiros ORDER BY nome")
    : pool.query("SELECT id, nome, ativo FROM barbeiros WHERE ativo = $1 ORDER BY nome", [active]);
}

export async function findBarberRow(id, includeInactive, client = pool) {
  return client.query(
    `SELECT id, nome, ativo FROM barbeiros WHERE id = $1${includeInactive ? "" : " AND ativo = true"}`,
    [id]
  );
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
  return pool.query(`
    SELECT id, nome, duracao_minutos, preco_centavos, custo_centavos
    FROM servicos ORDER BY nome
  `);
}

export async function findServiceRow(id, client = pool) {
  return client.query(`
    SELECT id, nome, duracao_minutos, preco_centavos, custo_centavos
    FROM servicos WHERE id = $1
  `, [id]);
}

export async function insertService({ name, duration, price, cost }) {
  return pool.query(`
    INSERT INTO servicos (id, nome, duracao_minutos, preco_centavos, custo_centavos)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nome, duracao_minutos, preco_centavos, custo_centavos
  `, [randomUUID(), name, duration, price, cost]);
}

export async function saveService(id, { name, duration, price, cost }) {
  return pool.query(`
    UPDATE servicos SET nome = $2, duracao_minutos = $3, preco_centavos = $4, custo_centavos = $5
    WHERE id = $1
    RETURNING id, nome, duracao_minutos, preco_centavos, custo_centavos
  `, [id, name, duration, price, cost]);
}

export async function selectOpeningHours(client = pool) {
  return client.query(`
    SELECT to_char(hora_abertura, 'HH24:MI') AS hora_abertura,
           to_char(ultimo_horario, 'HH24:MI') AS ultimo_horario
    FROM configuracao_expediente WHERE singleton = true
  `);
}

export async function saveOpeningHours(opening, last) {
  return pool.query(`
    UPDATE configuracao_expediente
    SET hora_abertura = $1::time, ultimo_horario = $2::time
    WHERE singleton = true
    RETURNING to_char(hora_abertura, 'HH24:MI') AS hora_abertura,
              to_char(ultimo_horario, 'HH24:MI') AS ultimo_horario
  `, [opening, last]);
}
