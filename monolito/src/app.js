import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./compartilhado/db.js";
import { createAppServer } from "./compartilhado/http.js";
import { rotas as rotasAutenticacao } from "./autenticacao/rotas.js";
import { rotas as rotasClientes } from "./clientes/rotas.js";
import { rotas as rotasCatalogo } from "./catalogo/rotas.js";
import { rotas as rotasAgendamento } from "./agendamento/rotas.js";
import { rotas as rotasPagamentos } from "./pagamentos/rotas.js";

const root = dirname(fileURLToPath(import.meta.url));

export const webRoot = resolve(root, "../web");

// Monolito: um único processo atende as rotas de todos os módulos e a interface web.
export const rotas = [
  ...rotasAutenticacao,
  ...rotasClientes,
  ...rotasCatalogo,
  ...rotasAgendamento,
  ...rotasPagamentos
];

export async function verificarSaude() {
  await pool.query("SELECT 1");
}

export function createApp() {
  return createAppServer({ rotas, verificarSaude, webRoot });
}
