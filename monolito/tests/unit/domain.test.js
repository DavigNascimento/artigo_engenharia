import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../src/compartilhado/errors.js";
import {
  isValidDateKey, requireAppointmentDate, requireScheduleConfig, validateName, validatePhone
} from "../../src/compartilhado/validation.js";
import {
  activeAppointmentLimitReached, appointmentSlots, availableSlots,
  canTransition, summarizeAppointments
} from "../../src/agendamento/domain.js";
import { notificationsForAppointments } from "../../src/notificacoes/index.js";

test("RF2/RF3: valida nome acentuado e telefone só com DDD e 10 ou 11 dígitos", () => {
  assert.equal(validateName("João da Silva"), true);
  assert.equal(validateName("A1a"), false);
  assert.equal(validateName("Ab"), false);
  assert.equal(validateName("x".repeat(61)), false);
  assert.equal(validatePhone("82999998888"), true);
  assert.equal(validatePhone("8299999888"), true);
  assert.equal(validatePhone("(82)999998888"), false);
  assert.equal(validatePhone("829999988888"), false);
});

test("RF4/RF5: aceita os limites de antecedência e rejeita hoje, datas fora da janela e dias fechados", () => {
  assert.equal(isValidDateKey("2026-02-29"), false);
  assert.equal(requireAppointmentDate("2026-12-02", "2026-12-01"), "2026-12-02");
  assert.equal(requireAppointmentDate("2026-12-31", "2026-12-01"), "2026-12-31");
  for (const date of ["2026-12-01", "2027-01-01", "2026-12-06", "2026-12-07"]) {
    assert.throws(() => requireAppointmentDate(date, "2026-12-01"), (error) =>
      error instanceof AppError && error.status === 422);
  }
});

test("RF6/RF7/RF10/RF24: produz 16 horários de corte e 14 de corte e barba", () => {
  const date = "2026-12-02";
  const haircuts = availableSlots(date, 30, "09:00", "18:00", new Set(), "2026-12-01");
  const combo = availableSlots(date, 60, "09:00", "18:00", new Set(), "2026-12-01");
  assert.equal(haircuts.length, 16);
  assert.equal(combo.length, 14);
  assert.deepEqual(haircuts.filter((time) => ["12:00", "12:30", "13:00"].includes(time)), []);
  assert.equal(combo.includes("11:30"), false);
  assert.equal(combo.includes("18:00"), false);
  assert.equal(combo.includes("17:30"), true);
  assert.equal(appointmentSlots(date, "09:15", 30, "09:00", "18:00", new Set()), null);
});

test("RF8/RF9/RF10: reserva os blocos consecutivos e libera slots cancelados", () => {
  const reserved = new Set(["14:30"]);
  assert.equal(appointmentSlots("2026-12-02", "14:00", 60, "09:00", "18:00", reserved), null);
  assert.deepEqual(appointmentSlots("2026-12-02", "14:00", 60, "09:00", "18:00", new Set()), ["14:00", "14:30"]);
  assert.equal(appointmentSlots("2026-12-02", "11:30", 60, "09:00", "18:00", new Set()), null);
  assert.equal(appointmentSlots("2026-12-02", "18:00", 60, "09:00", "18:00", new Set()), null);
  assert.deepEqual(appointmentSlots("2026-12-02", "18:00", 30, "09:00", "18:00", new Set()), ["18:00"]);
});

test("RF11: limita clientes a dois agendamentos ativos", () => {
  assert.equal(activeAppointmentLimitReached(1), false);
  assert.equal(activeAppointmentLimitReached(2), true);
});

test("RF13: só permite atender ou cancelar agendamentos ativos", () => {
  assert.equal(canTransition("AGENDADO", "ATENDIDO"), true);
  assert.equal(canTransition("AGENDADO", "CANCELADO"), true);
  assert.equal(canTransition("ATENDIDO", "CANCELADO"), false);
  assert.equal(canTransition("CANCELADO", "ATENDIDO"), false);
});

test("RF16/RF17/RFA3: exclui cancelados dos totais e soma preço e lucro por situação", () => {
  const result = summarizeAppointments([
    { situacao: "AGENDADO", precoCentavos: 3500, custoCentavos: 1500 },
    { situacao: "ATENDIDO", precoCentavos: 2500, custoCentavos: 500 },
    { situacao: "CANCELADO", precoCentavos: 5500, custoCentavos: 1000 }
  ]);
  assert.deepEqual(result, {
    total: 2,
    faturamentoPrevistoCentavos: 3500,
    lucroPrevistoCentavos: 2000,
    faturamentoRegistradoCentavos: 2500,
    lucroRegistradoCentavos: 2000
  });
});

test("RFA4: valida horário de abertura e último horário em intervalos de 30 minutos", () => {
  assert.doesNotThrow(() => requireScheduleConfig("10:00", "17:00"));
  assert.throws(() => requireScheduleConfig("10:15", "17:00"));
  assert.throws(() => requireScheduleConfig("17:00", "10:00"));
});

test("RF25/RF27: notifica barbeiro no dia e respeita a preferência do cliente", () => {
  const notifications = notificationsForAppointments([
    {
      agendamento_id: "a1",
      cliente_id: "c1",
      barbeiro_id: "b1",
      receber_notificacoes: false,
      canal: "WhatsApp"
    },
    {
      agendamento_id: "a2",
      cliente_id: "c2",
      barbeiro_id: "b2",
      receber_notificacoes: true,
      canal: "WhatsApp"
    }
  ]);
  assert.deepEqual(notifications.map((item) => item.perfilDestinatario), [
    "BARBEARIA", "CLIENTE", "BARBEARIA"
  ]);
  assert.equal(notifications.every((item) => item.canal === "WhatsApp"), true);
});
