// Microsserviços: o serviço agendamento chama clientes, catalogo e pagamentos por HTTP.
import { chamar } from "../compartilhado/servicos.js";

export const clientes = {
  findClientByPhone: (telefone) =>
    chamar("clientes", "GET", `/internal/clientes?telefone=${encodeURIComponent(telefone)}`),
  buscarClientePorId: (id) => chamar("clientes", "GET", `/internal/clientes/${encodeURIComponent(id)}`),
  buscarClientesPorIds: (ids) => chamar("clientes", "POST", "/internal/clientes/consulta", { ids })
};

export const catalogo = {
  getBarber: (id, includeInactive = false) =>
    chamar("catalogo", "GET", `/internal/barbeiros/${encodeURIComponent(id)}?incluirInativos=${includeInactive}`),
  getService: (id) => chamar("catalogo", "GET", `/internal/servicos/${encodeURIComponent(id)}`),
  buscarBarbeirosPorIds: (ids) => chamar("catalogo", "POST", "/internal/barbeiros/consulta", { ids }),
  buscarServicosPorIds: (ids) => chamar("catalogo", "POST", "/internal/servicos/consulta", { ids })
};

export const pagamentos = {
  removerPagamentoDoAgendamento: (agendamentoId) =>
    chamar("pagamentos", "DELETE", `/internal/pagamentos/${encodeURIComponent(agendamentoId)}`)
};
