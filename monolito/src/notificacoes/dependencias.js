// Monolito: o módulo notificacoes chama as interfaces públicas dos outros módulos em memória.
import * as agendamentoModulo from "../agendamento/index.js";
import * as clientesModulo from "../clientes/index.js";

export const agendamento = {
  listarAgendadosDoDia: (data) => agendamentoModulo.listarAgendadosDoDia(data)
};

export const clientes = {
  buscarClientesPorIds: (ids) => clientesModulo.buscarClientesPorIds(ids)
};
