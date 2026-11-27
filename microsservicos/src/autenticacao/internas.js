// Rotas internas: expõem a interface pública do módulo na rede interna (não passam pelo gateway).
import { rota } from "../compartilhado/http.js";
import { criarCredencialCliente, removerCredencialCliente } from "./index.js";

export const rotasInternas = [
  rota("POST", "/internal/credenciais", 201, async (ctx) => criarCredencialCliente(await ctx.corpo())),
  rota("DELETE", /^\/internal\/credenciais\/([^/]+)$/, 200, async (ctx) => removerCredencialCliente(ctx.params[0]))
];
