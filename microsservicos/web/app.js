const state = {
  token: sessionStorage.getItem("barbearia-token"),
  role: sessionStorage.getItem("barbearia-role"),
  client: null,
  section: null,
  barbers: [],
  services: [],
  appointments: [],
  slots: [],
  selectedTime: "",
  notice: ""
};

const app = document.querySelector("#app");
const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "BRL"
}).format(value / 100);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[char]);
const roleLabel = () => state.role === "CLIENTE" ? state.client?.nome : "Área da barbearia";

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(result.erro || "Não foi possível concluir a operação.");
  }
  return result;
}

function showNotice(message, error = false) {
  state.notice = message ? `<div class="notice${error ? " error" : ""}" role="status">${escapeHtml(message)}</div>` : "";
  const main = document.querySelector(".main");
  if (!main || !state.notice) return;
  const current = main.querySelector(".notice");
  if (current) current.outerHTML = state.notice;
  else main.insertAdjacentHTML("afterbegin", state.notice);
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function loginView(mode = "cliente", registering = false) {
  const notice = state.notice;
  state.notice = "";
  app.innerHTML = `
    <main class="auth-wrap"><section class="auth-card">
      <div class="brand"><span class="brand-mark">B</span> Barbearia</div>
      <p class="muted">Acesse sua conta ou cadastre-se para agendar.</p>
      ${notice}
      <div class="auth-tabs">
        <button type="button" class="${mode === "cliente" ? "active" : ""}" data-auth-mode="cliente">Cliente</button>
        <button type="button" class="${mode === "barbearia" ? "active" : ""}" data-auth-mode="barbearia">Barbearia</button>
      </div>
      <form id="auth-form" class="form-grid">
        ${mode === "cliente" && registering ? `<div class="field full"><label for="nome">Nome completo</label><input id="nome" name="nome" maxlength="60" autocomplete="name" required></div>` : ""}
        ${mode === "barbearia" ? `<div class="field full"><label for="login">Login</label><input id="login" name="login" autocomplete="username" required></div>` : `<div class="field full"><label for="telefone">Telefone com DDD</label><input id="telefone" name="telefone" inputmode="numeric" autocomplete="tel" placeholder="82999998888" required></div>`}
        <div class="field full"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="${registering ? "new-password" : "current-password"}" required></div>
        <button class="button field full" type="submit">${registering ? "Criar conta" : "Entrar"}</button>
      </form>
      ${mode === "cliente" ? `<button id="toggle-register" class="button secondary" type="button" style="width:100%;margin-top:10px">${registering ? "Já tenho cadastro" : "Cadastrar cliente"}</button>` : ""}
    </section></main>`;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => {
    state.notice = "";
    loginView(button.dataset.authMode, false);
  }));
  document.querySelector("#toggle-register")?.addEventListener("click", () => loginView("cliente", !registering));
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (mode === "cliente" && registering) {
        await api("/clientes", { method: "POST", body: JSON.stringify(values) });
      }
      const endpoint = mode === "cliente" ? "/auth/cliente" : "/auth/barbearia";
      const payload = mode === "cliente"
        ? { telefone: values.telefone, senha: values.senha }
        : { login: values.login, senha: values.senha };
      const result = await api(endpoint, { method: "POST", body: JSON.stringify(payload) });
      state.token = result.token;
      state.role = mode === "cliente" ? "CLIENTE" : "BARBEARIA";
      sessionStorage.setItem("barbearia-token", state.token);
      sessionStorage.setItem("barbearia-role", state.role);
      await initialize();
    } catch (error) {
      showNotice(error.message, true);
      loginView(mode, registering);
    }
  });
}

function logout(show = true) {
  state.token = null;
  state.role = null;
  state.client = null;
  sessionStorage.removeItem("barbearia-token");
  sessionStorage.removeItem("barbearia-role");
  showNotice(show ? "Sessão encerrada." : "");
  loginView();
}

async function initialize() {
  try {
    if (!state.token || !["CLIENTE", "BARBEARIA"].includes(state.role)) {
      loginView();
      return;
    }
    if (state.role === "CLIENTE") state.client = await api("/clientes/eu");
    const [barbers, services, appointments] = await Promise.all([
      api(state.role === "CLIENTE" ? "/barbeiros?ativo=true" : "/barbeiros"),
      api("/servicos"),
      api("/agendamentos")
    ]);
    state.barbers = barbers;
    state.services = services;
    state.appointments = appointments.itens;
    state.section ||= state.role === "CLIENTE" ? "agendar" : "agenda";
    render();
  } catch (error) {
    if (state.token) logout(false);
    showNotice(error.message, true);
    loginView();
  }
}

function navItems() {
  return state.role === "CLIENTE"
    ? [["agendar", "Agendar"], ["meus", "Meus agendamentos"], ["notificacoes", "Notificações"]]
    : [["agenda", "Agenda"], ["barbeiros", "Barbeiros"], ["servicos", "Serviços"], ["configuracao", "Expediente"], ["estatisticas", "Estatísticas"]];
}

function layout(content, notice) {
  const nav = navItems().map(([id, label]) =>
    `<button type="button" data-section="${id}" class="${state.section === id ? "active" : ""}">${label}</button>`
  ).join("");
  app.innerHTML = `<div class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">B</span><span>Barbearia</span></div>
      <div class="topbar-actions"><small>${escapeHtml(roleLabel())}</small><button id="logout" class="button secondary small">Sair</button></div>
    </header>
    <nav class="nav" aria-label="Navegação">${nav}</nav>
    <main class="main">
      ${notice}
      ${content}
    </main>
  </div>`;
  document.querySelectorAll("[data-section]").forEach((button) => button.addEventListener("click", async () => {
    state.section = button.dataset.section;
    state.notice = "";
    await render();
  }));
  document.querySelector("#logout").addEventListener("click", () => logout());
}

function appointmentForm(admin) {
  const min = dateOffset(1);
  const max = dateOffset(30);
  return `<section class="panel">
    <h2>${admin ? "Agendar para cliente cadastrado" : "Novo agendamento"}</h2>
    <form id="booking-form" class="form-grid">
      ${admin ? `<div class="field"><label>Nome do cliente</label><input name="nome" minlength="3" maxlength="60" required></div><div class="field"><label>Telefone cadastrado</label><input name="telefone" inputmode="numeric" required></div>` : ""}
      <div class="field"><label>Barbeiro</label><select name="barbeiroId" required>${state.barbers.filter((barber) => barber.ativo).map((barber) => `<option value="${barber.id}">${escapeHtml(barber.nome)}</option>`).join("")}</select></div>
      <div class="field"><label>Serviço</label><select name="servicoId" required>${state.services.map((service) => `<option value="${service.id}">${escapeHtml(service.nome)} · ${money(service.precoCentavos)}</option>`).join("")}</select></div>
      <div class="field"><label>Data</label><input name="data" type="date" min="${min}" max="${max}" required></div>
      <div class="field full"><label>Horários disponíveis</label><div id="slots" class="slot-list"><span class="muted small-text">Selecione barbeiro, serviço e data.</span></div></div>
      <button class="button field full" type="submit">Confirmar agendamento</button>
    </form>
  </section>`;
}

function appointmentCard(item, admin) {
  const active = item.situacao === "AGENDADO";
  return `<article class="appointment">
    <div><strong>${escapeHtml(item.nomeCliente)}</strong><p class="muted small-text">${escapeHtml(item.telefoneCliente)}</p></div>
    <div><strong>${escapeHtml(item.data)} · ${escapeHtml(item.horario)}</strong><p>${escapeHtml(item.nomeServico)}</p></div>
    <div><p>${escapeHtml(item.nomeBarbeiro)}</p><span class="status ${item.situacao}">${item.situacao}</span></div>
    <div><strong>${money(item.precoCentavos)}</strong>
      ${admin ? `<div class="actions">
        ${active ? `<button class="button small" data-action="attend" data-id="${item.id}">Atender</button><button class="button secondary small" data-action="cancel" data-id="${item.id}">Cancelar</button>` : ""}
        <button class="button danger small" data-action="delete" data-id="${item.id}">Excluir</button>
      </div>` : active ? `<div class="field" style="margin-top:8px"><label>Método de pagamento</label><select data-payment-method="${item.id}"><option>Pix</option><option>Cartão de crédito</option><option>Cartão de débito</option></select><button class="button small" data-action="pay" data-id="${item.id}" style="margin-top:6px">Pagar</button><button class="button secondary small" data-action="cancel" data-id="${item.id}" style="margin-top:6px">Cancelar</button></div>` : ""}
    </div>
  </article>`;
}

async function clientBookingView() {
  return `<h1>Agendar atendimento</h1><p class="muted">Escolha barbeiro, serviço, data e um horário disponível.</p>${appointmentForm(false)}`;
}

function clientAppointmentsView() {
  return `<h1>Meus agendamentos</h1><p class="muted">Seus próximos horários e histórico.</p>
    <div class="list">${state.appointments.map((item) => appointmentCard(item, false)).join("") || `<div class="panel empty">Você ainda não possui agendamentos.</div>`}</div>`;
}

function notificationView() {
  return `<h1>Preferências de notificação</h1><section class="panel">
    <p>As notificações do dia do atendimento são enviadas por WhatsApp simulado.</p>
    <form id="notification-form">
      <label class="field"><span>Receber notificações</span><select name="receberNotificacoes">
        <option value="true" ${state.client.receberNotificacoes ? "selected" : ""}>Sim</option>
        <option value="false" ${!state.client.receberNotificacoes ? "selected" : ""}>Não</option>
      </select></label>
      <input type="hidden" name="canal" value="WhatsApp">
      <div class="actions"><button class="button" type="submit">Salvar preferências</button></div>
    </form>
  </section>`;
}

function adminAgendaView() {
  const today = dateOffset(0);
  return `<h1>Agenda</h1><p class="muted">Agendamentos ordenados por data e horário.</p>
    <section class="panel"><div class="toolbar">
      <div class="field"><label>Buscar por cliente</label><input id="appointment-search" placeholder="Nome do cliente"></div>
      <div class="field"><label>Data (opcional)</label><input id="appointment-date" type="date" value=""></div>
      <button class="button" id="search-appointments">Buscar</button>
      <span class="muted">Ativos: ${state.appointments.filter((item) => item.situacao === "AGENDADO").length} · Faturamento previsto: ${money(state.appointments.filter((item) => item.situacao === "AGENDADO").reduce((sum, item) => sum + item.precoCentavos, 0))}</span>
    </div></section>
    ${appointmentForm(true)}
    <div class="list">${state.appointments.map((item) => appointmentCard(item, true)).join("") || `<div class="panel empty">Nenhum agendamento encontrado.</div>`}
      <p class="muted small-text">Hoje: ${today}</p></div>`;
}

function barberView() {
  return `<h1>Barbeiros</h1><section class="panel"><h2>Cadastrar barbeiro</h2>
    <form id="barber-create" class="form-grid"><div class="field"><label>Nome</label><input name="nome" minlength="3" maxlength="60" required></div><button class="button" type="submit">Cadastrar</button></form>
    </section><div class="list">${state.barbers.map((barber) => `    <article class="panel form-grid">
      <div class="field"><label>Nome</label><input name="nome" data-barber-name="${barber.id}" value="${escapeHtml(barber.nome)}"></div>
      <div class="actions"><span class="status ${barber.ativo ? "" : "CANCELADO"}">${barber.ativo ? "Ativo" : "Inativo"}</span><button class="button small" data-action="save-barber" data-id="${barber.id}">Salvar</button>${barber.ativo ? `<button class="button secondary small" data-action="deactivate-barber" data-id="${barber.id}">Desativar</button>` : ""}</div>
    </article>`).join("") || `<div class="panel empty">Nenhum barbeiro cadastrado.</div>`}</div>`;
}

function serviceView() {
  return `<h1>Serviços</h1><section class="panel"><h2>Cadastrar serviço</h2>
    <form id="service-create" class="form-grid">
      <div class="field"><label>Nome</label><input name="nome" required></div>
      <div class="field"><label>Duração (minutos)</label><input name="duracaoMinutos" type="number" min="30" step="30" value="30" required></div>
      <div class="field"><label>Preço (centavos)</label><input name="precoCentavos" type="number" min="0" step="1" required></div>
      <div class="field"><label>Custo (centavos)</label><input name="custoCentavos" type="number" min="0" step="1" value="0" required></div>
      <button class="button field full" type="submit">Cadastrar serviço</button>
    </form></section>
    <div class="list">${state.services.map((service) => `<article class="panel">
      <form class="service-edit form-grid" data-service="${service.id}">
        <div class="field"><label>Nome</label><input name="nome" value="${escapeHtml(service.nome)}" required></div>
        <div class="field"><label>Duração (minutos)</label><input name="duracaoMinutos" type="number" min="30" step="30" value="${service.duracaoMinutos}" required></div>
        <div class="field"><label>Preço (centavos)</label><input name="precoCentavos" type="number" min="0" value="${service.precoCentavos}" required></div>
        <div class="field"><label>Custo (centavos)</label><input name="custoCentavos" type="number" min="0" value="${service.custoCentavos}" required></div>
        <button class="button field full" type="submit">Salvar ${escapeHtml(service.nome)}</button>
      </form>
    </article>`).join("")}</div>`;
}

async function configurationView() {
  const config = await api("/configuracao/expediente");
  return `<h1>Expediente</h1><section class="panel">
    <p>Almoço (12:00, 12:30 e 13:00) e dias fechados (domingo e segunda-feira) são fixos.</p>
    <form id="hours-form" class="form-grid">
      <div class="field"><label>Hora de abertura</label><input type="time" name="horaAbertura" step="1800" value="${config.horaAbertura}" required></div>
      <div class="field"><label>Último horário de início</label><input type="time" name="ultimoHorario" step="1800" value="${config.ultimoHorario}" required></div>
      <button class="button field full" type="submit">Salvar expediente</button>
    </form></section>`;
}

async function statisticsView() {
  return `<h1>Estatísticas</h1><section class="panel">
    <form id="stats-form" class="form-grid">
      <div class="field"><label>Período</label><select name="periodo"><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select></div>
      <div class="field"><label>Referência</label><input name="referencia" type="date" value="${dateOffset(0)}" required></div>
      <div class="field"><label>Barbeiro</label><select name="barbeiroId"><option value="">Todos</option>${state.barbers.map((barber) => `<option value="${barber.id}">${escapeHtml(barber.nome)}</option>`).join("")}</select></div>
      <button class="button" type="submit">Consultar</button>
    </form><div id="stats-result"></div></section>`;
}

async function render() {
  let content;
  if (state.role === "CLIENTE") {
    if (state.section === "agendar") content = await clientBookingView();
    else if (state.section === "meus") content = clientAppointmentsView();
    else content = notificationView();
  } else {
    if (state.section === "agenda") content = adminAgendaView();
    else if (state.section === "barbeiros") content = barberView();
    else if (state.section === "servicos") content = serviceView();
    else if (state.section === "configuracao") content = await configurationView();
    else content = await statisticsView();
  }
  const notice = state.notice;
  state.notice = "";
  layout(content, notice);
  bindForms();
}

async function refreshAppointments() {
  const results = await api("/agendamentos");
  state.appointments = results.itens;
}

async function refreshSlots(form) {
  const barber = form.elements.barbeiroId.value;
  const service = form.elements.servicoId.value;
  const date = form.elements.data.value;
  state.selectedTime = "";
  if (!barber || !service || !date) {
    state.slots = [];
  } else {
    const query = new URLSearchParams({ barbeiroId: barber, servicoId: service, data: date });
    const response = await api(`/disponibilidade?${query}`);
    state.slots = response.horarios;
  }
  const root = document.querySelector("#slots");
  if (!root) return;
  root.innerHTML = state.slots.map((time) =>
    `<button type="button" class="slot" data-slot="${time}">${time}</button>`
  ).join("") || `<span class="muted small-text">${date ? "Nenhum horário disponível." : "Selecione barbeiro, serviço e data."}</span>`;
  root.querySelectorAll("[data-slot]").forEach((button) => button.addEventListener("click", () => {
    state.selectedTime = button.dataset.slot;
    root.querySelectorAll(".slot").forEach((item) => item.classList.toggle("selected", item === button));
  }));
}

function formValues(form) {
  return Object.fromEntries(new FormData(form));
}

async function submitBooking(form) {
  const values = formValues(form);
  if (!state.selectedTime) throw new Error("Selecione um horário disponível.");
  values.horario = state.selectedTime;
  await api("/agendamentos", { method: "POST", body: JSON.stringify(values) });
  await refreshAppointments();
  showNotice("Agendamento confirmado.");
  state.section = state.role === "CLIENTE" ? "meus" : "agenda";
  await render();
}

function renderStatsResult(result) {
  document.querySelector("#stats-result").innerHTML = `<div class="grid" style="margin-top:18px">
    <div class="panel"><strong>Agendamentos ativos</strong><p>${result.agendados}</p></div>
    <div class="panel"><strong>Atendidos</strong><p>${result.atendidos}</p></div>
    <div class="panel"><strong>Faturamento previsto</strong><p>${money(result.faturamentoPrevistoCentavos)}</p></div>
    <div class="panel"><strong>Faturamento registrado</strong><p>${money(result.faturamentoRegistradoCentavos)}</p></div>
    <div class="panel"><strong>Lucro previsto</strong><p>${money(result.lucroPrevistoCentavos)}</p></div>
    <div class="panel"><strong>Lucro registrado</strong><p>${money(result.lucroRegistradoCentavos)}</p></div>
  </div>`;
}

function bindForms() {
  const booking = document.querySelector("#booking-form");
  if (booking) {
    booking.elements.barbeiroId.addEventListener("change", () => refreshSlots(booking).catch((error) => showNotice(error.message, true)));
    booking.elements.servicoId.addEventListener("change", () => refreshSlots(booking).catch((error) => showNotice(error.message, true)));
    booking.elements.data.addEventListener("change", () => refreshSlots(booking).catch((error) => showNotice(error.message, true)));
    booking.addEventListener("submit", (event) => {
      event.preventDefault();
      submitBooking(booking).catch((error) => {
        showNotice(error.message, true);
        render().then(() => showNotice(error.message, true));
      });
    });
  }
  document.querySelector("#notification-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    values.receberNotificacoes = values.receberNotificacoes === "true";
    try {
      state.client = await api("/clientes/eu/notificacoes", { method: "PUT", body: JSON.stringify(values) });
      showNotice("Preferências salvas.");
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  });
  document.querySelector("#search-appointments")?.addEventListener("click", async () => {
    const params = new URLSearchParams();
    const name = document.querySelector("#appointment-search").value;
    const date = document.querySelector("#appointment-date").value;
    if (name) params.set("nomeCliente", name);
    if (date) params.set("data", date);
    try {
      const result = await api(`/agendamentos?${params}`);
      state.appointments = result.itens;
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  });
  document.querySelector("#barber-create")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/barbeiros", { method: "POST", body: JSON.stringify(formValues(event.currentTarget)) });
      await initialize();
      state.section = "barbeiros";
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  });
  document.querySelectorAll(".service-edit").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formValues(form);
    for (const key of ["duracaoMinutos", "precoCentavos", "custoCentavos"]) data[key] = Number(data[key]);
    try {
      await api(`/servicos/${form.dataset.service}`, { method: "PUT", body: JSON.stringify(data) });
      await initialize();
      state.section = "servicos";
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  }));
  document.querySelector("#service-create")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formValues(event.currentTarget);
    for (const key of ["duracaoMinutos", "precoCentavos", "custoCentavos"]) data[key] = Number(data[key]);
    try {
      await api("/servicos", { method: "POST", body: JSON.stringify(data) });
      await initialize();
      state.section = "servicos";
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  });
  document.querySelector("#hours-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/configuracao/expediente", { method: "PUT", body: JSON.stringify(formValues(event.currentTarget)) });
      showNotice("Expediente atualizado.");
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  });
  document.querySelector("#stats-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);
    const period = values.periodo;
    values.referencia = period === "mes" ? values.referencia.slice(0, 7) : period === "ano" ? values.referencia.slice(0, 4) : values.referencia;
    const params = new URLSearchParams({ periodo: values.periodo, referencia: values.referencia });
    if (values.barbeiroId) params.set("barbeiroId", values.barbeiroId);
    try { renderStatsResult(await api(`/estatisticas?${params}`)); }
    catch (error) { showNotice(error.message, true); await render(); }
  });
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    const { action, id } = button.dataset;
    try {
      if (action === "attend") {
        await api(`/agendamentos/${id}/atender`, { method: "POST" });
      } else if (action === "cancel") {
        if (!confirm("Deseja cancelar este agendamento?")) return;
        await api(`/agendamentos/${id}/cancelar`, { method: "POST" });
      } else if (action === "delete-barber") {
        await api(`/barbeiros/${id}/desativar`, { method: "POST" });
      } else if (action === "save-barber") {
        const nome = document.querySelector(`[data-barber-name="${id}"]`).value;
        await api(`/barbeiros/${id}`, { method: "PUT", body: JSON.stringify({ nome }) });
      } else if (action === "deactivate-barber") {
        await api(`/barbeiros/${id}/desativar`, { method: "POST" });
      } else if (action === "delete") {
        if (!confirm("Excluir este agendamento? Esta ação não pode ser desfeita.")) return;
        await api(`/agendamentos/${id}`, { method: "DELETE" });
      } else if (action === "pay") {
        const metodo = document.querySelector(`[data-payment-method="${id}"]`).value;
        const payment = await api(`/agendamentos/${id}/pagamento`, { method: "POST", body: JSON.stringify({ metodo }) });
        showNotice(`Pagamento simulado iniciado · ${payment.metodo} · referência ${payment.referenciaExterna}`);
      }
      if (action !== "pay") showNotice("Alteração salva.");
      await initialize();
      if (state.role === "BARBEARIA") state.section = "agenda";
      await render();
    } catch (error) { showNotice(error.message, true); await render(); }
  }));
}

document.addEventListener("submit", (event) => {
  if (event.target.id === "stats-form" || event.target.id === "booking-form") event.preventDefault();
});

initialize();
