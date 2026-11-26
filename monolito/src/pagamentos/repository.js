import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

export async function findAppointmentForPayment(appointmentId) {
  const result = await pool.query(`
    SELECT id, cliente_id, situacao, preco_centavos
    FROM agendamentos WHERE id = $1
  `, [appointmentId]);
  return result.rows[0];
}

export async function hasPayment(appointmentId) {
  const result = await pool.query("SELECT id FROM pagamentos WHERE agendamento_id = $1", [appointmentId]);
  return result.rowCount > 0;
}

export async function insertPayment({ appointmentId, method, status, reference }) {
  return pool.query(`
    INSERT INTO pagamentos (id, agendamento_id, metodo, status, referencia_externa)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, agendamento_id, metodo, status, referencia_externa
  `, [randomUUID(), appointmentId, method, status, reference]);
}

export async function findPaymentByAppointment(appointmentId) {
  return pool.query(`
    SELECT p.id, p.agendamento_id, p.metodo, p.status, p.referencia_externa,
           a.preco_centavos, a.cliente_id
    FROM pagamentos p
    JOIN agendamentos a ON a.id = p.agendamento_id
    WHERE p.agendamento_id = $1
  `, [appointmentId]);
}
