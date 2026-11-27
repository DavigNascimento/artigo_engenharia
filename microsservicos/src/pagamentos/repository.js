import { randomUUID } from "node:crypto";
import { pool } from "../compartilhado/db.js";

// Tabela do módulo: pagamentos. Guarda o cliente e o valor do agendamento no momento do
// pagamento; nunca guarda dados de cartão (RNF5).

const paymentColumns = "id, agendamento_id, cliente_id, metodo, status, referencia_externa, valor_centavos";

export async function hasPayment(appointmentId) {
  const result = await pool.query("SELECT id FROM pagamentos WHERE agendamento_id = $1", [appointmentId]);
  return result.rowCount > 0;
}

export async function insertPayment({ appointmentId, clientId, method, status, reference, amount }) {
  return pool.query(`
    INSERT INTO pagamentos (id, agendamento_id, cliente_id, metodo, status, referencia_externa, valor_centavos)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING ${paymentColumns}
  `, [randomUUID(), appointmentId, clientId, method, status, reference, amount]);
}

export async function findPaymentByAppointment(appointmentId) {
  return pool.query(`SELECT ${paymentColumns} FROM pagamentos WHERE agendamento_id = $1`, [appointmentId]);
}

export async function deletePaymentByAppointment(appointmentId) {
  return pool.query("DELETE FROM pagamentos WHERE agendamento_id = $1", [appointmentId]);
}
