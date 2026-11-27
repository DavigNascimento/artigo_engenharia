// Rotas internas: expõem a interface pública do módulo na rede interna (não passam pelo gateway).
import { rota } from "../compartilhado/http.js";
import { buscarBarbeirosPorIds, buscarServicosPorIds, getBarber, getService } from "./index.js";

export const rotasInternas = [
  rota("POST", "/internal/barbeiros/consulta", 200, async (ctx) => buscarBarbeirosPorIds((await ctx.corpo()).ids)),
  rota("POST", "/internal/servicos/consulta", 200, async (ctx) => buscarServicosPorIds((await ctx.corpo()).ids)),
  rota("GET", /^\/internal\/barbeiros\/([^/]+)$/, 200, async (ctx) =>
    getBarber(ctx.params[0], ctx.query.get("incluirInativos") === "true")),
  rota("GET", /^\/internal\/servicos\/([^/]+)$/, 200, async (ctx) => getService(ctx.params[0]))
];
