// Rotas internas: expõem a interface pública do módulo na rede interna (não passam pelo gateway).
import { rota } from "../compartilhado/http.js";
import { removerPagamentoDoAgendamento } from "./index.js";

export const rotasInternas = [
  rota("DELETE", /^\/internal\/pagamentos\/([^/]+)$/, 200, async (ctx) =>
    removerPagamentoDoAgendamento(ctx.params[0]))
];
