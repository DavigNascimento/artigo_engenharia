import { requireRole } from "../compartilhado/auth.js";
import { rota } from "../compartilhado/http.js";
import {
  changeAppointmentStatus, createAppointment, deleteAppointment, getAppointment, getAvailability,
  getOpeningHours, getStatistics, listAppointments, setOpeningHours
} from "./index.js";

export const rotas = [
  rota("GET", "/configuracao/expediente", 200, async (ctx) => {
    requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return getOpeningHours();
  }),
  rota("PUT", "/configuracao/expediente", 200, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return setOpeningHours(await ctx.corpo());
  }),
  rota("GET", "/disponibilidade", 200, async (ctx) => {
    requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return getAvailability({
      barberId: ctx.query.get("barbeiroId"),
      serviceId: ctx.query.get("servicoId"),
      date: ctx.query.get("data")
    });
  }),
  rota("POST", "/agendamentos", 201, async (ctx) => {
    const user = requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return createAppointment(user, await ctx.corpo());
  }),
  rota("GET", "/agendamentos", 200, async (ctx) => {
    const user = requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return listAppointments(user, {
      nomeCliente: ctx.query.get("nomeCliente") ?? undefined,
      barbeiroId: ctx.query.get("barbeiroId") ?? undefined,
      data: ctx.query.get("data") ?? undefined,
      situacao: ctx.query.get("situacao") ?? undefined
    });
  }),
  rota("POST", /^\/agendamentos\/([^/]+)\/(atender|cancelar)$/, 200, async (ctx) => {
    const action = ctx.params[1] === "atender" ? "ATENDIDO" : "CANCELADO";
    const user = action === "ATENDIDO"
      ? requireRole(ctx.request, ["BARBEARIA"])
      : requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return changeAppointmentStatus(ctx.params[0], user, action);
  }),
  rota("DELETE", /^\/agendamentos\/([^/]+)$/, 204, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    await deleteAppointment(ctx.params[0]);
  }),
  rota("GET", /^\/agendamentos\/([^/]+)$/, 200, async (ctx) =>
    getAppointment(ctx.params[0], requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]))),
  rota("GET", "/estatisticas", 200, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return getStatistics({
      periodo: ctx.query.get("periodo"),
      referencia: ctx.query.get("referencia"),
      barbeiroId: ctx.query.get("barbeiroId") ?? undefined
    });
  })
];
