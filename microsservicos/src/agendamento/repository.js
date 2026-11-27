import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

// Tabelas do módulo: agendamentos, ocupacoes_horario, configuracao_expediente.
// Dados de clientes, barbeiros e serviços vêm das interfaces dos outros módulos;
// aqui só ficam os identificadores, o nome do cliente (para a busca do RF15) e o
// preço e o custo congelados no momento do agendamento (RF23, RFA3).

const appointmentSelect = `
  SELECT id, cliente_id, nome_cliente, barbeiro_id, servico_id,
         to_char(data, 'YYYY-MM-DD') AS data,
         to_char(horario, 'HH24:MI') AS horario,
         situacao, preco_centavos, custo_centavos
  FROM agendamentos
`;

export async function findReservedSlots(barberId, date, client = pool) {
  const result = await client.query(`
    SELECT to_char(horario, 'HH24:MI') AS horario
    FROM ocupacoes_horario WHERE barbeiro_id = $1 AND data = $2::date
  `, [barberId, date]);
  return new Set(result.rows.map((row) => row.horario));
}

// Serializa os agendamentos de um mesmo cliente (RF11) sem acessar a tabela de clientes.
export async function lockCustomerAndCountActive(client, customerId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [customerId]);
  const active = await client.query(`
    SELECT count(*)::int AS total FROM agendamentos
    WHERE cliente_id = $1 AND situacao = 'AGENDADO'
  `, [customerId]);
  return active.rows[0].total;
}

export async function insertAppointment(client, appointment, slots) {
  const id = randomUUID();
  await client.query(`
    INSERT INTO agendamentos
      (id, cliente_id, nome_cliente, barbeiro_id, servico_id, data, horario, situacao,
       preco_centavos, custo_centavos)
    VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, 'AGENDADO', $8, $9)
  `, [id, appointment.clientId, appointment.clientName, appointment.barberId, appointment.serviceId,
    appointment.date, appointment.time, appointment.price, appointment.cost]);
  for (const slot of slots) {
    await client.query(`
      INSERT INTO ocupacoes_horario (barbeiro_id, data, horario, agendamento_id)
      VALUES ($1, $2::date, $3::time, $4)
    `, [appointment.barberId, appointment.date, slot, id]);
  }
  const result = await client.query(`${appointmentSelect} WHERE id = $1`, [id]);
  return result.rows[0];
}

export async function selectAppointment(id, client = pool) {
  return client.query(`${appointmentSelect} WHERE id = $1`, [id]);
}

export async function selectAppointmentRows(filters) {
  const conditions = [];
  const values = [];
  for (const [sql, value] of filters) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return pool.query(`
    ${appointmentSelect} ${where}
    ORDER BY data ASC, horario ASC
  `, values);
}

export async function lockAppointment(id, client) {
  return client.query(`
    SELECT id, cliente_id, situacao FROM agendamentos WHERE id = $1 FOR UPDATE
  `, [id]);
}

export async function saveAppointmentStatus(id, status, client) {
  await client.query("UPDATE agendamentos SET situacao = $2 WHERE id = $1", [id, status]);
  if (status !== "AGENDADO") {
    await client.query("DELETE FROM ocupacoes_horario WHERE agendamento_id = $1", [id]);
  }
  return selectAppointment(id, client);
}

export async function removeAppointment(id) {
  return pool.query("DELETE FROM agendamentos WHERE id = $1", [id]);
}

export async function selectStatistics(start, end, barberId) {
  const values = [start, end];
  let barberCondition = "";
  if (barberId) {
    values.push(barberId);
    barberCondition = `AND barbeiro_id = $${values.length}`;
  }
  return pool.query(`
    ${appointmentSelect}
    WHERE data >= $1::date AND data < $2::date ${barberCondition}
    ORDER BY data, horario
  `, values);
}

export async function selectAppointmentForPayment(id) {
  const result = await pool.query(`
    SELECT id, cliente_id, situacao, preco_centavos
    FROM agendamentos WHERE id = $1
  `, [id]);
  return result.rows[0];
}

export async function selectScheduledForDay(date) {
  const result = await pool.query(`
    SELECT id, cliente_id, barbeiro_id
    FROM agendamentos
    WHERE data = $1::date AND situacao = 'AGENDADO'
    ORDER BY horario
  `, [date]);
  return result.rows;
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
