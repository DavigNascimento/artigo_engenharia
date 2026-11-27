// Microsserviços: o serviço clientes chama o serviço autenticacao por HTTP.
import { chamar } from "../compartilhado/servicos.js";

export const autenticacao = {
  criarCredencialCliente: (dados) => chamar("autenticacao", "POST", "/internal/credenciais", dados),
  removerCredencialCliente: (clienteId) =>
    chamar("autenticacao", "DELETE", `/internal/credenciais/${encodeURIComponent(clienteId)}`)
};
