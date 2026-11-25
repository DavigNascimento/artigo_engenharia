import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8080";
const mode = __ENV.SCENARIO || "mixed";
const bookingErrors = new Counter("booking_errors");

export const options = {
  scenarios: mode === "read"
    ? {
        leitura: {
          executor: "constant-arrival-rate",
          rate: Number(__ENV.RATE || 20),
          timeUnit: "1s",
          duration: __ENV.DURATION || "30s",
          preAllocatedVUs: Number(__ENV.VUS || 10),
          maxVUs: Number(__ENV.MAX_VUS || __ENV.VUS || 10),
          exec: "read"
        }
      }
    : mode === "write"
      ? {
          escrita: {
            executor: "constant-vus",
            vus: Number(__ENV.VUS || 5),
            duration: __ENV.DURATION || "30s",
            exec: "write"
          }
        }
      : mode === "ramp"
        ? {
            rampa: {
              executor: "ramping-arrival-rate",
              startRate: Number(__ENV.START_RATE || 5),
              timeUnit: "1s",
              preAllocatedVUs: Number(__ENV.VUS || 10),
              maxVUs: Number(__ENV.MAX_VUS || 100),
              stages: [
                { target: Number(__ENV.TARGET_RATE || 40), duration: __ENV.DURATION || "60s" }
              ],
              exec: "write"
            }
          }
        : {
            misto: {
              executor: "constant-vus",
              vus: Number(__ENV.VUS || 10),
              duration: __ENV.DURATION || "30s",
              exec: "mixed"
            }
          },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:post_agendamentos}": ["p(95)<3000"]
  }
};

function checked(response, expected, name) {
  const ok = check(response, { [`${name} status ${expected}`]: (result) => result.status === expected });
  if (!ok) bookingErrors.add(1, { endpoint: name });
  return ok;
}

function letters(index) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + value % 26) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function setup() {
  const login = http.post(`${baseUrl}/auth/barbearia`, JSON.stringify({
    login: __ENV.BARBERIA_LOGIN || "admin",
    senha: __ENV.BARBERIA_PASSWORD
  }), { headers: { "Content-Type": "application/json" } });
  if (!checked(login, 200, "login")) throw new Error("Falha no login da barbearia.");
  const token = login.json("token");
  const services = http.get(`${baseUrl}/servicos`, { headers: { Authorization: `Bearer ${token}` } });
  if (!checked(services, 200, "servicos")) throw new Error("Falha ao carregar serviços.");
  const serviceId = __ENV.SERVICO_ID ||
    services.json().find((service) => service.nome === "Corte")?.id;
  const date = __ENV.DATA;
  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Defina DATA válida e garanta que o serviço Corte exista.");
  }

  const count = Math.max(1, Number(__ENV.MAX_VUS || __ENV.VUS || 10));
  const fixtures = [];
  const seed = Date.now() % 90_000_000;
  for (let index = 0; index < count; index += 1) {
    const barber = http.post(`${baseUrl}/barbeiros`, JSON.stringify({
      nome: `Benchmark Barbeiro ${letters(index)}`
    }), { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    if (!checked(barber, 201, "barbeiro")) throw new Error("Falha ao preparar barbeiros.");

    const phone = `82${String(seed + index).padStart(8, "0")}`;
    const client = http.post(`${baseUrl}/clientes`, JSON.stringify({
      nome: `Benchmark Cliente ${letters(index)}`,
      telefone: phone,
      senha: "senha-benchmark-local"
    }), { headers: { "Content-Type": "application/json" } });
    if (!checked(client, 201, "cliente")) throw new Error("Falha ao preparar clientes.");

    fixtures.push({
      barberId: barber.json("id"),
      clientName: `Benchmark Cliente ${letters(index)}`,
      phone
    });
  }
  return { token, serviceId, date, fixtures };
}

export function read(data) {
  const fixture = data.fixtures[(__VU - 1) % data.fixtures.length];
  const headers = { Authorization: `Bearer ${data.token}` };
  const appointments = http.get(`${baseUrl}/agendamentos?nomeCliente=Benchmark`, {
    headers,
    tags: { endpoint: "get_agendamentos" }
  });
  checked(appointments, 200, "agendamentos");
  const availability = http.get(
    `${baseUrl}/disponibilidade?barbeiroId=${fixture.barberId}&servicoId=${data.serviceId}&data=${data.date}`,
    { headers, tags: { endpoint: "get_disponibilidade" } }
  );
  checked(availability, 200, "disponibilidade");
}

export function write(data) {
  const fixture = data.fixtures[(__VU - 1) % data.fixtures.length];
  const headers = { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" };
  const created = http.post(`${baseUrl}/agendamentos`, JSON.stringify({
    nome: fixture.clientName,
    telefone: fixture.phone,
    barbeiroId: fixture.barberId,
    servicoId: data.serviceId,
    data: data.date,
    horario: __ENV.HORARIO || "15:00"
  }), {
    headers,
    tags: { endpoint: "post_agendamentos" }
  });
  if (!checked(created, 201, "post_agendamentos")) return;
  const cancelled = http.post(`${baseUrl}/agendamentos/${created.json("id")}/cancelar`, null, {
    headers,
    tags: { endpoint: "post_cancelar" }
  });
  checked(cancelled, 200, "post_cancelar");
}

export function mixed(data) {
  if (Math.random() < 0.8) read(data);
  else write(data);
}
