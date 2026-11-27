import { requireRole } from "../compartilhado/auth.js";
import { badRequest } from "../compartilhado/errors.js";
import { rota } from "../compartilhado/http.js";
import { findClientByPhone, getCurrentClient, registerClient, updateNotifications } from "./index.js";

export const rotas = [
  rota("POST", "/clientes", 201, async (ctx) => registerClient(await ctx.corpo())),
  rota("GET", "/clientes/eu", 200, async (ctx) => getCurrentClient(requireRole(ctx.request, ["CLIENTE"]))),
  rota("GET", "/clientes", 200, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    const phone = ctx.query.get("telefone");
    if (!phone) throw badRequest("Informe telefone.");
    return findClientByPhone(phone);
  }),
  rota("PUT", "/clientes/eu/notificacoes", 200, async (ctx) =>
    updateNotifications(requireRole(ctx.request, ["CLIENTE"]), await ctx.corpo()))
];
