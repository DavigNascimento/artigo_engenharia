import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { requireRole } from "./compartilhado/auth.js";
import { AppError, badRequest, notFound } from "./compartilhado/errors.js";
import { pool } from "./compartilhado/db.js";
import { loginBarbershop, loginClient } from "./autenticacao/index.js";
import {
  getCurrentClient, findClientByPhone, registerClient, updateNotifications
} from "./clientes/index.js";
import {
  createBarber, createService, deactivateBarber, getOpeningHours, listBarbers,
  listServices, setOpeningHours, updateBarber, updateService
} from "./catalogo/index.js";
import {
  changeAppointmentStatus, createAppointment, deleteAppointment, getAppointment,
  getAvailability, getStatistics, listAppointments
} from "./agendamento/index.js";
import { createPayment, getPayment } from "./pagamentos/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(root, "../web");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
const maxBodyBytes = 1_048_576;

function respond(response, status, value) {
  if (status === 204) {
    response.writeHead(status).end();
    return;
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) throw badRequest("Corpo da requisição excede o limite.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected JSON object");
    return body;
  } catch {
    throw badRequest("Corpo JSON inválido.");
  }
}

function auth(request, ...roles) {
  return requireRole(request, roles);
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = resolve(webRoot, normalize(requested));
  const relativeFile = relative(webRoot, file);
  if (relativeFile.startsWith(`..${sep}`) || relativeFile === ".." || isAbsolute(relativeFile)) {
    throw notFound();
  }
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") throw notFound();
    throw error;
  }
}

async function route(request, response, url) {
  const { pathname, searchParams } = url;
  const method = request.method || "GET";

  if (pathname === "/health" && method === "GET") {
    try {
      await pool.query("SELECT 1");
      respond(response, 200, { status: "ok" });
    } catch {
      respond(response, 503, { status: "unavailable" });
    }
    return;
  }

  if (method === "POST" && pathname === "/clientes") {
    respond(response, 201, await registerClient(await readBody(request)));
    return;
  }
  if (method === "POST" && pathname === "/auth/cliente") {
    respond(response, 200, await loginClient(await readBody(request)));
    return;
  }
  if (method === "POST" && pathname === "/auth/barbearia") {
    respond(response, 200, await loginBarbershop(await readBody(request)));
    return;
  }

  if (method === "GET" && pathname === "/clientes/eu") {
    respond(response, 200, await getCurrentClient(auth(request, "CLIENTE")));
    return;
  }
  if (method === "GET" && pathname === "/clientes") {
    auth(request, "BARBEARIA");
    const phone = searchParams.get("telefone");
    if (!phone) throw badRequest("Informe telefone.");
    respond(response, 200, await findClientByPhone(phone));
    return;
  }
  if (method === "PUT" && pathname === "/clientes/eu/notificacoes") {
    respond(response, 200, await updateNotifications(auth(request, "CLIENTE"), await readBody(request)));
    return;
  }

  if (pathname === "/barbeiros" && method === "GET") {
    auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 200, await listBarbers(searchParams.get("ativo") ?? undefined));
    return;
  }
  if (pathname === "/barbeiros" && method === "POST") {
    auth(request, "BARBEARIA");
    respond(response, 201, await createBarber(await readBody(request)));
    return;
  }
  let match = pathname.match(/^\/barbeiros\/([^/]+)\/desativar$/);
  if (match && method === "POST") {
    auth(request, "BARBEARIA");
    respond(response, 200, await deactivateBarber(match[1]));
    return;
  }
  match = pathname.match(/^\/barbeiros\/([^/]+)$/);
  if (match && method === "PUT") {
    auth(request, "BARBEARIA");
    respond(response, 200, await updateBarber(match[1], await readBody(request)));
    return;
  }

  if (pathname === "/servicos" && method === "GET") {
    auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 200, await listServices());
    return;
  }
  if (pathname === "/servicos" && method === "POST") {
    auth(request, "BARBEARIA");
    respond(response, 201, await createService(await readBody(request)));
    return;
  }
  match = pathname.match(/^\/servicos\/([^/]+)$/);
  if (match && method === "PUT") {
    auth(request, "BARBEARIA");
    respond(response, 200, await updateService(match[1], await readBody(request)));
    return;
  }

  if (pathname === "/configuracao/expediente" && method === "GET") {
    auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 200, await getOpeningHours());
    return;
  }
  if (pathname === "/configuracao/expediente" && method === "PUT") {
    auth(request, "BARBEARIA");
    respond(response, 200, await setOpeningHours(await readBody(request)));
    return;
  }

  if (pathname === "/disponibilidade" && method === "GET") {
    auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 200, await getAvailability({
      barberId: searchParams.get("barbeiroId"),
      serviceId: searchParams.get("servicoId"),
      date: searchParams.get("data")
    }));
    return;
  }
  if (pathname === "/agendamentos" && method === "POST") {
    const user = auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 201, await createAppointment(user, await readBody(request)));
    return;
  }
  if (pathname === "/agendamentos" && method === "GET") {
    const user = auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 200, await listAppointments(user, {
      nomeCliente: searchParams.get("nomeCliente") ?? undefined,
      barbeiroId: searchParams.get("barbeiroId") ?? undefined,
      data: searchParams.get("data") ?? undefined,
      situacao: searchParams.get("situacao") ?? undefined
    }));
    return;
  }

  match = pathname.match(/^\/agendamentos\/([^/]+)\/(atender|cancelar)$/);
  if (match && method === "POST") {
    const action = match[2] === "atender" ? "ATENDIDO" : "CANCELADO";
    const user = action === "ATENDIDO"
      ? auth(request, "BARBEARIA")
      : auth(request, "CLIENTE", "BARBEARIA");
    respond(response, 200, await changeAppointmentStatus(match[1], user, action));
    return;
  }
  match = pathname.match(/^\/agendamentos\/([^/]+)\/pagamento$/);
  if (match && method === "POST") {
    respond(response, 201, await createPayment(auth(request, "CLIENTE"), match[1], await readBody(request)));
    return;
  }
  if (match && method === "GET") {
    respond(response, 200, await getPayment(auth(request, "CLIENTE", "BARBEARIA"), match[1]));
    return;
  }
  match = pathname.match(/^\/agendamentos\/([^/]+)$/);
  if (match && method === "DELETE") {
    auth(request, "BARBEARIA");
    await deleteAppointment(match[1]);
    respond(response, 204);
    return;
  }
  if (match && method === "GET") {
    respond(response, 200, await getAppointment(match[1], auth(request, "CLIENTE", "BARBEARIA")));
    return;
  }

  if (pathname === "/estatisticas" && method === "GET") {
    auth(request, "BARBEARIA");
    respond(response, 200, await getStatistics({
      periodo: searchParams.get("periodo"),
      referencia: searchParams.get("referencia"),
      barbeiroId: searchParams.get("barbeiroId") ?? undefined
    }));
    return;
  }

  if (pathname.startsWith("/api/")) throw notFound("Rota da API não encontrada.");
  await serveStatic(pathname, response);
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const method = request.method || "GET";
    let pathname = "/";
    let status = 200;
    try {
      const url = new URL(request.url || "/", "http://localhost");
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        throw badRequest("Caminho da requisição inválido.");
      }
      await route(request, response, new URL(`${pathname}${url.search}`, "http://localhost"));
      if (response.statusCode) status = response.statusCode;
    } catch (error) {
      if (error instanceof AppError) {
        status = error.status;
        respond(response, error.status, { erro: error.message, codigo: error.codigo });
      } else {
        status = 500;
        console.error(JSON.stringify({ evento: "falha_requisicao", metodo: method, rota: pathname, status }));
        if (!response.headersSent) respond(response, 500, {
          erro: "Erro interno do servidor.",
          codigo: "ERRO_INTERNO"
        });
        else response.destroy();
      }
    } finally {
      console.info(JSON.stringify({ evento: "requisicao", metodo: method, rota: pathname, status }));
    }
  });
}
