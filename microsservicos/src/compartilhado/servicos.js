import { AppError, serviceUnavailable } from "./errors.js";

// Cliente HTTP/JSON entre serviços (SPEC 8.3): rede interna do Compose, sem passar pelo
// gateway, com timeout por chamada. Erros 4xx da dependência são repassados com o mesmo
// status e código (um 404 continua 404); falha de rede, timeout ou 5xx viram 503
// SERVICO_INDISPONIVEL. O fetch nativo do Node reaproveita conexões (keep-alive).

const timeoutMs = Number(process.env.TIMEOUT_DEPENDENCIA_MS || 2000);

export function urlDoServico(servico) {
  return process.env[`URL_${servico.toUpperCase()}`] || `http://${servico}:8080`;
}

export async function chamar(servico, metodo, caminho, corpo) {
  let response;
  let valor;
  try {
    response = await fetch(`${urlDoServico(servico)}${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(timeoutMs)
    });
    valor = response.status === 204 ? undefined : await response.json();
  } catch {
    throw serviceUnavailable();
  }
  if (response.ok) return valor;
  if (response.status >= 400 && response.status < 500 && valor?.codigo) {
    throw new AppError(response.status, valor.codigo, valor.erro);
  }
  throw serviceUnavailable();
}

// Verificação de saúde agregada (RFA1): falha se algum serviço não responder 200.
export async function verificarServicos(servicos) {
  await Promise.all(servicos.map((servico) => chamar(servico, "GET", "/health")));
}
