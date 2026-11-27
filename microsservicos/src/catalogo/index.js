import { badRequest, notFound } from "../compartilhado/errors.js";
import {
  requireDuration, requireFields, requireIntegerCents, requireName, requireUuid
} from "../compartilhado/validation.js";
import {
  deactivateBarberRow, findBarberRow, findBarberRowsByIds, findServiceRow, findServiceRowsByIds,
  insertBarber, insertService, listBarberRows, listServiceRows, saveBarber, saveService
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

function requireIds(ids, label) {
  if (!Array.isArray(ids)) throw badRequest("Informe a lista de ids.");
  return ids.map((id) => requireUuid(id, label));
}

export async function listBarbers(active) {
  if (active !== undefined && active !== "true" && active !== "false") {
    throw badRequest("O filtro ativo deve ser true ou false.");
  }
  const result = await listBarberRows(active === undefined ? undefined : active === "true");
  return result.rows.map(barberRecord);
}

export async function getBarber(id, includeInactive = false) {
  requireUuid(id, "Barbeiro");
  const result = await findBarberRow(id, includeInactive);
  if (!result.rowCount) throw notFound("Barbeiro não encontrado.");
  return barberRecord(result.rows[0]);
}

export async function buscarBarbeirosPorIds(ids) {
  const valid = requireIds(ids, "Barbeiro");
  if (!valid.length) return [];
  const result = await findBarberRowsByIds(valid);
  return result.rows.map(barberRecord);
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

export async function getService(id) {
  requireUuid(id, "Serviço");
  const result = await findServiceRow(id);
  if (!result.rowCount) throw notFound("Serviço não encontrado.");
  return serviceRecord(result.rows[0]);
}

export async function buscarServicosPorIds(ids) {
  const valid = requireIds(ids, "Serviço");
  if (!valid.length) return [];
  const result = await findServiceRowsByIds(valid);
  return result.rows.map(serviceRecord);
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
  const result = await insertService(serviceInput(input));
  return serviceRecord(result.rows[0]);
}

export async function updateService(id, input) {
  requireUuid(id, "Serviço");
  const service = serviceInput(input);
  const result = await saveService(id, service);
  if (!result.rowCount) throw notFound("Serviço não encontrado.");
  return serviceRecord(result.rows[0]);
}
