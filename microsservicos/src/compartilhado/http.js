import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { AppError, badRequest, notFound } from "./errors.js";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};
const maxBodyBytes = 1_048_576;

// Declara uma rota: caminho exato (string) ou expressão regular com grupos para os parâmetros.
export function rota(metodo, caminho, status, executar) {
  return { metodo, caminho, status, executar };
}

export function respond(response, status, value) {
  if (status === 204) {
    response.writeHead(status).end();
    return;
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export async function readBody(request) {
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

function findRoute(rotas, method, pathname) {
  for (const item of rotas) {
    if (item.metodo !== method) continue;
    if (typeof item.caminho === "string") {
      if (item.caminho === pathname) return { item, params: [] };
    } else {
      const match = pathname.match(item.caminho);
      if (match) return { item, params: match.slice(1) };
    }
  }
  return null;
}

async function serveStatic(webRoot, pathname, response) {
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

// Servidor HTTP comum às duas arquiteturas. `verificarSaude` lança erro quando a
// aplicação (ou o serviço) não está pronta; `webRoot` só é usado por quem serve a interface.
export function createAppServer({ rotas, verificarSaude, webRoot }) {
  async function route(request, response, url) {
    const { pathname, searchParams } = url;
    const method = request.method || "GET";

    if (pathname === "/health" && method === "GET") {
      try {
        await verificarSaude();
        respond(response, 200, { status: "ok" });
      } catch {
        respond(response, 503, { status: "unavailable" });
      }
      return;
    }

    const found = findRoute(rotas, method, pathname);
    if (found) {
      const value = await found.item.executar({
        request,
        params: found.params,
        query: searchParams,
        corpo: () => readBody(request)
      });
      respond(response, found.item.status, value);
      return;
    }

    if (pathname.startsWith("/api/")) throw notFound("Rota da API não encontrada.");
    if (!webRoot) throw notFound();
    await serveStatic(webRoot, pathname, response);
  }

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
