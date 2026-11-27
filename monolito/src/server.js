import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarProcesso } from "./compartilhado/inicializacao.js";
import { ensureBarbershopAccount } from "./autenticacao/index.js";
import { startDailyNotifications } from "./notificacoes/index.js";
import { rotas, verificarSaude, webRoot } from "./app.js";

const root = dirname(fileURLToPath(import.meta.url));

await iniciarProcesso({
  rotas,
  verificarSaude,
  webRoot,
  migracao: resolve(root, "../migrations/001_init.sql"),
  preparar: async () => {
    await ensureBarbershopAccount();
    // Em réplicas extras do monolito (escala horizontal), desligue a rotina com NOTIFICACOES_ATIVAS=false.
    if (process.env.NOTIFICACOES_ATIVAS !== "false") startDailyNotifications();
  }
});
