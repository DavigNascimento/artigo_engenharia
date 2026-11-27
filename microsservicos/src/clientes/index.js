import { randomUUID } from "node:crypto";
import { hashPassword } from "../compartilhado/auth.js";
import { badRequest, conflict, notFound } from "../compartilhado/errors.js";
import {
  requireFields, requireName, requirePassword, requirePhone
} from "../compartilhado/validation.js";
import {
  insertClient, saveNotificationPreferences, selectClientById, selectClientByPhone
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
  try {
    const row = await insertClient({
      id: randomUUID(),
      name,
      phone,
      passwordHash: await hashPassword(password)
    });
    return clientRecord(row);
  } catch (error) {
    if (error.code === "23505") throw conflict("Telefone já cadastrado.");
    throw error;
  }
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
