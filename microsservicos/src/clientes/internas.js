// Rotas internas: expõem a interface pública do módulo na rede interna (não passam pelo gateway).
import { rota } from "../compartilhado/http.js";
import { buscarClientePorId, buscarClientesPorIds, findClientByPhone } from "./index.js";

export const rotasInternas = [
  rota("GET", "/internal/clientes", 200, async (ctx) => findClientByPhone(ctx.query.get("telefone") ?? "")),
  rota("POST", "/internal/clientes/consulta", 200, async (ctx) => buscarClientesPorIds((await ctx.corpo()).ids)),
  rota("GET", /^\/internal\/clientes\/([^/]+)$/, 200, async (ctx) => buscarClientePorId(ctx.params[0]))
];
