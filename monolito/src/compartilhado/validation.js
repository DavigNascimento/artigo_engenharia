import { badRequest, unprocessable } from "./errors.js";
import { shiftDateKey, todayKey } from "./clock.js";

export function validateName(name) {
  return typeof name === "string" && /^[\p{L} ]{3,60}$/u.test(name.trim()) &&
    name.trim().length >= 3 && name.trim().length <= 60;
}

export function validatePhone(phone) {
  return typeof phone === "string" && /^\d{10,11}$/.test(phone);
}

export function requireName(name) {
  if (!validateName(name)) throw badRequest("Nome deve ter de 3 a 60 letras e espaços.");
  return name.trim();
}

export function requirePhone(phone) {
  if (!validatePhone(phone)) throw badRequest("Telefone deve conter DDD e 10 ou 11 dígitos.");
  return phone;
}

export function requirePassword(password) {
  if (typeof password !== "string" || password.length === 0) throw badRequest("Senha obrigatória.");
  return password;
}

export function isValidDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

export function requireAppointmentDate(value, referenceDate = todayKey()) {
  if (!isValidDateKey(value)) throw unprocessable("Data do agendamento inválida.");
  if (value < shiftDateKey(referenceDate, 1) || value > shiftDateKey(referenceDate, 30)) {
    throw unprocessable("A data deve estar entre 1 e 30 dias a partir de hoje.");
  }
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 1) {
    throw unprocessable("A barbearia atende somente de terça-feira a sábado.");
  }
  return value;
}

export function requireTime(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw badRequest("Horário deve estar no formato HH:MM.");
  }
  return value;
}

export function requireIntegerCents(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw badRequest(`${label} deve ser um inteiro não negativo em centavos.`);
  return value;
}

export function requireDuration(value) {
  if (!Number.isInteger(value) || value <= 0 || value % 30 !== 0) {
    throw badRequest("Duração deve ser um múltiplo positivo de 30 minutos.");
  }
  return value;
}

export function requireScheduleConfig(opening, last) {
  const valid = (value) => typeof value === "string" && /^([01]\d|2[0-3]):(00|30)$/.test(value);
  if (!valid(opening) || !valid(last) || opening >= last) {
    throw badRequest("Abertura e último horário devem ser múltiplos de 30 minutos, com abertura anterior ao último horário.");
  }
}

export function requireUuid(value, label = "Identificador") {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw badRequest(`${label} inválido.`);
  }
  return value;
}

export function requireFields(body, fields) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw badRequest("Corpo JSON inválido.");
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw badRequest(`Campo obrigatório: ${field}.`);
    }
  }
}
