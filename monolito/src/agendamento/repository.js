import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

const appointmentSelect = `
  SELECT a.id, a.cliente_id, c.nome AS nome_cliente, c.telefone AS telefone_cliente,
         a.barbeiro_id, b.nome AS nome_barbeiro, a.servico_id, s.nome AS nome_servico,
         to_char(a.data, 'YYYY-MM-DD') AS data,
         to_char(a.horario, 'HH24:MI') AS horario,
         a.situacao, a.preco_centavos, a.custo_centavos
  FROM agendamentos a
  JOIN clientes c ON c.id = a.cliente_id
  JOIN barbeiros b ON b.id = a.barbeiro_id
  JOIN servicos s ON s.id = a.servico_id
`;

export async function findReservedSlots(barberId, date, client = pool) {
  const result = await client.query(`
    SELECT to_char(horario, 'HH24:MI') AS horario
    FROM ocupacoes_horario WHERE barbeiro_id = $1 AND data = $2::date
  `, [barberId, date]);
  return new Set(result.rows.map((row) => row.horario));
}

export async function lockCustomerAndCountActive(client, customerId) {
  const customer = await client.query("SELECT id FROM clientes WHERE id = $1 FOR UPDATE", [customerId]);
  if (!customer.rowCount) return null;
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
      (id, cliente_id, barbeiro_id, servico_id, data, horario, situacao, preco_centavos, custo_centavos)
    VALUES ($1, $2, $3, $4, $5::date, $6::time, 'AGENDADO', $7, $8)
  `, [id, appointment.clientId, appointment.barberId, appointment.serviceId,
    appointment.date, appointment.time, appointment.price, appointment.cost]);
  for (const slot of slots) {
    await client.query(`
      INSERT INTO ocupacoes_horario (barbeiro_id, data, horario, agendamento_id)
      VALUES ($1, $2::date, $3::time, $4)
    `, [appointment.barberId, appointment.date, slot, id]);
  }
  const result = await client.query(`${appointmentSelect} WHERE a.id = $1`, [id]);
  return result.rows[0];
}

export async function selectAppointment(id, client = pool) {
  return client.query(`${appointmentSelect} WHERE a.id = $1`, [id]);
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
    ORDER BY a.data ASC, a.horario ASC
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
    barberCondition = `AND a.barbeiro_id = $${values.length}`;
  }
  return pool.query(`
    ${appointmentSelect}
    WHERE a.data >= $1::date AND a.data < $2::date ${barberCondition}
    ORDER BY a.data, a.horario
  `, values);
}
