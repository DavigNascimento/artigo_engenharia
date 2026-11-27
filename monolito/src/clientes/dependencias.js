// Monolito: o módulo clientes chama a interface pública do módulo autenticacao em memória.
import * as autenticacaoModulo from "../autenticacao/index.js";

export const autenticacao = {
  criarCredencialCliente: (dados) => autenticacaoModulo.criarCredencialCliente(dados),
  removerCredencialCliente: (clienteId) => autenticacaoModulo.removerCredencialCliente(clienteId)
};
