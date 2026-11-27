import { iniciarProcesso } from "../compartilhado/inicializacao.js";
import { startDailyNotifications } from "./index.js";

// Serviço sem banco e sem rotas públicas: só a rotina diária (RF25) e o /health.
await iniciarProcesso({
  rotas: [],
  verificarSaude: async () => {},
  preparar: async () => {
    startDailyNotifications();
  }
});
