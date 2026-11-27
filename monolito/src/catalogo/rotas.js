import { requireRole } from "../compartilhado/auth.js";
import { rota } from "../compartilhado/http.js";
import {
  createBarber, createService, deactivateBarber, listBarbers, listServices, updateBarber, updateService
} from "./index.js";

export const rotas = [
  rota("GET", "/barbeiros", 200, async (ctx) => {
    requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return listBarbers(ctx.query.get("ativo") ?? undefined);
  }),
  rota("POST", "/barbeiros", 201, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return createBarber(await ctx.corpo());
  }),
  rota("POST", /^\/barbeiros\/([^/]+)\/desativar$/, 200, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return deactivateBarber(ctx.params[0]);
  }),
  rota("PUT", /^\/barbeiros\/([^/]+)$/, 200, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return updateBarber(ctx.params[0], await ctx.corpo());
  }),
  rota("GET", "/servicos", 200, async (ctx) => {
    requireRole(ctx.request, ["CLIENTE", "BARBEARIA"]);
    return listServices();
  }),
  rota("POST", "/servicos", 201, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return createService(await ctx.corpo());
  }),
  rota("PUT", /^\/servicos\/([^/]+)$/, 200, async (ctx) => {
    requireRole(ctx.request, ["BARBEARIA"]);
    return updateService(ctx.params[0], await ctx.corpo());
  })
];
