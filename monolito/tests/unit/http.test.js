import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../../src/app.js";

let server;
let baseUrl;

before(async () => {
  server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("RNF3: serve a interface e os arquivos estáticos pelo mesmo processo HTTP", async () => {
  const [page, script] = await Promise.all([
    fetch(`${baseUrl}/`),
    fetch(`${baseUrl}/app.js`)
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Barbearia/);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
});

test("RFA2: exige autenticação nas rotas protegidas e usa o formato comum de erro", async () => {
  const response = await fetch(`${baseUrl}/servicos`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    erro: "Autenticação necessária.",
    codigo: "NAO_AUTENTICADO"
  });
});

test("RF1: rejeita corpo JSON sem os dados obrigatórios", async () => {
  const response = await fetch(`${baseUrl}/clientes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).codigo, "DADOS_INVALIDOS");
});

test("RNF4: impede que caminhos estáticos escapem da pasta web", async () => {
  const response = await fetch(`${baseUrl}/%2e%2e%2fsrc%2fserver.js`);
  assert.equal(response.status, 404);
});
