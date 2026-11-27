import { createToken, hashPassword, verifyPassword } from "../compartilhado/auth.js";
import {
  requireFields, requirePassword, requirePhone, requireUuid
} from "../compartilhado/validation.js";
import { unauthorized } from "../compartilhado/errors.js";
import {
  deleteClientCredentials, findBarbershopCredentials, findClientCredentials, saveBarbershopUser,
  upsertClientCredentials
} from "./repository.js";

export async function ensureBarbershopAccount() {
  const login = process.env.BARBERIA_LOGIN || "admin";
  const password = requirePassword(process.env.BARBERIA_PASSWORD);
  await saveBarbershopUser(login, await hashPassword(password));
}

export async function loginClient(input) {
  requireFields(input, ["telefone", "senha"]);
  const telefone = requirePhone(input.telefone);
  const senha = requirePassword(input.senha);
  const credentials = await findClientCredentials(telefone);
  if (!credentials || !(await verifyPassword(senha, credentials.senha_hash))) throw unauthorized();
  return { token: createToken(credentials.id, "CLIENTE") };
}

export async function loginBarbershop(input) {
  requireFields(input, ["login", "senha"]);
  const credentials = await findBarbershopCredentials(String(input.login || ""));
  if (!credentials || !(await verifyPassword(String(input.senha || ""), credentials.senha_hash))) {
    throw unauthorized();
  }
  return { token: createToken(credentials.id, "BARBEARIA") };
}

// Interface pública usada pelo módulo clientes no cadastro (RFA2).
export async function criarCredencialCliente(input) {
  requireFields(input, ["clienteId", "telefone", "senha"]);
  const clientId = requireUuid(input.clienteId, "Cliente");
  const phone = requirePhone(input.telefone);
  const password = requirePassword(input.senha);
  await upsertClientCredentials({ clientId, phone, passwordHash: await hashPassword(password) });
  return { clienteId: clientId };
}

// Compensação usada pelo módulo clientes quando o cadastro é desfeito.
export async function removerCredencialCliente(clienteId) {
  await deleteClientCredentials(requireUuid(clienteId, "Cliente"));
  return { clienteId };
}
