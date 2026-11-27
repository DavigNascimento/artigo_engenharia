import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";

// Script único de benchmark para as duas arquiteturas (SPEC 11). Use preferencialmente
// pelo executor (executar.mjs), que zera o banco, aquece, repete e alterna as arquiteturas.

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8080";
const mode = __ENV.SCENARIO || "mixed";
const bookingErrors = new Counter("booking_errors");
const medicao = { fase: "medicao" };

export const options = {
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
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
  // Os limites também fazem o k6 calcular as submétricas usadas no resumo. Só entram
  // as requisições da fase de medição (marcadas com fase=medicao), não as do setup.
  thresholds: {
    "http_req_failed{fase:medicao}": ["rate<0.01"],
    "http_req_duration{fase:medicao}": ["max>=0"],
    "http_reqs{fase:medicao}": ["count>=0"],
    "http_req_duration{endpoint:post_agendamentos}": ["p(95)<3000"],
    "http_req_duration{endpoint:post_cancelar}": ["max>=0"],
    "http_req_duration{endpoint:get_agendamentos}": ["max>=0"],
    "http_req_duration{endpoint:get_disponibilidade}": ["max>=0"]
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

function json(token) {
  return { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } };
}

function createClient(name, phone) {
  const client = http.post(`${baseUrl}/clientes`, JSON.stringify({
    nome: name, telefone: phone, senha: "senha-benchmark-local"
  }), { headers: { "Content-Type": "application/json" } });
  if (!checked(client, 201, "cliente")) throw new Error("Falha ao preparar clientes.");
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

  // Um barbeiro e um cliente por VU, para que as escritas não disputem o mesmo horário.
  const count = Math.max(1, Number(__ENV.MAX_VUS || __ENV.VUS || 10));
  const fixtures = [];
  const seed = Date.now() % 40_000_000;
  for (let index = 0; index < count; index += 1) {
    const barber = http.post(`${baseUrl}/barbeiros`, JSON.stringify({
      nome: `Benchmark Barbeiro ${letters(index)}`
    }), json(token));
    if (!checked(barber, 201, "barbeiro")) throw new Error("Falha ao preparar barbeiros.");
    const phone = `82${String(seed + index).padStart(8, "0")}`;
    const clientName = `Benchmark Cliente ${letters(index)}`;
    createClient(clientName, phone);
    fixtures.push({ barberId: barber.json("id"), clientName, phone });
  }

  // Massa inicial de agendamentos (mesma nas duas arquiteturas): MASSA agendamentos ativos de
  // clientes próprios, distribuídos entre os barbeiros em horários da manhã, sem usar o horário
  // das escritas. A listagem e a disponibilidade da leitura passam a ter dados para retornar.
  const morning = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];
  const seedCount = Math.min(Number(__ENV.MASSA || 20), count * morning.length);
  for (let index = 0; index < seedCount; index += 2) {
    const phone = `81${String(seed + index).padStart(8, "0")}`;
    const clientName = `Benchmark Massa ${letters(index)}`;
    createClient(clientName, phone);
    for (const item of [index, index + 1].filter((value) => value < seedCount)) {
      const booked = http.post(`${baseUrl}/agendamentos`, JSON.stringify({
        nome: clientName,
        telefone: phone,
        barbeiroId: fixtures[item % count].barberId,
        servicoId: serviceId,
        data: date,
        horario: morning[Math.floor(item / count)]
      }), json(token));
      if (!checked(booked, 201, "massa")) throw new Error("Falha ao preparar a massa de agendamentos.");
    }
  }
  return { token, serviceId, date, fixtures };
}

export function read(data) {
  const fixture = data.fixtures[(exec.vu.idInTest - 1) % data.fixtures.length];
  const headers = { Authorization: `Bearer ${data.token}` };
  const appointments = http.get(`${baseUrl}/agendamentos?nomeCliente=Benchmark`, {
    headers,
    tags: { ...medicao, endpoint: "get_agendamentos" }
  });
  checked(appointments, 200, "agendamentos");
  const availability = http.get(
    `${baseUrl}/disponibilidade?barbeiroId=${fixture.barberId}&servicoId=${data.serviceId}&data=${data.date}`,
    { headers, tags: { ...medicao, endpoint: "get_disponibilidade" } }
  );
  checked(availability, 200, "disponibilidade");
}

export function write(data) {
  const fixture = data.fixtures[(exec.vu.idInTest - 1) % data.fixtures.length];
  const params = json(data.token);
  const created = http.post(`${baseUrl}/agendamentos`, JSON.stringify({
    nome: fixture.clientName,
    telefone: fixture.phone,
    barbeiroId: fixture.barberId,
    servicoId: data.serviceId,
    data: data.date,
    horario: __ENV.HORARIO || "15:00"
  }), { ...params, tags: { ...medicao, endpoint: "post_agendamentos" } });
  if (!checked(created, 201, "post_agendamentos")) return;
  const cancelled = http.post(`${baseUrl}/agendamentos/${created.json("id")}/cancelar`, null, {
    ...params,
    tags: { ...medicao, endpoint: "post_cancelar" }
  });
  checked(cancelled, 200, "post_cancelar");
}

// Mistura determinística: em cada VU, 4 iterações de leitura para 1 de escrita (80/20).
export function mixed(data) {
  if (exec.vu.iterationInScenario % 5 === 4) write(data);
  else read(data);
}

export function handleSummary(data) {
  const output = {};
  if (__ENV.SAIDA_JSON) output[__ENV.SAIDA_JSON] = JSON.stringify(data, null, 2);
  const values = (name) => data.metrics[name]?.values ?? {};
  const duration = values("http_req_duration{fase:medicao}");
  const lines = [
    `cenário: ${mode}`,
    `requisições na medição: ${values("http_reqs{fase:medicao}").count ?? 0}`,
    `falhas: ${((values("http_req_failed{fase:medicao}").rate ?? 0) * 100).toFixed(2)}%`,
    `latência (ms): p50 ${(duration.med ?? 0).toFixed(1)} | p95 ${(duration["p(95)"] ?? 0).toFixed(1)} | p99 ${(duration["p(99)"] ?? 0).toFixed(1)}`,
    ""
  ];
  output.stdout = lines.join("\n");
  return output;
}
