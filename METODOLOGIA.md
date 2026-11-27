# Metodologia experimental: controle de fatores

O objetivo do experimento é que as diferenças medidas entre `monolito/` e `microsservicos/`
venham **da arquitetura** (forma de implantação e de comunicação) e não de outros fatores.
Este documento registra como cada fator foi controlado, o que continua diferente de propósito
e as ameaças à validade que devem ser citadas no artigo.

## 1. O que é idêntico nas duas implementações

Verificado automaticamente por `npm run test:paridade` (na raiz):

- **Código de domínio e de aplicação.** Para cada módulo (`autenticacao`, `clientes`, `catalogo`,
  `agendamento`, `pagamentos`, `notificacoes`), os arquivos `index.js` (regras e interface
  pública), `repository.js` (SQL), `rotas.js` (contrato HTTP) e `domain.js` são **byte a byte
  iguais**. O mesmo vale para `src/compartilhado/` (servidor HTTP, autenticação, validação,
  erros, banco e inicialização).
- **O único ponto de variação é o `dependencias.js` de cada módulo**, que diz como ele fala com
  os outros: chamada de função em memória no monolito; HTTP/JSON pela rede interna nos
  microsserviços (`src/compartilhado/servicos.js`, timeout de 2 s, 503 `SERVICO_INDISPONIVEL`).
  O teste de paridade confere que os dois adaptadores expõem a mesma interface.
- **Esquema das tabelas**: mesmas colunas, tipos, restrições e índices. A única diferença são as
  chaves estrangeiras entre tabelas de módulos diferentes, que só existem no monolito (SPEC 8.4).
- **Interface web**, `package.json`, `package-lock.json`, `.env.example` e testes unitários.
- **Imagens base fixadas por digest** (`node:24-alpine`, `postgres:17-alpine`, `nginx:1.27-alpine`,
  `grafana/k6`), mesma instalação (`npm ci --omit=dev`), mesmo `.dockerignore` e mesmo comando de
  inicialização (`node <arquivo>`, sem o processo extra do `npm start`).
- **Mesma sequência de operações por requisição.** Como o monolito é modular (cada módulo só lê
  as próprias tabelas, verificado por `tests/unit/fronteiras.test.js`), as duas versões executam
  as mesmas consultas, na mesma ordem; o monolito faz uma chamada de função onde os
  microsserviços fazem uma chamada HTTP. Exemplo: listar agendamentos = 1 consulta na tabela de
  agendamentos + 3 consultas em lote, em paralelo (clientes, barbeiros e serviços).
- **Suítes de teste e benchmark únicas**, em `testes/` (SPEC 7.3).

## 2. Ambiente de medição

| Fator | Controle |
|---|---|
| CPU e memória | Mesmo orçamento total nas duas arquiteturas (SPEC 11): 2 CPUs e 2 GiB. Banco: 1 CPU / 1 GiB. Camada de aplicação: 1 CPU / 1 GiB (no monolito, um processo; nos microsserviços, dividido entre gateway e serviços em `docker-compose.limites.yml`). Os limites ficam em arquivos `docker-compose.limites.yml`, aplicados sempre pelo executor do benchmark. |
| Banco de dados | Um único container PostgreSQL nas duas arquiteturas, com a mesma imagem, a mesma configuração e o mesmo limite. Nos microsserviços ele hospeda **cinco bancos isolados**, um por serviço, cada um com usuário próprio sem permissão de conexão aos demais (SPEC 8.4, opção "bancos isolados no mesmo container"). Assim a camada de dados recebe os mesmos recursos nas duas versões. |
| Conexões | `PG_POOL_MAX=10` **por processo** nas duas arquiteturas. O total de conexões possíveis é maior nos microsserviços (5 serviços com banco), o que é inerente a ter vários processos. |
| Gateway | Nginx com conexões persistentes (`keepalive`, HTTP/1.1), sem log de acesso e com timeout de conexão de 2 s. O controle **monolito + gateway** (`monolito/docker-compose.gateway.yml`) usa o mesmo Nginx com as mesmas opções na frente do monolito, para separar o custo do salto pelo gateway do custo da distribuição. |
| Logs | Mesmo log JSON por requisição em cada processo Node. Nos microsserviços uma requisição externa gera logs também nos serviços chamados, o que faz parte do custo da arquitetura. |
| Dados | O executor faz `docker compose down -v` antes de cada rodada: todo cenário começa com o banco vazio e recebe a mesma massa inicial, criada pelo `setup` do k6. |
| Ordem e repetição | Aquecimento descartado, N repetições (padrão 5) e ordem das arquiteturas alternada entre repetições. O resumo usa média e intervalo de confiança de 95%. |
| Carga | Script k6 único; mistura 80/20 determinística (sem `Math.random`); métricas só das requisições da fase de medição (sem o `setup`). |
| Tempo até pronto | Medido do mesmo jeito nas duas: do `docker compose up -d` até o primeiro 200 em `GET /health` visto do host. Nos microsserviços o `/health` é agregado (o `agendamento` consulta os outros serviços) e o gateway só sobe depois que todos os serviços estão saudáveis. |

## 3. Diferenças intencionais (são a arquitetura)

- Processos e imagens: 1 no monolito; 6 serviços + gateway nos microsserviços.
- Comunicação: chamada em memória × HTTP/JSON pela rede interna (com serialização, timeout e
  tratamento de falha parcial).
- Integridade referencial: chaves estrangeiras no monolito × verificação por chamada HTTP no
  momento da criação nos microsserviços.
- Transações: no monolito todas as tabelas estão num banco só; nos microsserviços cada serviço só
  tem transação no próprio banco. O cadastro de cliente usa compensação (desfaz o cliente e a
  credencial se a criação da credencial falhar), com o mesmo código nas duas versões.
- Partição de recursos: com cotas fixas por container, CPU ociosa de um serviço não é emprestada
  a outro. Exemplo observado: com 0,10 CPU, o `autenticacao` não consegue calcular 20 hashes de
  senha simultâneos (cerca de 33 ms de CPU cada) dentro do timeout de 2 s, e parte dos cadastros
  em rajada recebe 503. No monolito, com 1 CPU compartilhada, isso não acontece. É um efeito real
  de dividir a aplicação e deve ser discutido junto com a divisão de cotas escolhida.

## 4. Decisões de implementação que se afastam do texto da SPEC

Registradas para revisão do grupo (a SPEC não foi alterada):

1. **Monolito, SPEC 8.3, "uma única transação" na criação de agendamento.** As consultas de cliente,
   barbeiro e serviço acontecem antes da transação, pelas interfaces dos módulos, como nos
   microsserviços. A transação continua garantindo as regras críticas: limite de 2 ativos
   (RF11, com trava por cliente) e conflito de horário (RF8, RNF6).
2. **Monolito, SPEC 8.2.** A configuração do expediente saiu do módulo `catalogo` e foi para o
   `agendamento`, que é o dono dela na SPEC dos microsserviços.
3. **Agendamento guarda uma cópia do nome do cliente** (SPEC 8.3 dos microsserviços) **também no
   monolito**, para que a busca por nome (RF15) execute a mesma consulta nas duas versões.
4. **Notificações (RF25)** rodam às 09:00, uma vez por dia por processo, sem tabela de controle,
   porque o serviço de notificações não tem banco (SPEC 8.2). Não há mais envio na subida do
   processo. O serviço não consulta o `catalogo`, porque só precisa do id do barbeiro, que vem no
   agendamento.
5. **Credenciais de cliente** ficam no módulo `autenticacao` nas duas versões (SPEC 8.4 dos
   microsserviços).
6. **Rotas internas** (`/internal/*`) não têm autenticação; ficam só na rede interna do Compose e
   o gateway devolve 404 para elas.

## 5. Ameaças à validade

- A divisão do orçamento entre os serviços (`docker-compose.limites.yml`) influencia o resultado.
  Registre a divisão usada e, se possível, rode uma análise de sensibilidade (por exemplo, mais
  CPU para `agendamento`).
- **Granularidade das cotas de CPU.** O Docker aplica `cpus` com o escalonador CFS do Linux, em
  períodos de 100 ms: um container com cota pequena (0,35 CPU, por exemplo) que gasta a cota no
  começo do período fica parado até o próximo. Na validação do protocolo isso apareceu como p95 de
  ~95 ms nos microsserviços em todos os cenários. É o comportamento real de cotas por container
  (o mesmo do Kubernetes), mas deve ser explicado no artigo; uma análise de sensibilidade pode
  variar a divisão das cotas.
- **Tempo até pronto.** Depende também do intervalo dos healthchecks, porque um container só sobe
  quando suas dependências são marcadas como saudáveis. Todos os healthchecks das duas arquiteturas
  usam o mesmo `start_interval` de 1 s, então a granularidade é igual, mas cadeias de dependência
  mais longas (gateway → serviços → banco) acumulam até 1 s por elo.
- Docker Desktop (Windows/macOS) roda os containers numa máquina virtual; compare apenas
  resultados obtidos na mesma máquina e no mesmo sistema.
- O `docker stats` e o k6 rodam no mesmo host; o executor amostra os containers a cada ~2 s.
- O monolito modular é mais "justo" que um monolito típico, que usaria JOINs entre módulos. Os
  resultados comparam *monolito modular* × *microsserviços*.
