import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../compartilhado/db.js";
import { iniciarProcesso } from "../compartilhado/inicializacao.js";
import { ensureBarbershopAccount } from "./index.js";
import { rotasInternas } from "./internas.js";
import { rotas } from "./rotas.js";

const root = dirname(fileURLToPath(import.meta.url));

await iniciarProcesso({
  rotas: [...rotas, ...rotasInternas],
  verificarSaude: async () => {
    await pool.query("SELECT 1");
  },
  migracao: resolve(root, "migrations/001_init.sql"),
  preparar: ensureBarbershopAccount
});
