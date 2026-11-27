// Microsserviços: o serviço pagamentos chama o serviço agendamento por HTTP.
import { chamar } from "../compartilhado/servicos.js";

export const agendamento = {
  buscarAgendamentoParaPagamento: (id) =>
    chamar("agendamento", "GET", `/internal/agendamentos/${encodeURIComponent(id)}/pagamento`)
};
