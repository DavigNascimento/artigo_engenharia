export class AppError extends Error {
  constructor(status, codigo, message) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

export function badRequest(message = "Dados inválidos.") {
  return new AppError(400, "DADOS_INVALIDOS", message);
}

export function unauthorized() {
  return new AppError(401, "NAO_AUTENTICADO", "Autenticação necessária.");
}

export function forbidden() {
  return new AppError(403, "SEM_PERMISSAO", "Perfil sem permissão para esta operação.");
}

export function notFound(message = "Registro não encontrado.") {
  return new AppError(404, "NAO_ENCONTRADO", message);
}

export function conflict(message = "Conflito com um registro existente.") {
  return new AppError(409, "CONFLITO", message);
}

export function unprocessable(message) {
  return new AppError(422, "REGRA_NEGOCIO", message);
}

export function serviceUnavailable(message = "Serviço dependente indisponível.") {
  return new AppError(503, "SERVICO_INDISPONIVEL", message);
}
