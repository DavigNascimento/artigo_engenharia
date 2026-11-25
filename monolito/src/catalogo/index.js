import { pool } from "../compartilhado/db.js";
import { badRequest, notFound } from "../compartilhado/errors.js";
import {
  requireDuration, requireFields, requireIntegerCents, requireName, requireScheduleConfig, requireUuid
} from "../compartilhado/validation.js";
import {
  deactivateBarberRow, findBarberRow, findServiceRow, insertBarber, insertService,
  listBarberRows, listServiceRows, saveBarber, saveOpeningHours, saveService, selectOpeningHours
} from "./repository.js";

function barberRecord(row) {
  return { id: row.id, nome: row.nome, ativo: row.ativo };
}

function serviceRecord(row) {
  return {
    id: row.id,
    nome: row.nome,
    duracaoMinutos: row.duracao_minutos,
    precoCentavos: row.preco_centavos,
    custoCentavos: row.custo_centavos
  };
}

export async function listBarbers(active) {
  if (active !== undefined && active !== "true" && active !== "false") {
    throw badRequest("O filtro ativo deve ser true ou false.");
  }
  const result = await listBarberRows(active === undefined ? undefined : active === "true");
  return result.rows.map(barberRecord);
}

export async function getBarber(id, includeInactive = false, client = pool) {
  requireUuid(id, "Barbeiro");
  const result = await findBarberRow(id, includeInactive, client);
  if (!result.rowCount) throw notFound("Barbeiro não encontrado.");
  return barberRecord(result.rows[0]);
}

export async function createBarber(input) {
  requireFields(input, ["nome"]);
  const result = await insertBarber(requireName(input.nome));
  return barberRecord(result.rows[0]);
}

export async function updateBarber(id, input) {
  requireUuid(id, "Barbeiro");
  requireFields(input, ["nome"]);
  const result = await saveBarber(id, requireName(input.nome));
  if (!result.rowCount) throw notFound("Barbeiro não encontrado.");
  return barberRecord(result.rows[0]);
}

export async function deactivateBarber(id) {
  requireUuid(id, "Barbeiro");
  const result = await deactivateBarberRow(id);
  if (!result.rowCount) throw notFound("Barbeiro não encontrado.");
  return barberRecord(result.rows[0]);
}

export async function listServices() {
  const result = await listServiceRows();
  return result.rows.map(serviceRecord);
}

export async function getService(id, client = pool) {
  requireUuid(id, "Serviço");
  const result = await findServiceRow(id, client);
  if (!result.rowCount) throw notFound("Serviço não encontrado.");
  return serviceRecord(result.rows[0]);
}

function serviceInput(input) {
  requireFields(input, ["nome", "duracaoMinutos", "precoCentavos", "custoCentavos"]);
  return {
    nome: requireName(input.nome),
    duracao: requireDuration(input.duracaoMinutos),
    preco: requireIntegerCents(input.precoCentavos, "Preço"),
    custo: requireIntegerCents(input.custoCentavos, "Custo")
  };
}

export async function createService(input) {
  const service = serviceInput(input);
  const result = await insertService(service);
  return serviceRecord(result.rows[0]);
}

export async function updateService(id, input) {
  requireUuid(id, "Serviço");
  const service = serviceInput(input);
  const result = await saveService(id, service);
  if (!result.rowCount) throw notFound("Serviço não encontrado.");
  return serviceRecord(result.rows[0]);
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
