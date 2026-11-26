import { badRequest, forbidden, notFound, unprocessable } from "../compartilhado/errors.js";
import { requireUuid } from "../compartilhado/validation.js";
import { createPaymentIntent } from "./provider.js";
import {
  findAppointmentForPayment, findPaymentByAppointment, hasPayment, insertPayment
} from "./repository.js";

const methods = new Set(["Pix", "Cartão de crédito", "Cartão de débito"]);

function paymentRecord(row) {
  return {
    id: row.id,
    agendamentoId: row.agendamento_id,
    metodo: row.metodo,
    status: row.status,
    referenciaExterna: row.referencia_externa,
    valorCentavos: row.preco_centavos,
    urlConclusao: row.url_conclusao || undefined
  };
}

export async function createPayment(user, appointmentId, input) {
  requireUuid(appointmentId, "Agendamento");
  if (!input || !methods.has(input.metodo)) throw badRequest("Método de pagamento inválido.");
  const appointment = await findAppointmentForPayment(appointmentId);
  if (!appointment) throw notFound("Agendamento não encontrado.");
  if (appointment.cliente_id !== user.id) throw forbidden();
  if (appointment.situacao !== "AGENDADO") {
    throw unprocessable("Somente agendamentos ativos podem receber pagamento.");
  }
  if (await hasPayment(appointmentId)) throw unprocessable("Este agendamento já possui um pagamento.");
  const intent = await createPaymentIntent({
    metodo: input.metodo,
    agendamentoId: appointmentId,
    valorCentavos: appointment.preco_centavos
  });
  try {
    const result = await insertPayment({
      appointmentId,
      method: intent.metodo,
      status: intent.status,
      reference: intent.referenciaExterna
    });
    return { ...paymentRecord(result.rows[0]), valorCentavos: intent.valorCentavos, urlConclusao: intent.urlConclusao };
  } catch (error) {
    if (error.code === "23505") throw unprocessable("Este agendamento já possui um pagamento.");
    throw error;
  }
}

export async function getPayment(user, appointmentId) {
  requireUuid(appointmentId, "Agendamento");
  const result = await findPaymentByAppointment(appointmentId);
  if (!result.rowCount) throw notFound("Pagamento não encontrado.");
  if (user.role === "CLIENTE" && result.rows[0].cliente_id !== user.id) throw forbidden();
  return paymentRecord(result.rows[0]);
}
