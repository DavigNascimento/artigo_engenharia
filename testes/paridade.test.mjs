import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Paridade entre as implementações (SPEC 1 e 8.2): a comparação só mede a arquitetura se o
// resto for igual. Este teste falha quando algum arquivo que deve ser idêntico diverge,
// quando os adaptadores (dependencias.js) expõem interfaces diferentes ou quando o esquema
// de alguma tabela muda numa implementação e não na outra.

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mono = join(raiz, "monolito");
const micro = join(raiz, "microsservicos");
const modulos = ["autenticacao", "clientes", "catalogo", "agendamento", "pagamentos"];

async function arquivosDe(pasta) {
  const entradas = await readdir(pasta, { withFileTypes: true, recursive: true });
  return entradas.filter((entrada) => entrada.isFile())
    .map((entrada) => relative(pasta, join(entrada.parentPath ?? entrada.path, entrada.name)))
    .sort();
}

const identicos = [
  ...["auth", "clock", "db", "errors", "http", "inicializacao", "validation"].map((nome) => `src/compartilhado/${nome}.js`),
  ...modulos.flatMap((modulo) => ["index", "repository", "rotas"].map((nome) => `src/${modulo}/${nome}.js`)),
  "src/agendamento/domain.js",
  "src/pagamentos/provider.js",
  "src/notificacoes/index.js",
  "tests/unit/auth.test.js",
  "tests/unit/domain.test.js",
  "tests/unit/fronteiras.test.js",
  "package.json",
  "package-lock.json",
  ".env.example"
];

test("código de domínio, rotas, repositórios, testes unitários e dependências são idênticos", async () => {
  for (const arquivo of identicos) {
    const [a, b] = await Promise.all([readFile(join(mono, arquivo), "utf8"), readFile(join(micro, arquivo), "utf8")]);
    assert.ok(a === b, `${arquivo} difere entre monolito/ e microsservicos/`);
  }
});

test("a interface web é a mesma nas duas arquiteturas (SPEC 5.3)", async () => {
  const [a, b] = await Promise.all([arquivosDe(join(mono, "web")), arquivosDe(join(micro, "web"))]);
  assert.deepEqual(a, b);
  for (const arquivo of a) {
    const [x, y] = await Promise.all([readFile(join(mono, "web", arquivo)), readFile(join(micro, "web", arquivo))]);
    assert.ok(x.equals(y), `web/${arquivo} difere`);
  }
});

function interfaces(codigo) {
  const resultado = {};
  for (const bloco of codigo.matchAll(/export const (\w+) = \{([\s\S]*?)\n\};/g)) {
    resultado[bloco[1]] = [...bloco[2].matchAll(/^\s+(\w+): \(/gm)].map((item) => item[1]).sort();
  }
  return resultado;
}

test("os adaptadores dependencias.js expõem a mesma interface nas duas arquiteturas", async () => {
  for (const modulo of [...modulos, "notificacoes"]) {
    let a;
    try {
      a = await readFile(join(mono, "src", modulo, "dependencias.js"), "utf8");
    } catch {
      continue;
    }
    const b = await readFile(join(micro, "src", modulo, "dependencias.js"), "utf8");
    assert.deepEqual(interfaces(a), interfaces(b), `${modulo}/dependencias.js tem interfaces diferentes`);
  }
});

// Normaliza o SQL de cada tabela, ignorando apenas as chaves estrangeiras entre módulos,
// que existem só no monolito (SPEC 8.4).
function tabelas(sql) {
  const resultado = {};
  const limpo = sql.replace(/--.*$/gm, "");
  for (const bloco of limpo.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    resultado[bloco[1]] = bloco[2]
      .replace(/ REFERENCES (?!agendamentos\(id\) ON DELETE CASCADE)\w+\(\w+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  for (const indice of limpo.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)\s+ON (\w+) \(([^)]*)\)/g)) {
    resultado[`indice:${indice[1]}`] = `${indice[2]}(${indice[3]})`;
  }
  return resultado;
}

test("o esquema de cada tabela é o mesmo (exceto chaves estrangeiras entre módulos)", async () => {
  const monolito = tabelas(await readFile(join(mono, "migrations/001_init.sql"), "utf8"));
  const micro = {};
  for (const modulo of modulos) {
    Object.assign(micro, tabelas(await readFile(join(raiz, "microsservicos/src", modulo, "migrations/001_init.sql"), "utf8")));
  }
  assert.deepEqual(Object.keys(micro).sort(), Object.keys(monolito).sort());
  for (const [nome, definicao] of Object.entries(micro)) {
    assert.equal(definicao, monolito[nome], `tabela ${nome} difere`);
  }
});
