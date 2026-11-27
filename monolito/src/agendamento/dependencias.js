// Monolito: o módulo agendamento chama as interfaces públicas dos outros módulos em memória.
import * as catalogoModulo from "../catalogo/index.js";
import * as clientesModulo from "../clientes/index.js";
import * as pagamentosModulo from "../pagamentos/index.js";

export const clientes = {
  findClientByPhone: (telefone) => clientesModulo.findClientByPhone(telefone),
  buscarClientePorId: (id) => clientesModulo.buscarClientePorId(id),
  buscarClientesPorIds: (ids) => clientesModulo.buscarClientesPorIds(ids)
};

export const catalogo = {
  getBarber: (id, includeInactive = false) => catalogoModulo.getBarber(id, includeInactive),
  getService: (id) => catalogoModulo.getService(id),
  buscarBarbeirosPorIds: (ids) => catalogoModulo.buscarBarbeirosPorIds(ids),
  buscarServicosPorIds: (ids) => catalogoModulo.buscarServicosPorIds(ids)
};

export const pagamentos = {
  removerPagamentoDoAgendamento: (agendamentoId) => pagamentosModulo.removerPagamentoDoAgendamento(agendamentoId)
};
