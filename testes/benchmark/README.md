# Benchmarks

Um único script k6 (`k6.js`) mede as duas arquiteturas. Use sempre o executor
(`executar.mjs`), que aplica o protocolo descrito em [`../../METODOLOGIA.md`](../../METODOLOGIA.md):

1. constrói as imagens de cada arquitetura e registra tempo de build e tamanho das imagens;
2. para cada repetição, arquitetura e cenário: `docker compose down -v`, sobe a pilha **com os
   limites de recursos** (`docker-compose.limites.yml`), mede o tempo até `/health` responder 200,
   roda um aquecimento descartado, mede com k6 e amostra `docker stats`;
3. alterna a ordem das arquiteturas entre repetições;
4. grava tudo em `testes/benchmark/resultados/<data-hora>/`.

## Pré-requisitos

- Docker com Compose v2.24 ou mais recente.
- Node.js 20 ou mais recente (só para o executor e o resumo; não há dependências).
- k6 instalado **ou** acesso à imagem `grafana/k6` (o executor usa a imagem fixada por digest
  quando não encontra `k6` no PATH).
- `monolito/.env` e `microsservicos/.env` criados a partir dos `.env.example`, com a **mesma**
  senha da barbearia.
- Porta 8080 livre e nenhuma outra carga pesada na máquina.

## Executar

Na raiz do repositório:

```powershell
node testes/benchmark/executar.mjs
node testes/benchmark/resumir.mjs testes/benchmark/resultados/<data-hora>
```

Padrões: arquiteturas `monolito,microsservicos,monolito-gateway`; cenários `read,write,mixed`;
5 repetições; 30 s de medição; 15 s de aquecimento. Uma execução completa leva cerca de uma hora.
Para variar:

```powershell
$env:REPETICOES = "10"; $env:DURATION = "60s"; $env:CENARIOS = "read,write,mixed,ramp"
node testes/benchmark/executar.mjs
```

| Variável | Efeito |
|---|---|
| `ARQUITETURAS` | Lista entre `monolito`, `microsservicos` e `monolito-gateway` (controle com o mesmo Nginx na frente do monolito). |
| `CENARIOS` | `read` (GET /agendamentos com busca por nome + GET /disponibilidade), `write` (POST /agendamentos + cancelamento), `mixed` (80/20 determinístico) e `ramp` (escrita com taxa crescente). |
| `REPETICOES`, `DURATION`, `AQUECIMENTO` | Repetições, duração da medição e do aquecimento (`0` desliga). |
| `VUS`, `MAX_VUS`, `RATE`, `START_RATE`, `TARGET_RATE` | Carga do k6. |
| `MASSA` | Agendamentos ativos criados antes da medição (padrão 20). |
| `MEDIR_BUILD=1` | Mede o build sem cache. |
| `PORTA` | Porta publicada no host (padrão 8080). O executor aborta se ela já estiver em uso. |
| `CPUS_*`, `MEM_*` | Divisão do orçamento entre containers (ver os `docker-compose.limites.yml`). Mantenha a soma igual nas duas arquiteturas. |

## Resultado

O `resumir.mjs` gera `resumo.md` e `resumo.csv` com, por arquitetura e cenário: vazão, taxa de
falhas, latência p50, p95 e p99 (total e por rota), tempo até ficar pronto, CPU média e memória
de pico somadas dos containers. O formato é média ± IC 95% entre repetições. O `meta.json` registra
o commit, as versões e o host; anexe-o aos resultados do artigo.

O limite do RNF1 (p95 de `POST /agendamentos` < 3 s) e a taxa de falhas < 1% são verificados pelo
próprio k6 (código de saída 99 quando um limite é violado; o executor registra e continua).
