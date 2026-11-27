#!/usr/bin/env node
// Resume uma pasta de resultados do executar.mjs: média, desvio-padrão e intervalo de
// confiança de 95% (t de Student) de cada métrica, por arquitetura e cenário.
//
//   node testes/benchmark/resumir.mjs testes/benchmark/resultados/<data-hora>
//
// Gera resumo.md (tabelas) e resumo.csv (uma linha por repetição) na mesma pasta.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const pasta = resolve(process.argv[2] || "");
if (!process.argv[2] || !existsSync(join(pasta, "meta.json"))) {
  console.error("Uso: node testes/benchmark/resumir.mjs <pasta de resultados>");
  process.exit(1);
}

// t crítico bicaudal 95% para gl = 1..30; acima disso usa 1,96.
const tCritico = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179,
  2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056,
  2.052, 2.048, 2.045, 2.042];

function estatisticas(valores) {
  const n = valores.length;
  if (!n) return null;
  const media = valores.reduce((soma, valor) => soma + valor, 0) / n;
  const dp = n > 1 ? Math.sqrt(valores.reduce((soma, valor) => soma + (valor - media) ** 2, 0) / (n - 1)) : 0;
  const ic = n > 1 ? (tCritico[n - 2] ?? 1.96) * dp / Math.sqrt(n) : 0;
  return { n, media, dp, ic };
}

function memoriaMiB(texto) {
  const usado = String(texto).split("/")[0].trim();
  const numero = Number.parseFloat(usado);
  if (usado.endsWith("GiB")) return numero * 1024;
  if (usado.endsWith("MiB")) return numero;
  if (usado.endsWith("KiB")) return numero / 1024;
  if (usado.endsWith("B")) return numero / 1024 / 1024;
  return numero;
}

async function lerStats(arquivo) {
  if (!existsSync(arquivo)) return { cpuMedia: null, memoriaPico: null, porContainer: {} };
  const linhas = (await readFile(arquivo, "utf8")).split("\n").filter(Boolean).map((linha) => JSON.parse(linha));
  const porInstante = new Map();
  const porContainer = {};
  for (const linha of linhas) {
    const cpu = Number.parseFloat(linha.CPUPerc);
    const memoria = memoriaMiB(linha.MemUsage);
    const total = porInstante.get(linha.instante) || { cpu: 0, memoria: 0 };
    total.cpu += cpu;
    total.memoria += memoria;
    porInstante.set(linha.instante, total);
    const container = (porContainer[linha.Name] ||= { cpu: [], memoria: [] });
    container.cpu.push(cpu);
    container.memoria.push(memoria);
  }
  const totais = [...porInstante.values()];
  return {
    cpuMedia: totais.reduce((soma, item) => soma + item.cpu, 0) / (totais.length || 1),
    memoriaPico: Math.max(...totais.map((item) => item.memoria)),
    porContainer: Object.fromEntries(Object.entries(porContainer).map(([nome, item]) => [nome, {
      cpuMedia: item.cpu.reduce((soma, valor) => soma + valor, 0) / item.cpu.length,
      memoriaPico: Math.max(...item.memoria)
    }]))
  };
}

// Duração da janela de medição em segundos ("30s", "1m", "1m30s"). A taxa do próprio k6 divide
// pelo tempo total do teste, que inclui o setup; aqui a vazão usa só a janela medida.
function segundos(texto) {
  let total = 0;
  for (const [, valor, unidade] of String(texto).matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    total += Number(valor) * { ms: 0.001, s: 1, m: 60, h: 3600 }[unidade];
  }
  return total || null;
}

const meta = JSON.parse(await readFile(join(pasta, "meta.json"), "utf8"));
const janela = segundos(meta.parametros.DURATION || "30s");

// Rotas que o cenário não exercita aparecem no k6 com tudo zerado: mostra "-" em vez de 0.
function p95DaRota(k6, rota) {
  const valores = k6.metrics[`http_req_duration{endpoint:${rota}}`]?.values;
  return valores && valores.max > 0 ? valores["p(95)"] : null;
}

const metricas = [
  ["vazao_rps", "Vazão (req/s)", (k6) => (k6.metrics["http_reqs{fase:medicao}"]?.values?.count ?? 0) / janela],
  ["falhas_pct", "Falhas (%)", (k6) => 100 * (k6.metrics["http_req_failed{fase:medicao}"]?.values?.rate ?? 0)],
  ["p50_ms", "p50 (ms)", (k6) => k6.metrics["http_req_duration{fase:medicao}"]?.values?.med],
  ["p95_ms", "p95 (ms)", (k6) => k6.metrics["http_req_duration{fase:medicao}"]?.values?.["p(95)"]],
  ["p99_ms", "p99 (ms)", (k6) => k6.metrics["http_req_duration{fase:medicao}"]?.values?.["p(99)"]],
  ["p95_post_agendamentos_ms", "p95 POST /agendamentos (ms)",
    (k6) => p95DaRota(k6, "post_agendamentos")],
  ["p95_get_agendamentos_ms", "p95 GET /agendamentos (ms)",
    (k6) => p95DaRota(k6, "get_agendamentos")],
  ["p95_get_disponibilidade_ms", "p95 GET /disponibilidade (ms)",
    (k6) => p95DaRota(k6, "get_disponibilidade")]
];

const linhasCsv = [];
const falhas = [];
const grupos = new Map();

for (const arquitetura of meta.parametros.arquiteturas) {
  for (const cenario of meta.parametros.cenarios) {
    const base = join(pasta, arquitetura, cenario);
    if (!existsSync(base)) continue;
    for (const rep of (await readdir(base)).sort()) {
      const arquivoK6 = join(base, rep, "k6.json");
      const resultado = JSON.parse(await readFile(join(base, rep, "resultado.json"), "utf8"));
      if (resultado.erro && !existsSync(arquivoK6)) falhas.push(`${arquitetura}/${cenario}/${rep}: ${resultado.erro.split("\n")[0]}`);
      if (!existsSync(arquivoK6)) continue;
      const k6 = JSON.parse(await readFile(arquivoK6, "utf8"));
      const stats = await lerStats(join(base, rep, "stats.jsonl"));
      const linha = {
        arquitetura, cenario, repeticao: resultado.repeticao,
        tempo_ate_pronto_s: resultado.tempoAteProntoMs / 1000,
        cpu_media_pct: stats.cpuMedia,
        memoria_pico_mib: stats.memoriaPico,
        ...Object.fromEntries(metricas.map(([chave, , ler]) => [chave, ler(k6) ?? null]))
      };
      linhasCsv.push(linha);
      const chave = `${arquitetura}|${cenario}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(linha);
    }
  }
}

const colunas = [
  ...metricas.map(([chave, rotulo]) => [chave, rotulo]),
  ["tempo_ate_pronto_s", "Tempo até /health 200 (s)"],
  ["cpu_media_pct", "CPU média somada (%)"],
  ["memoria_pico_mib", "Memória pico somada (MiB)"]
];
const formatar = (valor) => valor === null || Number.isNaN(valor) ? "-" : valor.toFixed(valor >= 100 ? 0 : 2);

let markdown = `# Resumo do benchmark\n\nCommit: \`${meta.commit}\`${meta.alteracoesNaoCommitadas ? " (com alterações não commitadas)" : ""} · ` +
  `Docker ${meta.docker} · ${meta.host.cpu} (${meta.host.nucleos} núcleos) · ${meta.parametros.repeticoes} repetições · ` +
  `aquecimento ${meta.parametros.aquecimento} · data dos agendamentos ${meta.parametros.data}\n\n` +
  "Valores: média ± IC 95% (t de Student) entre repetições.\n";

for (const cenario of meta.parametros.cenarios) {
  const arquiteturas = meta.parametros.arquiteturas.filter((nome) => grupos.has(`${nome}|${cenario}`));
  if (!arquiteturas.length) continue;
  markdown += `\n## Cenário: ${cenario}\n\n| Métrica | ${arquiteturas.join(" | ")} |\n|---|${arquiteturas.map(() => "---").join("|")}|\n`;
  for (const [chave, rotulo] of colunas) {
    const celulas = arquiteturas.map((nome) => {
      const valores = grupos.get(`${nome}|${cenario}`).map((linha) => linha[chave]).filter((valor) => typeof valor === "number");
      const resumo = estatisticas(valores);
      return resumo ? `${formatar(resumo.media)} ± ${formatar(resumo.ic)} (n=${resumo.n})` : "-";
    });
    markdown += `| ${rotulo} | ${celulas.join(" | ")} |\n`;
  }
}

if (falhas.length) {
  markdown += `\n## Rodadas que falharam (fora do resumo)\n\n${falhas.map((item) => `- ${item}`).join("\n")}\n`;
}

const cabecalho = Object.keys(linhasCsv[0] || {});
const csv = [cabecalho.join(","), ...linhasCsv.map((linha) => cabecalho.map((campo) => linha[campo] ?? "").join(","))].join("\n");
await writeFile(join(pasta, "resumo.md"), markdown);
await writeFile(join(pasta, "resumo.csv"), `${csv}\n`);
console.log(markdown);
