import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Fronteiras de módulo (SPEC 8.2/8.3 e 9): cada módulo só acessa as próprias tabelas e só
// fala com outro módulo pela interface pública (index.js), através do seu dependencias.js.
// O mesmo teste roda nas duas arquiteturas.

const src = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");

const tabelas = {
  autenticacao: ["usuarios_barbearia", "credenciais_clientes"],
  clientes: ["clientes"],
  catalogo: ["barbeiros", "servicos"],
  agendamento: ["agendamentos", "ocupacoes_horario", "configuracao_expediente"],
  pagamentos: ["pagamentos"],
  notificacoes: []
};

async function arquivos(modulo) {
  const entries = await readdir(join(src, modulo), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js")).map((entry) => entry.name);
}

function importacoes(codigo) {
  return [...codigo.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gms)].map((match) => match[1]);
}

test("SPEC 8.3: módulos só importam outros módulos pela interface pública, via dependencias.js", async () => {
  for (const modulo of Object.keys(tabelas)) {
    for (const arquivo of await arquivos(modulo)) {
      const codigo = await readFile(join(src, modulo, arquivo), "utf8");
      for (const alvo of importacoes(codigo)) {
        if (alvo.startsWith("node:") || alvo === "pg" || alvo.startsWith("./") || alvo.startsWith("../compartilhado/")) {
          continue;
        }
        assert.equal(arquivo, "dependencias.js", `${modulo}/${arquivo} importa ${alvo} diretamente`);
        assert.match(alvo, /^\.\.\/[a-z]+\/index\.js$/, `${modulo}/${arquivo} importa ${alvo}, que não é interface pública`);
      }
    }
  }
});

test("SPEC 8.3/8.4: cada módulo só acessa as próprias tabelas", async () => {
  const todas = Object.values(tabelas).flat();
  for (const [modulo, proprias] of Object.entries(tabelas)) {
    for (const arquivo of await arquivos(modulo)) {
      const codigo = await readFile(join(src, modulo, arquivo), "utf8");
      const usadas = [...codigo.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_]+)/g)]
        .map((match) => match[1])
        .filter((nome) => todas.includes(nome));
      for (const tabela of usadas) {
        assert.ok(proprias.includes(tabela), `${modulo}/${arquivo} acessa a tabela ${tabela} de outro módulo`);
      }
    }
  }
});
