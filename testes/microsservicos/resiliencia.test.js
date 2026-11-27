import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Testes específicos dos microsserviços (SPEC 9): gateway e resiliência.
// Rodam contra a pilha já iniciada com docker compose em microsservicos/ e param, pausam
// e reiniciam serviços. Variáveis: BARBERIA_PASSWORD (obrigatória), BARBERIA_LOGIN,
// BASE_URL e COMPOSE_PROJECT (nome do projeto do Compose; padrão "microsservicos").

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8080";
const projeto = process.env.COMPOSE_PROJECT || "microsservicos";
const pasta = resolve(dirname(fileURLToPath(import.meta.url)), "../../microsservicos");
let adminToken;
let customer;
let barberId;
let serviceId;
let appointmentDate;
let sequence = Date.now() % 10_000_000;

function compose(...args) {
  execFileSync("docker", ["compose", "-p", projeto, ...args], { cwd: pasta, stdio: "ignore" });
}

async function request(path, { method = "GET", token, body } = {}) {
  const started = performance.now();
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let value = null;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    value = text;
  }
  return { status: response.status, value, ms: performance.now() - started };
}

async function waitHealthy(timeoutMs = 60_000) {
  const limit = Date.now() + timeoutMs;
  while (Date.now() < limit) {
    try {
      if ((await request("/health")).status === 200) return;
    } catch {
      // gateway ainda sem resposta
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("A aplicação não voltou a ficar saudável.");
}

function nextOpenDate() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 1) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function newClient() {
  sequence = (sequence + 1) % 100_000_000;
  const telefone = `83${String(sequence).padStart(8, "0")}`;
  const body = { nome: "Cliente Resiliencia", telefone, senha: "senha-resiliencia" };
  const created = await request("/clientes", { method: "POST", body });
  return { ...created, telefone };
}

function book(time) {
  return request("/agendamentos", {
    method: "POST",
    token: customer.token,
    body: { barbeiroId: barberId, servicoId: serviceId, data: appointmentDate, horario: time }
  });
}

before(async () => {
  assert.ok(process.env.BARBERIA_PASSWORD, "Defina BARBERIA_PASSWORD.");
  await waitHealthy();
  const login = await request("/auth/barbearia", {
    method: "POST",
    body: { login: process.env.BARBERIA_LOGIN || "admin", senha: process.env.BARBERIA_PASSWORD }
  });
  adminToken = login.value.token;
  barberId = (await request("/barbeiros", {
    method: "POST", token: adminToken, body: { nome: "Barbeiro Resiliencia" }
  })).value.id;
  serviceId = (await request("/servicos", { token: adminToken })).value.find((item) => item.nome === "Corte").id;
  const client = await newClient();
  assert.equal(client.status, 201);
  const clientLogin = await request("/auth/cliente", {
    method: "POST", body: { telefone: client.telefone, senha: "senha-resiliencia" }
  });
  customer = { token: clientLogin.value.token };
  appointmentDate = nextOpenDate();
});

after(() => {
  // Garante que a pilha fica como estava, mesmo se um teste falhar no meio.
  for (const args of [["unpause", "catalogo"], ["start", "catalogo", "autenticacao"]]) {
    try {
      compose(...args);
    } catch {
      // o serviço já estava ativo
    }
  }
});

test("SPEC 9 gateway: rotas internas não são expostas e rotas desconhecidas seguem o formato de erro", async () => {
  const internal = await request("/internal/clientes/consulta", { method: "POST", body: { ids: [] } });
  assert.equal(internal.status, 404);
  assert.deepEqual(await request("/api/inexistente").then((r) => r.value), {
    erro: "Rota da API não encontrada.", codigo: "NAO_ENCONTRADO"
  });
  const unknown = await request("/caminho-inexistente");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.value.codigo, "NAO_ENCONTRADO");
  const page = await request("/");
  assert.equal(page.status, 200);
  assert.match(page.value, /Barbearia/);
});

test("SPEC 9 resiliência: catalogo parado devolve 503 rápido, isola a falha e se recupera", async () => {
  compose("stop", "catalogo");
  try {
    const blocked = await book("10:00");
    assert.equal(blocked.status, 503);
    assert.equal(blocked.value.codigo, "SERVICO_INDISPONIVEL");
    assert.ok(blocked.ms < 3000, `respondeu em ${Math.round(blocked.ms)} ms`);
    assert.equal((await request("/health")).status, 503);
    const otherClient = await newClient();
    assert.equal(otherClient.status, 201, "clientes deve continuar respondendo sem o catalogo");
  } finally {
    compose("start", "catalogo");
  }
  await waitHealthy();
  assert.equal((await book("10:00")).status, 201, "volta a funcionar sem reiniciar o agendamento");
});

test("SPEC 9 resiliência: catalogo lento (acima do timeout) devolve 503 em vez de travar", async () => {
  compose("pause", "catalogo");
  try {
    const slow = await book("10:30");
    assert.equal(slow.status, 503);
    assert.equal(slow.value.codigo, "SERVICO_INDISPONIVEL");
    assert.ok(slow.ms >= 1900 && slow.ms < 3500, `respondeu em ${Math.round(slow.ms)} ms`);
  } finally {
    compose("unpause", "catalogo");
  }
  await waitHealthy();
});

test("SPEC 9 resiliência: autenticacao parado mantém tokens válidos e só o login falha", async () => {
  compose("stop", "autenticacao");
  try {
    assert.equal((await request("/clientes/eu", { token: customer.token })).status, 200);
    assert.equal((await request("/servicos", { token: adminToken })).status, 200);
    const login = await request("/auth/barbearia", {
      method: "POST",
      body: { login: process.env.BARBERIA_LOGIN || "admin", senha: process.env.BARBERIA_PASSWORD }
    });
    assert.notEqual(login.status, 200);
  } finally {
    compose("start", "autenticacao");
  }
  await waitHealthy();
});
