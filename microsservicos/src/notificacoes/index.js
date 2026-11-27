import { now, todayKey, localHourMinute } from "../compartilhado/clock.js";
import { findAppointmentsForNotification, reserveDailyRun } from "./repository.js";

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

export async function runDailyNotifications(sender = simulatedSender) {
  const date = todayKey();
  const lock = await reserveDailyRun(date);
  if (!lock.rowCount) return 0;
  const result = await findAppointmentsForNotification(date);
  for (const notification of notificationsForAppointments(result.rows)) await sender(notification);
  return result.rowCount;
}

export function startDailyNotifications() {
  let running = false;
  let lastRunDate = null;
  const runIfDue = async () => {
    const date = todayKey(now());
    if (running || lastRunDate === date || localHourMinute(now()) !== "09:00") return;
    running = true;
    try {
      await runDailyNotifications();
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
