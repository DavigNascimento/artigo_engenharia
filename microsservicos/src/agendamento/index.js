import { withTransaction } from "../compartilhado/db.js";
import {
  badRequest, conflict, forbidden, notFound, unprocessable
} from "../compartilhado/errors.js";
import {
  isValidDateKey, requireAppointmentDate, requireFields, requireName, requirePhone, requireTime, requireUuid
} from "../compartilhado/validation.js";
import { shiftDateKey } from "../compartilhado/clock.js";
import { findClientByPhone } from "../clientes/index.js";
import { getBarber, getOpeningHours, getService } from "../catalogo/index.js";
import {
  activeAppointmentLimitReached, appointmentSlots, availableSlots, canTransition, summarizeAppointments
} from "./domain.js";
import {
  findReservedSlots, insertAppointment, lockAppointment, lockCustomerAndCountActive,
  removeAppointment, saveAppointmentStatus, selectAppointment, selectAppointmentRows,
  selectStatistics
} from "./repository.js";

function appointmentRecord(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nomeCliente: row.nome_cliente,
    telefoneCliente: row.telefone_cliente,
    barbeiroId: row.barbeiro_id,
    nomeBarbeiro: row.nome_barbeiro,
    servicoId: row.servico_id,
    nomeServico: row.nome_servico,
    data: row.data,
    horario: row.horario,
    situacao: row.situacao,
    precoCentavos: row.preco_centavos,
    custoCentavos: row.custo_centavos
  };
}

export async function getAvailability({ barberId, date, serviceId }) {
  if (!barberId || !date || !serviceId) throw badRequest("Informe barbeiroId, data e servicoId.");
  requireUuid(barberId, "Barbeiro");
  requireUuid(serviceId, "Serviço");
  if (!isValidDateKey(date)) {
    throw badRequest("Data deve estar no formato AAAA-MM-DD.");
  }
  const [barber, service, hours] = await Promise.all([
    getBarber(barberId),
    getService(serviceId),
    getOpeningHours()
  ]);
  const reserved = await findReservedSlots(barberId, date);
  return {
    horarios: availableSlots(date, service.duracaoMinutos, hours.horaAbertura, hours.ultimoHorario, reserved)
  };
}

export async function createAppointment(user, input) {
  requireFields(input, ["barbeiroId", "servicoId", "data", "horario"]);
  const barberId = requireUuid(input.barbeiroId, "Barbeiro");
  const serviceId = requireUuid(input.servicoId, "Serviço");
  const time = requireTime(input.horario);
  const date = requireAppointmentDate(input.data);
  let clientId = user.id;
  if (user.role === "BARBEARIA") {
    requireFields(input, ["nome", "telefone"]);
    const nome = requireName(input.nome);
    const telefone = requirePhone(input.telefone);
    const registeredClient = await findClientByPhone(telefone);
    if (registeredClient.nome !== nome) throw badRequest("Nome e telefone não correspondem ao cadastro.");
    clientId = registeredClient.id;
  }

  try {
    return await withTransaction(async (client) => {
      const activeCount = await lockCustomerAndCountActive(client, clientId);
      if (activeCount === null) throw notFound("Cliente não encontrado.");
      if (activeAppointmentLimitReached(activeCount)) {
        throw unprocessable("O cliente já possui 2 agendamentos ativos.");
      }

      const barber = await getBarber(barberId, true, client);
      if (!barber.ativo) throw unprocessable("Barbeiro inativo.");
      const service = await getService(serviceId, client);
      const hours = await getOpeningHours(client);
      const reserved = await findReservedSlots(barberId, date, client);
      const slots = appointmentSlots(date, time, service.duracaoMinutos,
        hours.horaAbertura, hours.ultimoHorario, new Set());
      if (!slots) throw unprocessable("Data, horário ou duração fora do expediente.");
      if (slots.some((slot) => reserved.has(slot))) {
        throw conflict("Horário ocupado para este barbeiro.");
      }

      const row = await insertAppointment(client, {
        clientId, barberId, serviceId, date, time,
        price: service.precoCentavos, cost: service.custoCentavos
      }, slots);
      return appointmentRecord(row);
    });
  } catch (error) {
    if (error.code === "23505" && error.constraint === "ocupacoes_horario_pkey") {
      throw conflict("Horário ocupado para este barbeiro.");
    }
    throw error;
  }
}

function allowedSituations(value) {
  if (!["AGENDADO", "ATENDIDO", "CANCELADO"].includes(value)) {
    throw badRequest("Situação inválida.");
  }
}

export async function listAppointments(user, query) {
  const filters = [];
  const add = (sql, value) => filters.push([sql, value]);
  if (user.role === "CLIENTE") add("a.cliente_id = ?", user.id);
  if (query.nomeCliente !== undefined) {
    if (typeof query.nomeCliente !== "string") throw badRequest("nomeCliente inválido.");
    add("c.nome ILIKE ?", `%${query.nomeCliente}%`);
  }
  if (query.barbeiroId !== undefined) {
    add("a.barbeiro_id = ?", requireUuid(query.barbeiroId, "Barbeiro"));
  }
  if (query.data !== undefined) {
    if (!isValidDateKey(query.data)) {
      throw badRequest("data deve estar no formato AAAA-MM-DD.");
    }
    add("a.data = ?::date", query.data);
  }
  if (query.situacao !== undefined) {
    allowedSituations(query.situacao);
    add("a.situacao = ?", query.situacao);
  }
  const result = await selectAppointmentRows(filters);
  const itens = result.rows.map(appointmentRecord);
  const summary = summarizeAppointments(itens);
  return {
    itens,
    total: summary.total,
    faturamentoPrevistoCentavos: summary.faturamentoPrevistoCentavos
  };
}

export async function getAppointment(id, user) {
  requireUuid(id, "Agendamento");
  const result = await selectAppointment(id);
  if (!result.rowCount) throw notFound("Agendamento não encontrado.");
  const item = appointmentRecord(result.rows[0]);
  if (user.role === "CLIENTE" && item.clienteId !== user.id) throw forbidden();
  return item;
}

export async function changeAppointmentStatus(id, user, nextStatus) {
  requireUuid(id, "Agendamento");
  return withTransaction(async (client) => {
    const result = await lockAppointment(id, client);
    if (!result.rowCount) throw notFound("Agendamento não encontrado.");
    const row = result.rows[0];
    if (user.role === "CLIENTE" && row.cliente_id !== user.id) throw forbidden();
    if (!canTransition(row.situacao, nextStatus)) {
      throw unprocessable("Somente agendamentos ativos podem ser atendidos ou cancelados.");
    }
    const updated = await saveAppointmentStatus(id, nextStatus, client);
    return appointmentRecord(updated.rows[0]);
  });
}

export async function deleteAppointment(id) {
  requireUuid(id, "Agendamento");
  const result = await removeAppointment(id);
  if (!result.rowCount) throw notFound("Agendamento não encontrado.");
}

export async function getStatistics(query) {
  const { periodo, referencia, barbeiroId } = query;
  if (!["dia", "mes", "ano"].includes(periodo)) throw badRequest("periodo deve ser dia, mes ou ano.");
  let start;
  let end;
  if (periodo === "dia" && typeof referencia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(referencia)) {
    const [year, month, day] = referencia.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw badRequest("referencia inválida.");
    }
    start = referencia;
    end = shiftDateKey(referencia, 1);
  } else if (periodo === "mes" && typeof referencia === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(referencia)) {
    start = `${referencia}-01`;
    const [year, month] = referencia.split("-").map(Number);
    end = shiftDateKey(`${year}-${String(month).padStart(2, "0")}-01`, new Date(Date.UTC(year, month, 0)).getUTCDate());
  } else if (periodo === "ano" && typeof referencia === "string" && /^\d{4}$/.test(referencia)) {
    start = `${referencia}-01-01`;
    end = `${Number(referencia) + 1}-01-01`;
  } else {
    throw badRequest("referencia incompatível com o período.");
  }
  if (barbeiroId !== undefined) requireUuid(barbeiroId, "Barbeiro");
  const result = await selectStatistics(start, end, barbeiroId);
  const agendamentos = result.rows.map(appointmentRecord);
  const totals = summarizeAppointments(agendamentos);
  return {
    periodo,
    referencia,
    total: totals.total,
    agendados: agendamentos.filter((item) => item.situacao === "AGENDADO").length,
    atendidos: agendamentos.filter((item) => item.situacao === "ATENDIDO").length,
    cancelados: agendamentos.filter((item) => item.situacao === "CANCELADO").length,
    faturamentoPrevistoCentavos: totals.faturamentoPrevistoCentavos,
    faturamentoRegistradoCentavos: totals.faturamentoRegistradoCentavos,
    lucroPrevistoCentavos: totals.lucroPrevistoCentavos,
    lucroRegistradoCentavos: totals.lucroRegistradoCentavos,
    agendamentos
  };
}
