// Monolito: o módulo pagamentos chama a interface pública do módulo agendamento em memória.
import * as agendamentoModulo from "../agendamento/index.js";

export const agendamento = {
  buscarAgendamentoParaPagamento: (id) => agendamentoModulo.buscarAgendamentoParaPagamento(id)
};
