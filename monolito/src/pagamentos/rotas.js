import { requireRole } from "../compartilhado/auth.js";
import { rota } from "../compartilhado/http.js";
import { createPayment, getPayment } from "./index.js";

export const rotas = [
  rota("POST", /^\/agendamentos\/([^/]+)\/pagamento$/, 201, async (ctx) =>
    createPayment(requireRole(ctx.request, ["CLIENTE"]), ctx.params[0], await ctx.corpo())),
  rota("GET", /^\/agendamentos\/([^/]+)\/pagamento$/, 200, async (ctx) =>
    getPayment(requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]), ctx.params[0]))
];
