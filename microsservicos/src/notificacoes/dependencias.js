// Microsserviços: o serviço notificacoes (sem banco) chama agendamento e clientes por HTTP.
import { chamar } from "../compartilhado/servicos.js";

export const agendamento = {
  listarAgendadosDoDia: (data) =>
    chamar("agendamento", "GET", `/internal/agendamentos?data=${encodeURIComponent(data)}`)
};

export const clientes = {
  buscarClientesPorIds: (ids) => chamar("clientes", "POST", "/internal/clientes/consulta", { ids })
};
