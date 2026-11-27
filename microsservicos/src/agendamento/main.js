import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../compartilhado/db.js";
import { iniciarProcesso } from "../compartilhado/inicializacao.js";
import { verificarServicos } from "../compartilhado/servicos.js";
import { rotasInternas } from "./internas.js";
import { rotas } from "./rotas.js";

const root = dirname(fileURLToPath(import.meta.url));
const dependencias = (process.env.DEPENDENCIAS_SAUDE || "autenticacao,clientes,catalogo,pagamentos,notificacoes")
  .split(",")
  .map((nome) => nome.trim())
  .filter(Boolean);

await iniciarProcesso({
  rotas: [...rotas, ...rotasInternas],
  // GET /health agregado (RFA1): o próprio banco e o /health dos outros serviços.
  verificarSaude: async () => {
    await Promise.all([pool.query("SELECT 1"), verificarServicos(dependencias)]);
  },
  migracao: resolve(root, "migrations/001_init.sql")
});
