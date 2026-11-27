import { rota } from "../compartilhado/http.js";
import { loginBarbershop, loginClient } from "./index.js";

export const rotas = [
  rota("POST", "/auth/cliente", 200, async (ctx) => loginClient(await ctx.corpo())),
  rota("POST", "/auth/barbearia", 200, async (ctx) => loginBarbershop(await ctx.corpo()))
];
