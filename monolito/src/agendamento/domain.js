import { shiftDateKey, todayKey } from "../compartilhado/clock.js";
import { isValidDateKey } from "../compartilhado/validation.js";
import { unprocessable } from "../compartilhado/errors.js";

export function toMinutes(value) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function fromMinutes(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function appointmentSlots(date, start, duration, opening, last, reserved) {
  if (!isValidDateKey(date) || typeof start !== "string" || !/^\d{2}:\d{2}$/.test(start)) return null;
  const startMinutes = toMinutes(start);
  const openingMinutes = toMinutes(opening);
  const lastMinutes = toMinutes(last);
  if (startMinutes % 30 !== 0 || startMinutes < openingMinutes || startMinutes > lastMinutes) return null;
  const slots = [];
  for (let offset = 0; offset < duration; offset += 30) {
    const minute = startMinutes + offset;
    const time = fromMinutes(minute);
    if (minute > lastMinutes || ["12:00", "12:30", "13:00"].includes(time)) return null;
    if (reserved.has(time)) return null;
    slots.push(time);
  }
  return slots;
}

export function availableSlots(date, duration, opening, last, reserved = new Set(), referenceDate = todayKey()) {
  if (!isValidDateKey(date) || date < shiftDateKey(referenceDate, 1) || date > shiftDateKey(referenceDate, 30)) return [];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 1) return [];
  const result = [];
  for (let minute = toMinutes(opening); minute <= toMinutes(last); minute += 30) {
    const time = fromMinutes(minute);
    if (appointmentSlots(date, time, duration, opening, last, reserved)) result.push(time);
  }
  return result;
}

export function validateSelectedSlot(date, time, duration, opening, last, reserved, referenceDate = todayKey()) {
  if (!isValidDateKey(date) || date < shiftDateKey(referenceDate, 1) || date > shiftDateKey(referenceDate, 30)) {
    throw unprocessable("A data deve estar entre 1 e 30 dias a partir de hoje.");
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 1) throw unprocessable("A barbearia atende somente de terça-feira a sábado.");
  const slots = appointmentSlots(date, time, duration, opening, last, reserved);
  if (!slots) return null;
  return slots;
}

export function summarizeAppointments(items) {
  const active = items.filter((item) => item.situacao === "AGENDADO");
  const attended = items.filter((item) => item.situacao === "ATENDIDO");
  return {
    total: items.filter((item) => item.situacao !== "CANCELADO").length,
    faturamentoPrevistoCentavos: active.reduce((sum, item) => sum + item.precoCentavos, 0),
    lucroPrevistoCentavos: active.reduce((sum, item) => sum + item.precoCentavos - item.custoCentavos, 0),
    faturamentoRegistradoCentavos: attended.reduce((sum, item) => sum + item.precoCentavos, 0),
    lucroRegistradoCentavos: attended.reduce((sum, item) => sum + item.precoCentavos - item.custoCentavos, 0)
  };
}

export function canTransition(current, action) {
  return current === "AGENDADO" && ["ATENDIDO", "CANCELADO"].includes(action);
}

export function activeAppointmentLimitReached(count) {
  return count >= 2;
}
