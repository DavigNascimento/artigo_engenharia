import { now, todayKey, localHourMinute } from "../compartilhado/clock.js";
import { agendamento, clientes } from "./dependencias.js";

// Módulo sem tabelas próprias: consulta agendamento e clientes pelas interfaces públicas.

export const sentNotifications = [];

export async function simulatedSender(notification) {
  sentNotifications.push(notification);
}

export function notificationsForAppointments(appointments) {
  return appointments.flatMap((appointment) => [
    ...(appointment.receber_notificacoes ? [{
      agendamentoId: appointment.agendamento_id,
      perfilDestinatario: "CLIENTE",
      destinatarioId: appointment.cliente_id,
      canal: appointment.canal
    }] : []),
    {
      agendamentoId: appointment.agendamento_id,
      perfilDestinatario: "BARBEARIA",
      destinatarioId: appointment.barbeiro_id,
      canal: "WhatsApp"
    }
  ]);
}

export async function runDailyNotifications(sender = simulatedSender, date = todayKey()) {
  const scheduled = await agendamento.listarAgendadosDoDia(date);
  if (!scheduled.length) return 0;
  const customers = await clientes.buscarClientesPorIds([...new Set(scheduled.map((item) => item.clienteId))]);
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const rows = scheduled.map((item) => ({
    agendamento_id: item.id,
    cliente_id: item.clienteId,
    barbeiro_id: item.barbeiroId,
    receber_notificacoes: customerById.get(item.clienteId)?.receberNotificacoes ?? false,
    canal: customerById.get(item.clienteId)?.canal ?? "WhatsApp"
  }));
  for (const notification of notificationsForAppointments(rows)) await sender(notification);
  return scheduled.length;
}

// Rotina diária (RF25): roda às 09:00 (America/Sao_Paulo), uma vez por dia por processo.
export function startDailyNotifications() {
  let running = false;
  let lastRunDate = null;
  const runIfDue = async () => {
    const date = todayKey(now());
    if (running || lastRunDate === date || localHourMinute(now()) !== "09:00") return;
    running = true;
    try {
      await runDailyNotifications(simulatedSender, date);
      lastRunDate = date;
    } catch {
      console.error(JSON.stringify({ evento: "falha_notificacao_diaria" }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(runIfDue, 60_000);
  timer.unref();
  return timer;
}
