// Rotas internas: expõem a interface pública do módulo na rede interna (não passam pelo gateway).
import { rota } from "../compartilhado/http.js";
import { buscarAgendamentoParaPagamento, listarAgendadosDoDia } from "./index.js";

export const rotasInternas = [
  rota("GET", "/internal/agendamentos", 200, async (ctx) => listarAgendadosDoDia(ctx.query.get("data") ?? "")),
  rota("GET", /^\/internal\/agendamentos\/([^/]+)\/pagamento$/, 200, async (ctx) =>
    buscarAgendamentoParaPagamento(ctx.params[0]))
];
