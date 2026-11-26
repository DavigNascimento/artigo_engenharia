import { createAppServer } from "./app.js";
import { assertTokenSecret } from "./compartilhado/auth.js";
import { pool, migrate } from "./compartilhado/db.js";
import { ensureBarbershopAccount } from "./autenticacao/index.js";
import { runDailyNotifications, startDailyNotifications } from "./notificacoes/index.js";

async function start() {
  assertTokenSecret();
  await migrate();
  await ensureBarbershopAccount();
  await runDailyNotifications();
  startDailyNotifications();

  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || "0.0.0.0";
  const server = createAppServer();
  server.listen(port, host, () => {
    console.info(JSON.stringify({ evento: "servidor_pronto", host, port }));
  });

  const shutdown = async () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async () => {
  console.error(JSON.stringify({ evento: "falha_inicializacao" }));
  await pool.end();
  process.exitCode = 1;
});
