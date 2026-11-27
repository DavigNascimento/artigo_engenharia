import { assertTokenSecret } from "./auth.js";
import { migrate, pool } from "./db.js";
import { createAppServer } from "./http.js";

// Sobe um processo HTTP (o monolito inteiro ou um microsserviço) da mesma forma nas
// duas arquiteturas: valida o segredo do token, aplica a migração, executa a preparação
// do módulo e só então começa a escutar.
export async function iniciarProcesso({ rotas, verificarSaude, webRoot, migracao, preparar }) {
  try {
    assertTokenSecret();
    if (migracao) await migrate(migracao);
    if (preparar) await preparar();

    const port = Number(process.env.PORT || 8080);
    const host = process.env.HOST || "0.0.0.0";
    const server = createAppServer({ rotas, verificarSaude, webRoot });
    server.listen(port, host, () => {
      console.info(JSON.stringify({ evento: "servidor_pronto", host, port }));
    });

    const shutdown = () => {
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return server;
  } catch (error) {
    console.error(JSON.stringify({ evento: "falha_inicializacao", motivo: error.code || error.name }));
    await pool.end();
    process.exitCode = 1;
    return null;
  }
}
