import { randomUUID } from "node:crypto";

export async function createPaymentIntent({ metodo, agendamentoId, valorCentavos }) {
  return {
    referenciaExterna: `sim-${randomUUID()}`,
    status: "PENDENTE",
    metodo,
    agendamentoId,
    valorCentavos,
    urlConclusao: `https://pagamento.invalid/checkout/${randomUUID()}`
  };
}
