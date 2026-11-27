#!/usr/bin/env node
// Executor do protocolo de medição (SPEC 11). Para cada repetição, arquitetura e cenário:
// zera o banco, sobe a pilha com os limites de recursos, mede o tempo até /health = 200,
// aquece, mede com k6, amostra docker stats e derruba tudo. A ordem das arquiteturas
// alterna entre repetições (A B C, C B A, ...) para não favorecer quem roda primeiro.
//
//   node testes/benchmark/executar.mjs
//
// Configuração por variáveis de ambiente (padrões entre parênteses):
//   ARQUITETURAS (monolito,microsservicos,monolito-gateway)  CENARIOS (read,write,mixed)
//   REPETICOES (5)  DURATION (30s)  AQUECIMENTO (15s; 0 desliga)  VUS, MAX_VUS, RATE,
//   START_RATE, TARGET_RATE, MASSA, HORARIO (repassadas ao k6)  MEDIR_BUILD (0)
//   SAIDA (testes/benchmark/resultados/<data-hora>)  K6_IMAGEM (imagem fixada abaixo)

import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import os from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "../..");
const k6Imagem = process.env.K6_IMAGEM ||
  "grafana/k6@sha256:3d8e5c7f1d53ec59408c2ffbd9943602a0985ffcbd4a2430ec00f3ffca89796e";

const arquiteturasDisponiveis = {
  monolito: {
    pasta: "monolito",
    arquivos: ["docker-compose.yml", "docker-compose.limites.yml"]
  },
  microsservicos: {
    pasta: "microsservicos",
    arquivos: ["docker-compose.yml", "docker-compose.limites.yml"]
  },
  "monolito-gateway": {
    pasta: "monolito",
    arquivos: [
      "docker-compose.yml", "docker-compose.gateway.yml",
      "docker-compose.limites.yml", "docker-compose.gateway-limites.yml"
    ]
  }
};

const lista = (valor, padrao) => (valor || padrao).split(",").map((item) => item.trim()).filter(Boolean);
const arquiteturas = lista(process.env.ARQUITETURAS, "monolito,microsservicos,monolito-gateway");
const cenarios = lista(process.env.CENARIOS, "read,write,mixed");
const repeticoes = Number(process.env.REPETICOES || 5);
const aquecimento = process.env.AQUECIMENTO ?? "15s";
const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
const saida = resolve(process.env.SAIDA || join(aqui, "resultados", carimbo));
const repassar = ["DURATION", "VUS", "MAX_VUS", "RATE", "START_RATE", "TARGET_RATE", "MASSA", "HORARIO"];
// Porta publicada no host (padrão 8080, SPEC 5.1). Repassada ao docker compose pelo ambiente.
const porta = process.env.PORTA || "8080";
process.env.PORTA = porta;

for (const nome of arquiteturas) {
  if (!arquiteturasDisponiveis[nome]) throw new Error(`Arquitetura desconhecida: ${nome}`);
}

function log(mensagem) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${mensagem}`);
}

function executar(comando, args, opcoes = {}) {
  return new Promise((done, fail) => {
    const filho = spawn(comando, args, { stdio: ["ignore", "pipe", "pipe"], ...opcoes });
    let saidaPadrao = "";
    let erro = "";
    filho.stdout.on("data", (parte) => { saidaPadrao += parte; });
    filho.stderr.on("data", (parte) => { erro += parte; });
    filho.on("error", fail);
    filho.on("close", (codigo) => done({ codigo, saida: saidaPadrao, erro }));
  });
}

async function compose(arquitetura, ...args) {
  const config = arquiteturasDisponiveis[arquitetura];
  const arquivos = config.arquivos.flatMap((arquivo) => ["-f", arquivo]);
  const resultado = await executar("docker", ["compose", "-p", `bench-${arquitetura}`, ...arquivos, ...args], {
    cwd: join(raiz, config.pasta)
  });
  if (resultado.codigo !== 0) {
    throw new Error(`docker compose ${args.join(" ")} (${arquitetura}) falhou:\n${resultado.erro}`);
  }
  return resultado.saida;
}

async function lerEnv(pasta) {
  const arquivo = join(raiz, pasta, ".env");
  if (!existsSync(arquivo)) throw new Error(`Crie ${arquivo} a partir do .env.example.`);
  const linhas = (await readFile(arquivo, "utf8")).split(/\r?\n/);
  return Object.fromEntries(linhas
    .filter((linha) => linha.includes("=") && !linha.trim().startsWith("#"))
    .map((linha) => [linha.slice(0, linha.indexOf("=")).trim(), linha.slice(linha.indexOf("=") + 1).trim()]));
}

function proximaDataAberta() {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + 2));
  while (data.getUTCDay() === 0 || data.getUTCDay() === 1) data.setUTCDate(data.getUTCDate() + 1);
  return data.toISOString().slice(0, 10);
}

async function esperarSaude(timeoutMs = 180_000) {
  const inicio = performance.now();
  while (performance.now() - inicio < timeoutMs) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/health`, { signal: AbortSignal.timeout(1000) });
      if (resposta.status === 200) return performance.now() - inicio;
    } catch {
      // ainda subindo
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("A aplicação não respondeu 200 em /health a tempo.");
}

// Amostra CPU e memória de cada container a cada ~2 s enquanto o k6 roda.
function amostrarStats(arquitetura, arquivo) {
  const destino = createWriteStream(arquivo);
  let ativo = true;
  const ciclo = (async () => {
    const ids = (await compose(arquitetura, "ps", "-q")).split("\n").filter(Boolean);
    while (ativo) {
      const resultado = await executar("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...ids]);
      const instante = new Date().toISOString();
      for (const linha of resultado.saida.split("\n").filter(Boolean)) {
        destino.write(`${JSON.stringify({ instante, ...JSON.parse(linha) })}\n`);
      }
      await new Promise((done) => setTimeout(done, 1000));
    }
  })();
  return async () => {
    ativo = false;
    await ciclo;
    destino.end();
  };
}

function k6Local() {
  try {
    execFileSync("k6", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function rodarK6({ cenario, duracao, env, arquivoJson }) {
  const variaveis = { ...env, SCENARIO: cenario, DURATION: duracao };
  if (k6Local()) {
    const args = ["run", "--quiet", ...Object.entries({
      ...variaveis, BASE_URL: `http://127.0.0.1:${porta}`, SAIDA_JSON: arquivoJson
    })
      .flatMap(([chave, valor]) => ["-e", `${chave}=${valor}`]), join(aqui, "k6.js")];
    return executar("k6", args);
  }
  // Sem k6 instalado: usa a imagem oficial fixada por digest.
  const linux = process.platform === "linux";
  const base = linux ? `http://127.0.0.1:${porta}` : `http://host.docker.internal:${porta}`;
  // No Linux o container roda com o usuário do host para poder gravar o JSON na pasta montada.
  const usuario = linux && process.getuid ? ["--user", `${process.getuid()}:${process.getgid()}`] : [];
  const args = ["run", "--rm", ...(linux ? ["--network", "host"] : []), ...usuario,
    "-v", `${aqui}:/scripts:ro`, "-v", `${dirname(arquivoJson)}:/saida`,
    k6Imagem, "run", "--quiet",
    ...Object.entries({ ...variaveis, BASE_URL: base, SAIDA_JSON: `/saida/${basename(arquivoJson)}` })
      .flatMap(([chave, valor]) => ["-e", `${chave}=${valor}`]),
    "/scripts/k6.js"];
  return executar("docker", args);
}

async function tamanhoImagens(arquitetura) {
  const imagens = (await compose(arquitetura, "config", "--images")).split("\n").filter(Boolean);
  const tamanhos = {};
  for (const imagem of imagens) {
    const resultado = await executar("docker", ["image", "inspect", "--format", "{{.Size}}", imagem]);
    tamanhos[imagem] = Number(resultado.saida.trim()) || null;
  }
  return tamanhos;
}

async function versao(comando, args) {
  try {
    return (await executar(comando, args)).saida.trim();
  } catch {
    return null;
  }
}

async function main() {
  const ocupada = await fetch(`http://127.0.0.1:${porta}/`, { signal: AbortSignal.timeout(1000) })
    .then(() => true, () => false);
  if (ocupada) {
    throw new Error(`A porta ${porta} já está em uso. Pare o que estiver nela ou use PORTA=<outra porta>.`);
  }
  await mkdir(saida, { recursive: true });
  const data = process.env.DATA || proximaDataAberta();
  const meta = {
    inicio: new Date().toISOString(),
    commit: (await versao("git", ["-C", raiz, "rev-parse", "HEAD"])),
    alteracoesNaoCommitadas: Boolean(await versao("git", ["-C", raiz, "status", "--porcelain"])),
    docker: await versao("docker", ["version", "--format", "{{.Server.Version}}"]),
    k6: k6Local() ? await versao("k6", ["version"]) : k6Imagem,
    node: process.version,
    host: { plataforma: `${os.type()} ${os.release()}`, cpu: os.cpus()[0]?.model, nucleos: os.cpus().length, memoria: os.totalmem() },
    parametros: { arquiteturas, cenarios, repeticoes, aquecimento, data,
      ...Object.fromEntries(repassar.filter((chave) => process.env[chave]).map((chave) => [chave, process.env[chave]])) },
    build: {},
    imagens: {}
  };

  for (const arquitetura of arquiteturas) {
    log(`build: ${arquitetura}`);
    const inicio = performance.now();
    await compose(arquitetura, "build", ...(process.env.MEDIR_BUILD === "1" ? ["--no-cache"] : []));
    meta.build[arquitetura] = { segundos: (performance.now() - inicio) / 1000, semCache: process.env.MEDIR_BUILD === "1" };
    meta.imagens[arquitetura] = await tamanhoImagens(arquitetura);
  }
  await writeFile(join(saida, "meta.json"), JSON.stringify(meta, null, 2));

  for (let repeticao = 1; repeticao <= repeticoes; repeticao += 1) {
    const ordem = repeticao % 2 === 1 ? arquiteturas : [...arquiteturas].reverse();
    for (const arquitetura of ordem) {
      const envArquivo = await lerEnv(arquiteturasDisponiveis[arquitetura].pasta);
      const env = {
        BARBERIA_LOGIN: envArquivo.BARBERIA_LOGIN || "admin",
        BARBERIA_PASSWORD: envArquivo.BARBERIA_PASSWORD,
        DATA: data,
        ...Object.fromEntries(repassar.filter((chave) => process.env[chave]).map((chave) => [chave, process.env[chave]]))
      };
      for (const cenario of cenarios) {
        const pasta = join(saida, arquitetura, cenario, `rep-${repeticao}`);
        await mkdir(pasta, { recursive: true });
        log(`rep ${repeticao}/${repeticoes} · ${arquitetura} · ${cenario}`);
        await compose(arquitetura, "down", "-v", "--remove-orphans");
        const resultado = { arquitetura, cenario, repeticao };
        try {
          const subida = performance.now();
          await compose(arquitetura, "up", "-d");
          await esperarSaude();
          // Tempo do "docker compose up -d" até o primeiro 200 em /health, visto do host (RFA1).
          resultado.tempoAteProntoMs = performance.now() - subida;
          if (aquecimento && aquecimento !== "0" && aquecimento !== "0s") {
            const aquec = await rodarK6({ cenario, duracao: aquecimento, env, arquivoJson: join(pasta, "aquecimento.json") });
            resultado.aquecimentoCodigo = aquec.codigo;
          }
          const pararStats = amostrarStats(arquitetura, join(pasta, "stats.jsonl"));
          const medido = await rodarK6({ cenario, duracao: process.env.DURATION || "30s", env, arquivoJson: join(pasta, "k6.json") });
          await pararStats();
          resultado.k6Codigo = medido.codigo;
          process.stdout.write(medido.saida);
          if (!existsSync(join(pasta, "k6.json"))) {
            throw new Error(`o k6 não gravou k6.json: ${medido.erro.slice(-500)}`);
          }
          if (medido.codigo !== 0 && medido.codigo !== 99) {
            resultado.erro = medido.erro.slice(-2000);
            log(`k6 terminou com código ${medido.codigo}`);
          }
        } catch (error) {
          // Registra a falha da rodada (ela fica fora do resumo) e segue para a próxima.
          resultado.erro = error.message.slice(-2000);
          log(`rodada falhou: ${error.message.split("\n")[0]}`);
        } finally {
          await writeFile(join(pasta, "resultado.json"), JSON.stringify(resultado, null, 2));
          await compose(arquitetura, "down", "-v", "--remove-orphans");
        }
      }
    }
  }
  log(`resultados em ${saida}`);
  log(`resumo: node testes/benchmark/resumir.mjs ${saida}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
