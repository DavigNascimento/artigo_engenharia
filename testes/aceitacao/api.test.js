import test, { before } from "node:test";
import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8080";
const password = process.env.BARBERIA_PASSWORD;
let adminToken;
let haircutId;
let comboId;
let appointmentDate;
let sequence = Date.now() % 10_000_000;

async function request(path, { method = "GET", token, body } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const value = response.status === 204 ? null : await response.json();
  return { status: response.status, value };
}

function nextOpenDate() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 1) date.setUTCDate(date.getUTCDate() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

async function createClient(index = 1) {
  sequence = (sequence + 1) % 100_000_000;
  const phone = `82${String(sequence).padStart(8, "0")}`;
  const nome = `Cliente Teste ${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(65 + Math.floor(index / 26))}`;
  const registration = await request("/clientes", {
    method: "POST",
    body: { nome, telefone: phone, senha: "senha-de-aceitacao" }
  });
  assert.equal(registration.status, 201);
  const login = await request("/auth/cliente", {
    method: "POST",
    body: { telefone: phone, senha: "senha-de-aceitacao" }
  });
  assert.equal(login.status, 200);
  return { nome, telefone: phone, token: login.value.token };
}

async function createBarber(nome) {
  const result = await request("/barbeiros", {
    method: "POST", token: adminToken, body: { nome }
  });
  assert.equal(result.status, 201);
  return result.value.id;
}

async function book(client, barberId, time, serviceId = haircutId) {
  return request("/agendamentos", {
    method: "POST",
    token: client.token,
    body: { barbeiroId: barberId, servicoId: serviceId, data: appointmentDate, horario: time }
  });
}

before(async () => {
  assert.ok(password, "Defina BARBERIA_PASSWORD ao executar os testes de aceitação.");
  const health = await request("/health");
  assert.deepEqual(health, { status: 200, value: { status: "ok" } });
  const login = await request("/auth/barbearia", {
    method: "POST",
    body: { login: process.env.BARBERIA_LOGIN || "admin", senha: password }
  });
  assert.equal(login.status, 200);
  adminToken = login.value.token;
  appointmentDate = nextOpenDate();
  const services = await request("/servicos", { token: adminToken });
  assert.equal(services.status, 200);
  haircutId = services.value.find((service) => service.nome === "Corte")?.id;
  comboId = services.value.find((service) => service.nome === "Corte e barba")?.id;
  assert.ok(haircutId, "A migração deve criar o serviço Corte.");
  assert.ok(comboId);
  for (const [name, price] of [["Barba", 2500], ["Corte", 3500], ["Corte e barba", 5500]]) {
    assert.ok(services.value.some((service) => service.nome === name && service.precoCentavos === price));
  }
});

test("CT-01/21/42/43/44/45: health, cadastro, login, autorização e perfil", async () => {
  const customer = await createClient(1);
  const current = await request("/clientes/eu", { token: customer.token });
  assert.equal(current.status, 200);
  assert.equal(current.value.telefone, customer.telefone);
  assert.equal((await request("/agendamentos")).status, 401);
  assert.equal((await request("/barbeiros", { token: customer.token, method: "POST", body: { nome: "Teste" } })).status, 403);
  const clientList = await request(`/clientes?telefone=${customer.telefone}`, { token: adminToken });
  assert.equal(clientList.value.id, current.value.id);
});

test("CT-13/14/15/19/20/21/22/24/25/26/29/38/48/49: regras e filtros da API", async () => {
  const barberA = await createBarber("Barbeiro Aceitacao A");
  const barberB = await createBarber("Barbeiro Aceitacao B");
  const customer = await createClient(2);
  const otherCustomer = await createClient(3);
  const freeHaircut = await request(`/disponibilidade?barbeiroId=${barberA}&servicoId=${haircutId}&data=${appointmentDate}`, { token: adminToken });
  const freeCombo = await request(`/disponibilidade?barbeiroId=${barberA}&servicoId=${comboId}&data=${appointmentDate}`, { token: adminToken });
  assert.equal(freeHaircut.value.horarios.length, 16);
  assert.equal(freeCombo.value.horarios.length, 14);
  const first = await book(customer, barberA, "09:00");
  assert.equal(first.status, 201);
  assert.equal(first.value.precoCentavos, 3500);
  assert.equal(first.value.custoCentavos, 0);
  assert.equal((await book(otherCustomer, barberA, "09:00")).status, 409);
  const simultaneous = await book(otherCustomer, barberB, "09:00");
  assert.equal(simultaneous.status, 201);
  assert.equal((await request(`/agendamentos/${first.value.id}/cancelar`, {
    method: "POST", token: customer.token
  })).status, 200);
  const freed = await book(otherCustomer, barberA, "09:00");
  assert.equal(freed.status, 201);

  const second = await book(customer, barberB, "09:30");
  assert.equal(second.status, 201);
  const secondActive = await book(customer, barberB, "10:00");
  assert.equal(secondActive.status, 201);
  assert.equal((await book(customer, barberB, "10:30")).status, 422);
  assert.equal((await request(`/agendamentos/${second.value.id}/atender`, {
    method: "POST", token: adminToken
  })).status, 200);
  assert.equal((await request(`/agendamentos/${second.value.id}/atender`, {
    method: "POST", token: adminToken
  })).status, 422);
  const third = await book(customer, barberB, "10:30");
  assert.equal(third.status, 201);

  const snapshotBarber = await createBarber("Barbeiro Snapshot Teste");
  const snapshotService = await request("/servicos", {
    method: "POST", token: adminToken,
    body: { nome: "Servico Snapshot Teste", duracaoMinutos: 30, precoCentavos: 3500, custoCentavos: 0 }
  });
  assert.equal(snapshotService.status, 201);
  const originalClient = await createClient(30);
  const originalSnapshot = await book(originalClient, snapshotBarber, "09:00", snapshotService.value.id);
  assert.equal(originalSnapshot.status, 201);
  const changedService = await request(`/servicos/${snapshotService.value.id}`, {
    method: "PUT", token: adminToken,
    body: { nome: "Servico Snapshot Teste", duracaoMinutos: 30, precoCentavos: 4000, custoCentavos: 1500 }
  });
  assert.equal(changedService.status, 200);
  const snapshotClient = await createClient(31);
  const snapshot = await book(snapshotClient, snapshotBarber, "09:30", snapshotService.value.id);
  assert.equal(snapshot.status, 201);
  assert.equal(snapshot.value.precoCentavos, 4000);
  assert.equal(snapshot.value.custoCentavos, 1500);
  assert.equal((await request(`/agendamentos/${originalSnapshot.value.id}`, { token: adminToken })).value.precoCentavos, 3500);

  const unauthorizedRead = await request(`/agendamentos/${third.value.id}`, { token: otherCustomer.token });
  assert.equal(unauthorizedRead.status, 403);
  const payment = await request(`/agendamentos/${third.value.id}/pagamento`, {
    method: "POST", token: customer.token, body: { metodo: "Pix" }
  });
  assert.equal(payment.status, 201);
  assert.equal(payment.value.metodo, "Pix");
  assert.ok(payment.value.referenciaExterna);
  assert.equal(Object.keys(payment.value).some((key) => /cartao|cvv|numero/i.test(key)), false);

  const listing = await request("/agendamentos?nomeCliente=cliente", { token: adminToken });
  assert.equal(listing.status, 200);
  assert.ok(listing.value.itens.length >= 5);
  assert.equal(listing.value.itens.some((item, index, items) =>
    index > 0 && `${items[index - 1].data}${items[index - 1].horario}` > `${item.data}${item.horario}`
  ), false);
  const customerListing = await request("/agendamentos", { token: customer.token });
  assert.ok(customerListing.value.itens.every((item) => item.telefoneCliente === customer.telefone));
  assert.equal(customerListing.value.total, 3);

  const stats = await request(`/estatisticas?periodo=dia&referencia=${appointmentDate}`, { token: adminToken });
  assert.equal(stats.status, 200);
  assert.ok(stats.value.faturamentoPrevistoCentavos >= 3500);
  assert.ok(stats.value.lucroRegistradoCentavos >= 0);

  const settings = await request("/configuracao/expediente", { token: adminToken });
  assert.deepEqual(settings.value, { horaAbertura: "09:00", ultimoHorario: "18:00" });
  const changed = await request("/configuracao/expediente", {
    method: "PUT", token: adminToken, body: { horaAbertura: "10:00", ultimoHorario: "17:00" }
  });
  assert.equal(changed.status, 200);
  const availability = await request(`/disponibilidade?barbeiroId=${barberA}&servicoId=${haircutId}&data=${appointmentDate}`, { token: adminToken });
  assert.equal(availability.value.horarios.length, 12);
  assert.equal((await request("/configuracao/expediente", {
    method: "PUT", token: adminToken, body: { horaAbertura: "10:15", ultimoHorario: "17:00" }
  })).status, 400);
  await request("/configuracao/expediente", {
    method: "PUT", token: adminToken, body: { horaAbertura: "09:00", ultimoHorario: "18:00" }
  });
  const renamedBarber = await request(`/barbeiros/${barberB}`, {
    method: "PUT", token: adminToken, body: { nome: "Barbeiro Historico B" }
  });
  assert.equal(renamedBarber.status, 200);
  assert.equal((await request(`/barbeiros/${barberB}/desativar`, {
    method: "POST", token: adminToken
  })).status, 200);
  const history = await request(`/agendamentos/${simultaneous.value.id}`, { token: adminToken });
  assert.equal(history.value.nomeBarbeiro, "Barbeiro Historico B");
  assert.equal((await request(`/agendamentos/${first.value.id}`, { token: adminToken })).status, 200);
  assert.equal((await request(`/agendamentos/${first.value.id}`, { method: "DELETE", token: adminToken })).status, 204);
  assert.equal((await request(`/agendamentos/${first.value.id}`, { token: adminToken })).status, 404);
});

test("CT-40/RNF6: reservas concorrentes deixam exatamente um agendamento confirmado", async () => {
  const barber = await createBarber("Barbeiro Concorrencia Teste");
  const customers = await Promise.all(Array.from({ length: 20 }, (_, index) => createClient(index + 4)));
  const results = await Promise.all(customers.map((client) => book(client, barber, "15:00")));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 409).length, 19);
});
