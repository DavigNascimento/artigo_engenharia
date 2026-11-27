import { withTransaction } from "../compartilhado/db.js";
import {
  badRequest, conflict, forbidden, notFound, unprocessable
} from "../compartilhado/errors.js";
import {
  isValidDateKey, requireAppointmentDate, requireFields, requireName, requirePhone,
  requireScheduleConfig, requireTime, requireUuid
} from "../compartilhado/validation.js";
import { shiftDateKey } from "../compartilhado/clock.js";
import { catalogo, clientes, pagamentos } from "./dependencias.js";
import {
  activeAppointmentLimitReached, appointmentSlots, availableSlots, canTransition, summarizeAppointments
} from "./domain.js";
import {
  findReservedSlots, insertAppointment, lockAppointment, lockCustomerAndCountActive,
  removeAppointment, saveAppointmentStatus, saveOpeningHours, selectAppointment,
  selectAppointmentForPayment, selectAppointmentRows, selectOpeningHours, selectScheduledForDay,
  selectStatistics
} from "./repository.js";

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

function appointmentRecord(row, related) {
  return {
    id: row.id,
    clienteId: row.cliente_id,
    nomeCliente: row.nome_cliente,
    telefoneCliente: related.clientes.get(row.cliente_id)?.telefone ?? null,
    barbeiroId: row.barbeiro_id,
    nomeBarbeiro: related.barbeiros.get(row.barbeiro_id)?.nome ?? null,
    servicoId: row.servico_id,
    nomeServico: related.servicos.get(row.servico_id)?.nome ?? null,
    data: row.data,
    horario: row.horario,
    situacao: row.situacao,
    precoCentavos: row.preco_centavos,
    custoCentavos: row.custo_centavos
  };
}

// Completa os agendamentos com telefone do cliente e nomes do barbeiro e do serviço,
// consultando os módulos donos desses dados em lote (três consultas em paralelo).
async function withRelatedData(rows) {
  if (!rows.length) return [];
  const unique = (field) => [...new Set(rows.map((row) => row[field]))];
  const [clientList, barberList, serviceList] = await Promise.all([
    clientes.buscarClientesPorIds(unique("cliente_id")),
    catalogo.buscarBarbeirosPorIds(unique("barbeiro_id")),
    catalogo.buscarServicosPorIds(unique("servico_id"))
  ]);
  const related = { clientes: byId(clientList), barbeiros: byId(barberList), servicos: byId(serviceList) };
  return rows.map((row) => appointmentRecord(row, related));
}

export async function getOpeningHours(client) {
  const result = await selectOpeningHours(client);
  if (!result.rowCount) throw new Error("Configuração do expediente ausente.");
  return { horaAbertura: result.rows[0].hora_abertura, ultimoHorario: result.rows[0].ultimo_horario };
}

export async function setOpeningHours(input) {
  requireFields(input, ["horaAbertura", "ultimoHorario"]);
  const { horaAbertura, ultimoHorario } = input;
  requireScheduleConfig(horaAbertura, ultimoHorario);
  const result = await saveOpeningHours(horaAbertura, ultimoHorario);
  return { horaAbertura: result.rows[0].hora_abertura, ultimoHorario: result.rows[0].ultimo_horario };
}

export async function getAvailability({ barberId, date, serviceId }) {
  if (!barberId || !date || !serviceId) throw badRequest("Informe barbeiroId, data e servicoId.");
  requireUuid(barberId, "Barbeiro");
  requireUuid(serviceId, "Serviço");
  if (!isValidDateKey(date)) {
    throw badRequest("Data deve estar no formato AAAA-MM-DD.");
  }
  const [, service, hours, reserved] = await Promise.all([
    catalogo.getBarber(barberId),
    catalogo.getService(serviceId),
    getOpeningHours(),
    findReservedSlots(barberId, date)
  ]);
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
  let customer;
  if (user.role === "BARBEARIA") {
    requireFields(input, ["nome", "telefone"]);
    const nome = requireName(input.nome);
    const telefone = requirePhone(input.telefone);
    customer = await clientes.findClientByPhone(telefone);
    if (customer.nome !== nome) throw badRequest("Nome e telefone não correspondem ao cadastro.");
  } else {
    customer = await clientes.buscarClientePorId(user.id);
  }
  const [barber, service] = await Promise.all([
    catalogo.getBarber(barberId, true),
    catalogo.getService(serviceId)
  ]);

  try {
    return await withTransaction(async (client) => {
      const activeCount = await lockCustomerAndCountActive(client, customer.id);
      if (activeAppointmentLimitReached(activeCount)) {
        throw unprocessable("O cliente já possui 2 agendamentos ativos.");
      }
      if (!barber.ativo) throw unprocessable("Barbeiro inativo.");
      const hours = await getOpeningHours(client);
      const reserved = await findReservedSlots(barberId, date, client);
      const slots = appointmentSlots(date, time, service.duracaoMinutos,
        hours.horaAbertura, hours.ultimoHorario, new Set());
      if (!slots) throw unprocessable("Data, horário ou duração fora do expediente.");
      if (slots.some((slot) => reserved.has(slot))) {
        throw conflict("Horário ocupado para este barbeiro.");
      }

      const row = await insertAppointment(client, {
        clientId: customer.id, clientName: customer.nome, barberId, serviceId, date, time,
        price: service.precoCentavos, cost: service.custoCentavos
      }, slots);
      return appointmentRecord(row, {
        clientes: byId([customer]), barbeiros: byId([barber]), servicos: byId([service])
      });
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
  if (user.role === "CLIENTE") add("cliente_id = ?", user.id);
  if (query.nomeCliente !== undefined) {
    if (typeof query.nomeCliente !== "string") throw badRequest("nomeCliente inválido.");
    add("nome_cliente ILIKE ?", `%${query.nomeCliente}%`);
  }
  if (query.barbeiroId !== undefined) {
    add("barbeiro_id = ?", requireUuid(query.barbeiroId, "Barbeiro"));
  }
  if (query.data !== undefined) {
    if (!isValidDateKey(query.data)) {
      throw badRequest("data deve estar no formato AAAA-MM-DD.");
    }
    add("data = ?::date", query.data);
  }
  if (query.situacao !== undefined) {
    allowedSituations(query.situacao);
    add("situacao = ?", query.situacao);
  }
  const result = await selectAppointmentRows(filters);
  const itens = await withRelatedData(result.rows);
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
  const row = result.rows[0];
  if (user.role === "CLIENTE" && row.cliente_id !== user.id) throw forbidden();
  const [item] = await withRelatedData([row]);
  return item;
}

export async function changeAppointmentStatus(id, user, nextStatus) {
  requireUuid(id, "Agendamento");
  const updated = await withTransaction(async (client) => {
    const result = await lockAppointment(id, client);
    if (!result.rowCount) throw notFound("Agendamento não encontrado.");
    const row = result.rows[0];
    if (user.role === "CLIENTE" && row.cliente_id !== user.id) throw forbidden();
    if (!canTransition(row.situacao, nextStatus)) {
      throw unprocessable("Somente agendamentos ativos podem ser atendidos ou cancelados.");
    }
    return saveAppointmentStatus(id, nextStatus, client);
  });
  const [item] = await withRelatedData(updated.rows);
  return item;
}

export async function deleteAppointment(id) {
  requireUuid(id, "Agendamento");
  await pagamentos.removerPagamentoDoAgendamento(id);
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
  const agendamentos = await withRelatedData(result.rows);
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

// Interface pública usada pelos módulos pagamentos e notificacoes.
export async function buscarAgendamentoParaPagamento(id) {
  const row = await selectAppointmentForPayment(requireUuid(id, "Agendamento"));
  if (!row) throw notFound("Agendamento não encontrado.");
  return {
    id: row.id,
    clienteId: row.cliente_id,
    situacao: row.situacao,
    precoCentavos: row.preco_centavos
  };
}

export async function listarAgendadosDoDia(date) {
  if (!isValidDateKey(date)) throw badRequest("data deve estar no formato AAAA-MM-DD.");
  const rows = await selectScheduledForDay(date);
  return rows.map((row) => ({ id: row.id, clienteId: row.cliente_id, barbeiroId: row.barbeiro_id }));
}
