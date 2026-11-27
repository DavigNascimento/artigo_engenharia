import { randomUUID } from "node:crypto";
import { badRequest, conflict, notFound } from "../compartilhado/errors.js";
import {
  requireFields, requireName, requirePassword, requirePhone, requireUuid
} from "../compartilhado/validation.js";
import { autenticacao } from "./dependencias.js";
import {
  deleteClient, insertClient, saveNotificationPreferences, selectClientById, selectClientByPhone,
  selectClientsByIds
} from "./repository.js";

function clientRecord(row) {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    receberNotificacoes: row.receber_notificacoes,
    canal: row.canal
  };
}

export async function registerClient(input) {
  requireFields(input, ["nome", "telefone", "senha"]);
  const name = requireName(input.nome);
  const phone = requirePhone(input.telefone);
  const password = requirePassword(input.senha);
  const id = randomUUID();
  let row;
  try {
    row = await insertClient({ id, name, phone });
  } catch (error) {
    if (error.code === "23505") throw conflict("Telefone já cadastrado.");
    throw error;
  }
  try {
    // A senha pertence ao módulo autenticacao (RFA2); se a credencial falhar, o cadastro é desfeito.
    await autenticacao.criarCredencialCliente({ clienteId: id, telefone: phone, senha: password });
  } catch (error) {
    // Com chamada remota, a credencial pode ter sido criada mesmo após uma falha (ex.: timeout).
    await autenticacao.removerCredencialCliente(id).catch(() => {});
    await deleteClient(id).catch(() => {});
    throw error;
  }
  return clientRecord(row);
}

export async function getCurrentClient(user) {
  const row = await selectClientById(user.id);
  if (!row) throw notFound("Cliente não encontrado.");
  return clientRecord(row);
}

export async function findClientByPhone(phone) {
  const row = await selectClientByPhone(requirePhone(phone));
  if (!row) throw notFound("Cliente não cadastrado.");
  return clientRecord(row);
}

export async function updateNotifications(user, input) {
  if (typeof input.receberNotificacoes !== "boolean") {
    throw badRequest("receberNotificacoes deve ser booleano.");
  }
  if (input.canal !== "WhatsApp") throw badRequest("Canal deve ser WhatsApp.");
  const row = await saveNotificationPreferences({
    id: user.id,
    enabled: input.receberNotificacoes,
    channel: input.canal
  });
  if (!row) throw notFound("Cliente não encontrado.");
  return clientRecord(row);
}

// Interface pública usada pelos módulos agendamento e notificacoes.
export async function buscarClientePorId(id) {
  const row = await selectClientById(requireUuid(id, "Cliente"));
  if (!row) throw notFound("Cliente não encontrado.");
  return clientRecord(row);
}

export async function buscarClientesPorIds(ids) {
  if (!Array.isArray(ids)) throw badRequest("Informe a lista de ids.");
  if (!ids.length) return [];
  const rows = await selectClientsByIds(ids.map((id) => requireUuid(id, "Cliente")));
  return rows.map(clientRecord);
}
