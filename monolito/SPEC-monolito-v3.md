# Barbearia: especificação da implementação monolítica

Este documento define **o que** a versão monolítica da aplicação Barbearia deve fazer e **como** deve ser desenvolvida: de forma *spec driven*, com os testes escritos a partir dos requisitos **antes** da implementação. A versão em microsserviços está em [`../microsservicos/SPEC-microsservicos-v3.md`](../microsservicos/SPEC-microsservicos-v3.md).

## 1. Objetivo

Implementar a aplicação **Barbearia**, um sistema de agendamento de uma barbearia. A mesma aplicação é implementada duas vezes, uma em `monolito/` e outra em `microsservicos/`, para que o artigo compare as duas arquiteturas com testes e benchmarks quantitativos.

**Fonte dos requisitos:** os requisitos desta especificação são **exclusivamente** os do documento *Etapa 01 – Laboratório de Engenharia* (história do usuário, RF1 a RF28 e RNF1 a RNF6), transcritos na seção 3. Os requisitos adicionais da seção 3.5 foram autorizados pelo grupo em 23/11/2026. **Nenhum outro requisito pode ser adicionado sem autorização do grupo.** O restante deste documento (domínio, contrato da API, arquitetura e testes) apenas detalha como esses requisitos serão implementados e verificados.

Para a comparação ser justa, as duas implementações devem atender aos mesmos requisitos, expor o mesmo contrato HTTP (seção 5) na mesma porta (`8080`), usar a mesma interface web (seção 5.3) e a mesma stack, mudando apenas a arquitetura. Assim, a mesma suíte de testes de aceitação e os mesmos scripts de benchmark rodam contra as duas sem nenhuma alteração.

> As seções 1 a 7 são idênticas nos arquivos `monolito/SPEC-monolito-v3.md` e `microsservicos/SPEC-microsservicos-v3.md`. Se alguma regra mudar, altere os dois arquivos no mesmo commit.

## 2. Domínio

| Entidade | Campos | Origem |
|---|---|---|
| **Cliente** | `id`, `nome` (3 a 60 caracteres, só letras e espaços), `telefone` (só dígitos, com DDD, 10 ou 11 dígitos, identifica o cliente e é o login), `senhaHash`, preferências de notificação (`receberNotificacoes`, `canal`) | História, RF2, RF3, RF11, RF26, RF27, RFA2 |
| **Usuário da barbearia** | `id`, `login`, `senhaHash` | RFA2 |
| **Configuração do expediente** | `horaAbertura`, `ultimoHorario` (padrão 18:00, RF6) | RFA4 |
| **Barbeiro** | `id`, `nome`, `ativo` | RF19, RF22 |
| **Serviço** | `id`, `nome`, `duracaoMinutos`, `precoCentavos`, `custoCentavos` | RF10, RF12, RF23, RFA3 |
| **Agendamento** | `id`, `clienteId`, `barbeiroId`, `servicoId`, `data`, `horario`, `situacao` (`AGENDADO`, `ATENDIDO`, `CANCELADO`), `precoCentavos` e `custoCentavos` (copiados do serviço no momento do agendamento) | RF1, RF13, RF17, RFA3 |
| **Pagamento** | `id`, `agendamentoId`, `metodo`, `status`, `referenciaExterna` (id no provedor). **Nunca** guarda dados de cartão. | RF20, RF21, RNF5 |

Serviços iniciais (RF10 e RF12):

| Serviço | Duração | Preço |
|---|---|---|
| Corte | 30 min (1 horário) | R$ 35,00 |
| Barba | 30 min (1 horário) | R$ 25,00 |
| Corte e barba | 60 min (2 horários seguidos) | R$ 55,00 |

Convenções: datas em `AAAA-MM-DD`, horários em `HH:MM`, fuso `America/Sao_Paulo`; valores em centavos (inteiro); JSON em `camelCase`.

## 3. Requisitos

Transcritos do documento da Etapa 01. Cada teste deve citar no nome ou em comentário o identificador do requisito que verifica (ex.: `RF8: impede dois clientes no mesmo horário do barbeiro`). As linhas **Implementação** só detalham como o requisito é atendido, sem criar regras novas; onde o documento não é claro, a dúvida está na seção 3.4.

### 3.1 História do usuário

> No primeiro contato com a aplicação, o usuário precisa se cadastrar, será necessário informar os seguintes dados: nome completo, e telefone com DDD. Ao entrar na aplicação, o usuário terá a possibilidade de fazer um agendamento com antecedência de 1 a 30 dias, porém, não poderá fazer um agendamento entre os seguintes horários: 12:00; 12:30; 13:00, sendo que Segunda e Domingo a barbearia está fechada por conta de treinamento da equipe; reforma da loja e limpeza geral. Os demais horários e dias da semana estarão disponíveis para agendamento, com o último horário de agendamento sendo 18:00.

### 3.2 Requisitos funcionais

| ID | Requisito | Implementação |
|---|---|---|
| **RF1** | Exigir o preenchimento de cliente, telefone, barbeiro, serviço, data e horário para realizar um agendamento. | Campo ausente ou vazio em `POST /agendamentos` retorna 400. |
| **RF2** | Validar o nome do cliente, permitindo de 3 a 60 caracteres, somente letras e espaços. | Letras acentuadas contam como letras. Inválido retorna 400. |
| **RF3** | Validar o telefone do cliente, exigindo DDD e um total de 10 ou 11 dígitos. | Inválido retorna 400. |
| **RF4** | Permitir agendamentos com antecedência de 1 a 30 dias, impedindo agendamentos para o dia atual. | `data` entre hoje + 1 e hoje + 30 (inclusive). Fora disso retorna 422. |
| **RF5** | Permitir agendamentos somente de terça-feira a sábado, impedindo atendimentos aos domingos e às segundas-feiras. | Domingo ou segunda retorna 422. |
| **RF6** | Limitar o último horário de atendimento às 18h00. | Horários em intervalos de 30 min (RF24); depois do último horário retorna 422. 18:00 é o valor padrão do `ultimoHorario` configurável (RFA4). |
| **RF7** | Bloquear os horários de 12h00, 12h30 e 13h00 para o intervalo de almoço. | Esses horários retornam 422. |
| **RF8** | Impedir que um barbeiro atenda dois clientes no mesmo horário, permitindo atendimentos simultâneos por barbeiros diferentes. | Conflito com agendamento `AGENDADO` do mesmo barbeiro retorna 409. |
| **RF9** | Liberar o horário quando um agendamento for cancelado. | Agendamento `CANCELADO` não conta para conflito nem para disponibilidade. |
| **RF10** | Considerar a duração de 1 hora para o serviço de corte e barba, ocupando também o horário seguinte do mesmo barbeiro. | Ocupa o horário escolhido e o seguinte (+30 min); os dois precisam estar livres e permitidos. |
| **RF11** | Permitir no máximo 2 agendamentos ativos por cliente, identificado pelo telefone. | Ativo = `AGENDADO`. O terceiro retorna 422. |
| **RF12** | Utilizar os preços de R$ 35,00 para corte, R$ 25,00 para barba e R$ 55,00 para corte e barba. | Valores iniciais dos serviços (seção 2). |
| **RF13** | Permitir a alteração da situação de Agendado para Atendido e permitir o cancelamento somente de agendamentos na situação Agendado. | Qualquer outra transição retorna 422. |
| **RF14** | Exibir os agendamentos ordenados por data e, no mesmo dia, por horário. | Ordem de `GET /agendamentos`. |
| **RF15** | Permitir a busca de agendamentos pelo nome do cliente, sem diferenciar letras maiúsculas de minúsculas. | Filtro `nomeCliente` por trecho do nome. |
| **RF16** | Desconsiderar os agendamentos cancelados no contador de registros. | Campo `total` da listagem não conta `CANCELADO`. |
| **RF17** | Calcular o Faturamento previsto somando apenas os agendamentos na situação Agendado. | Soma de `precoCentavos` dos `AGENDADO`. |
| **RF18** | Solicitar confirmação antes de excluir um agendamento. | Diálogo de confirmação na interface antes de chamar `DELETE /agendamentos/{id}`. |
| **RF19** | Permitir que o cliente escolha o barbeiro desejado, caso esteja disponível no horário selecionado. | Barbeiro inativo retorna 422; ocupado retorna 409. |
| **RF20** | Permitir que o usuário opte por realizar o pagamento no sistema. | Pagamento é opcional; o agendamento existe sem ele. |
| **RF21** | Permitir que o usuário escolha o método de pagamento desejado. | Métodos: ver seção 3.4. |
| **RF22** | Permitir cadastrar, editar e desativar barbeiros, sem apagar o histórico de agendamentos feitos por eles. | Desativar não remove o barbeiro nem seus agendamentos. |
| **RF23** | Permitir cadastrar e editar serviços (nome, duração e preço). | Editar o preço não altera agendamentos já feitos. |
| **RF24** | Exibir apenas os horários disponíveis para o barbeiro e a data escolhidos, em intervalos de 30 minutos, já excluindo o almoço e os horários ocupados. | `GET /disponibilidade`; para corte e barba, só horários cujo seguinte também está livre. |
| **RF25** | Notificar o cliente e barbeiro no dia do corte agendado. | Rotina diária envia a notificação dos agendamentos `AGENDADO` do dia. |
| **RF26** | Disponibilizar opções de notificação aos usuários. | Canais: ver seção 3.4. |
| **RF27** | Possibilitar a opção de não receber notificações. | `receberNotificacoes = false` impede o envio. |
| **RF28** | Disponibilizar uma visualização das estatísticas da barbearia, como filtros de agendamentos por barbeiro e levantamento do faturamento e lucro previsto e registrado por dia, mês e ano. | `GET /estatisticas`. Previsto = `AGENDADO`; registrado = `ATENDIDO`. Lucro conforme RFA3. |

### 3.3 Requisitos não funcionais

| ID | Requisito | Implementação e verificação |
|---|---|---|
| **RNF1** | Concluir o cadastro de um agendamento em até 3 segundos após a confirmação do usuário. | p95 de `POST /agendamentos` ≤ 3 s nos benchmarks. |
| **RNF2** | Manter os dados dos agendamentos após ser fechado e aberto novamente. | Banco de dados com volume persistente; teste reinicia a aplicação e confere os dados. |
| **RNF3** | Adaptar a interface para uso em celulares, tablets e computadores. | Interface web responsiva (seção 5.3). |
| **RNF4** | Proteger os dados pessoais dos clientes (nome e telefone), em conformidade com a LGPD. | Nome e telefone não aparecem em logs; banco não exposto fora da rede interna. |
| **RNF5** | Não armazenar os dados de pagamento (cartão), podendo processá-los por um provedor de pagamento externo seguro. | Dados de cartão vão direto ao provedor; só a `referenciaExterna` é guardada. Nos testes e benchmarks, o provedor é simulado. |
| **RNF6** | Impedir agendamentos duplicados quando dois usuários tentarem reservar o mesmo horário ao mesmo tempo. | Garantido no banco; requisições simultâneas resultam em um 201 e o resto 409. |

### 3.4 Pontos em aberto no documento de requisitos

O documento não define os itens abaixo. Itens 1, 5 e 8 foram resolvidos pelos requisitos adicionais da seção 3.5; os demais continuam em aberto ou com a leitura adotada indicada:

1. ~~Horário de abertura~~: resolvido pelo RFA4.
2. **Corte e barba no limite**: às 11:30 ocuparia 12:00 (almoço) e no último horário ocuparia o horário seguinte, fora do expediente. Leitura adotada: os dois casos são **rejeitados** (422).
3. **Métodos de pagamento** (RF21), por exemplo Pix, cartão de crédito e cartão de débito. *Em aberto.*
4. **Canais de notificação** (RF26), por exemplo SMS ou WhatsApp, e se o barbeiro também pode deixar de receber. *Em aberto.*
5. ~~Como calcular o lucro~~: resolvido pelo RFA3.
6. **Excluir (RF18) e cancelar (RF13)**: leitura adotada: excluir remove o registro e cancelar só muda a situação.
7. **Cliente no agendamento (RF1)**: leitura adotada: o cliente é o que está logado (RFA2); nome e telefone vêm do cadastro dele e são validados pelo RF2 e RF3. Na interface da barbearia, o agendamento informa nome e telefone de um cliente já cadastrado (telefone não cadastrado retorna 404).
8. ~~Perfis de acesso~~: resolvido pelo RFA2.

### 3.5 Requisitos adicionais autorizados

Autorizados pelo grupo em 23/11/2026, além do documento da Etapa 01:

| ID | Requisito | Implementação |
|---|---|---|
| **RFA1** | A aplicação deve expor uma verificação de saúde. | `GET /health` retorna 200 `{"status":"ok"}` quando a aplicação e suas dependências estão prontas, ou 503. Usado na subida dos containers e para medir o tempo de inicialização. |
| **RFA2** | A aplicação deve ter logins separados para clientes e para a barbearia. | Cliente entra com telefone e senha (a senha é definida no cadastro); a barbearia entra com login e senha (usuário inicial criado na instalação). O login devolve um token (`Authorization: Bearer`) com o perfil `CLIENTE` ou `BARBEARIA`. Rotas exigem o perfil indicado na seção 5.2; sem token retorna 401, com perfil errado retorna 403. Cliente só vê e altera os próprios agendamentos. Senhas guardadas só como hash (RNF4). |
| **RFA3** | A aplicação deve calcular o lucro. | Cada serviço tem um `custoCentavos`, cadastrado e editado pela barbearia junto com nome, duração e preço (RF23). O agendamento copia preço e custo do serviço. Lucro = soma de (`precoCentavos` − `custoCentavos`). Lucro previsto: agendamentos `AGENDADO`; lucro registrado: `ATENDIDO`. Custo inicial dos serviços do RF12: R$ 0,00 até a barbearia configurar. |
| **RFA4** | O horário de funcionamento deve ser flexível, definido pela configuração da aplicação na interface. | A barbearia define na interface o `horaAbertura` e o `ultimoHorario` (padrão 18:00, RF6), sempre em múltiplos de 30 min. Valores padrão na instalação: 09:00 e 18:00. A mudança vale para novos agendamentos e para a disponibilidade; agendamentos já feitos não mudam. O almoço (RF7) e os dias (RF5) continuam fixos. |

## 4. Regras de horário consolidadas

Derivadas da história, RF4 a RF7, RF10, RF24 e RFA4:

- Horários possíveis: de `horaAbertura` até `ultimoHorario` (configuração do RFA4; padrão 09:00 e 18:00), de 30 em 30 minutos.
- Excluídos: 12:00, 12:30 e 13:00.
- Dias: terça a sábado; data entre hoje + 1 e hoje + 30.
- Corte e barba ocupa o horário escolhido e o seguinte; os dois devem ser horários possíveis e livres.
- Um horário está livre para um barbeiro se nenhum agendamento `AGENDADO` dele o ocupa.

## 5. Contrato

### 5.1 Convenções

Base `http://localhost:8080`, JSON. Autenticação por `Authorization: Bearer <token>` (RFA2); a coluna **Perfil** indica quem pode chamar a rota (`público`, `CLIENTE`, `BARBEARIA`, ou ambos). Erros no formato `{"erro": "<mensagem>", "codigo": "<CODIGO>"}`. Códigos: 400 dados inválidos (RF1 a RF3), 401 sem login, 403 perfil sem permissão (RFA2), 404 não encontrado, 409 horário ocupado (RF8, RNF6), 422 regra de negócio violada (RF4 a RF7, RF10, RF11, RF13, RF19).

### 5.2 Rotas da API

| Método | Rota | Perfil | Sucesso | Erros | Requisitos |
|---|---|---|---|---|---|
| POST | `/clientes` (`{nome, telefone, senha}`) | público | 201 | 400, 409 telefone já cadastrado | História, RF2, RF3, RFA2 |
| POST | `/auth/cliente` (`{telefone, senha}`) | público | 200 + `{token}` | 401 | RFA2 |
| POST | `/auth/barbearia` (`{login, senha}`) | público | 200 + `{token}` | 401 | RFA2 |
| GET | `/clientes/eu` | CLIENTE | 200 | 401 | História, RFA2 |
| GET | `/clientes?telefone=` | BARBEARIA | 200 | 404 | RF1 |
| PUT | `/clientes/eu/notificacoes` (`{receberNotificacoes, canal}`) | CLIENTE | 200 | 400 | RF26, RF27 |
| POST | `/barbeiros` | BARBEARIA | 201 | 400 | RF22 |
| GET | `/barbeiros?ativo=` | ambos | 200 | | RF19, RF22 |
| PUT | `/barbeiros/{id}` | BARBEARIA | 200 | 400, 404 | RF22 |
| POST | `/barbeiros/{id}/desativar` | BARBEARIA | 200 | 404 | RF22 |
| POST | `/servicos` (`{nome, duracaoMinutos, precoCentavos, custoCentavos}`) | BARBEARIA | 201 | 400 | RF23, RFA3 |
| GET | `/servicos` | ambos | 200 | | RF12 |
| PUT | `/servicos/{id}` | BARBEARIA | 200 | 400, 404 | RF23, RFA3 |
| GET | `/configuracao/expediente` | ambos | 200 + `{horaAbertura, ultimoHorario}` | | RFA4 |
| PUT | `/configuracao/expediente` | BARBEARIA | 200 | 400 | RFA4 |
| GET | `/disponibilidade?barbeiroId=&data=&servicoId=` | ambos | 200 + `{"horarios": ["09:00", ...]}` | 400, 404 | RF24, RF10, RFA4 |
| POST | `/agendamentos` (cliente: `{barbeiroId, servicoId, data, horario}`; barbearia: também `{nome, telefone}`) | ambos | 201 | 400, 404, 409, 422 | RF1 a RF11, RF19, RNF1, RNF6 |
| GET | `/agendamentos?nomeCliente=&barbeiroId=&data=&situacao=` | ambos (cliente vê só os seus) | 200 + `{itens, total, faturamentoPrevistoCentavos}` | 400 | RF14 a RF17 |
| GET | `/agendamentos/{id}` | ambos (cliente só o seu) | 200 | 403, 404 | |
| POST | `/agendamentos/{id}/atender` | BARBEARIA | 200 | 404, 422 | RF13 |
| POST | `/agendamentos/{id}/cancelar` | ambos (cliente só o seu) | 200 | 403, 404, 422 | RF9, RF13 |
| DELETE | `/agendamentos/{id}` | BARBEARIA | 204 | 404 | RF18 |
| POST | `/agendamentos/{id}/pagamento` (`{metodo}`) | CLIENTE (só o seu) | 201 + dados para concluir no provedor | 400, 403, 404, 422 | RF20, RF21, RNF5 |
| GET | `/agendamentos/{id}/pagamento` | ambos | 200 | 404 | RF20 |
| GET | `/estatisticas?periodo=dia\|mes\|ano&referencia=&barbeiroId=` | BARBEARIA | 200 + agendamentos, faturamento e lucro previsto e registrado | 400 | RF28, RFA3 |
| GET | `/health` | público | 200 + `{"status":"ok"}` | 503 | RFA1 |

A notificação do RF25 não é uma rota: é uma rotina diária interna que, para cada agendamento `AGENDADO` do dia, notifica o cliente (se `receberNotificacoes` for verdadeiro) e o barbeiro, por meio de um enviador simulado nos testes.

Recomenda-se descrever este contrato em um `openapi.yaml` compartilhado pelas duas implementações.

### 5.3 Interface web (RNF3)

Uma interface web responsiva, **idêntica nas duas arquiteturas**, que consome apenas a API da seção 5.2:

- **Login:** telas separadas de entrada para cliente e para a barbearia (RFA2).
- **Cliente:** cadastro (nome, telefone e senha), novo agendamento (barbeiro, serviço, data e só os horários disponíveis), pagamento opcional, meus agendamentos (com cancelamento), preferências de notificação.
- **Barbearia:** lista de agendamentos ordenada, busca por nome, contador e faturamento previsto, ações de atender, cancelar e excluir (com confirmação, RF18), cadastro de barbeiros e serviços (com custo, RFA3), configuração do expediente (RFA4), estatísticas com faturamento e lucro.

Os benchmarks medem a API; a interface é verificada por testes de ponta a ponta (seção 7.1).

## 6. Processo de desenvolvimento: spec driven e test first

A implementação é guiada por esta especificação e **os testes vêm antes do código**. A ordem é obrigatória para cada funcionalidade (ou grupo de requisitos):

1. **Especificar.** Confirmar que o requisito está na seção 3 (documento da Etapa 01 ou requisitos adicionais autorizados) e que o contrato da seção 5 cobre o caso. Se algo estiver ambíguo, resolver na SPEC primeiro (nos dois diretórios), pedindo autorização se for um requisito novo.
2. **Escrever os testes a partir dos requisitos.** Criar os casos de teste (seção 7) cobrindo o caminho feliz, cada regra e cada código de erro. Rodar a suíte e confirmar que os novos testes **falham** (vermelho). Commit: `test: RF8 conflito de horário do barbeiro`.
3. **Implementar.** Escrever o código mínimo necessário para os testes passarem, seguindo a arquitetura deste arquivo (seção 8). Commit: `feat: RF8 conflito de horário do barbeiro`.
4. **Testar e corrigir.** Rodar a suíte completa, corrigir falhas e regressões até ficar tudo verde (commits `fix: ...`). Se o teste contradiz a SPEC, corrige-se o teste; se a SPEC estiver errada, corrige-se a SPEC, depois o teste, depois o código.
5. **Refatorar** com a suíte verde, sem alterar comportamento.

Regras:
- Nenhum código de produção é mesclado sem testes que o cubram, escritos antes dele (o histórico deve mostrar `test:` antes de `feat:`).
- Não se desabilita nem se pula teste para "ficar verde".
- Uma funcionalidade está **pronta** quando todos os seus requisitos têm testes rastreáveis, a suíte completa passa, a suíte de aceitação passa contra o ambiente subido com `docker compose up --build`, e o README da implementação está atualizado.

Ordem sugerida: health e login (RFA1, RFA2) → clientes (História, RF2, RF3) → barbeiros e serviços (RF12, RF22, RF23, RFA3) → configuração do expediente (RFA4) → regras de horário e criação de agendamento (RF1, RF4 a RF8, RF10, RF11, RF19) → disponibilidade (RF24) → situação, cancelamento e exclusão (RF9, RF13, RF18) → listagem (RF14 a RF17) → pagamento (RF20, RF21, RNF5) → notificações (RF25 a RF27) → estatísticas e lucro (RF28, RFA3) → concorrência e persistência (RNF6, RNF2) → interface (RNF3) → benchmarks (RNF1).

## 7. Suíte de testes (comum às duas arquiteturas)

### 7.1 Níveis de teste

| Nível | O que verifica | Onde roda |
|---|---|---|
| **Unitário** | Regras puras: validação de nome e telefone (RF2, RF3), janela de 1 a 30 dias (RF4), dias da semana (RF5), último horário e almoço (RF6, RF7), ocupação de corte e barba (RF10), limite de 2 ativos (RF11), transições de situação (RF13), ordenação (RF14), contador e faturamento (RF16, RF17), geração de horários disponíveis (RF24), cálculo das estatísticas e do lucro (RF28, RFA3), validação da configuração do expediente (RFA4), regras de permissão por perfil (RFA2). Sem banco e sem HTTP. | Dentro de cada implementação |
| **Integração** | Repositórios contra banco real em container: busca sem diferenciar maiúsculas (RF15), unicidade do telefone, histórico preservado ao desativar barbeiro (RF22), concorrência (RNF6), persistência após reinício (RNF2). | Dentro de cada implementação |
| **Aceitação (caixa-preta)** | O contrato da seção 5.2 de ponta a ponta contra a aplicação subida com `docker compose`. **É a mesma suíte para as duas arquiteturas**, sem nenhuma alteração. | Fora da aplicação |
| **Ponta a ponta da interface** | Fluxos da seção 5.3 em navegador, em largura de celular, tablet e computador (RNF3), incluindo a confirmação antes de excluir (RF18). | Fora da aplicação |
| **Benchmark** | Desempenho e recursos (seção 11), incluindo o limite de 3 s do RNF1. | Fora da aplicação |

Cobertura mínima esperada: 80% de linhas nas regras de domínio e todos os RF e RNF com pelo menos um teste rastreável.

**Relógio controlado:** as regras dependem da data atual (RF4, RF25), então o relógio da aplicação deve poder ser fixado nos testes. Referência usada abaixo: **hoje = terça-feira, 2026-12-01, 10:00**, com o expediente padrão (abertura 09:00, último horário 18:00). Nesse cenário há 16 horários por dia (09:00 a 18:00 de 30 em 30, menos 12:00, 12:30 e 13:00).

**Dublês:** o provedor de pagamento (RNF5) e o envio de notificações (RF25) são simulados nos testes, com registro das chamadas para conferência.

### 7.2 Casos de teste de aceitação mínimos

| Caso | Requisito | Cenário | Resultado esperado |
|---|---|---|---|
| CT-01 | História, RF2, RF3 | Cadastrar cliente "João da Silva", telefone `82999998888` | 201 |
| CT-02 | RF2 | Nome com 2 caracteres, com 61 caracteres, com dígito ou símbolo | 400 |
| CT-03 | RF2 | Nome com acento ("Conceição Araújo") | 201 |
| CT-04 | RF3 | Telefone com 9 ou 12 dígitos, ou com letras | 400 |
| CT-05 | RF1 | `POST /agendamentos` sem cada um dos campos obrigatórios, um por vez | 400 em todos |
| CT-06 | RF4 | Data = hoje (2026-12-01) | 422 |
| CT-07 | RF4 | Data = hoje + 1 (2026-12-02) e hoje + 30 (2026-12-31) | 201 |
| CT-08 | RF4 | Data = hoje + 31 (2027-01-01) | 422 |
| CT-09 | RF5 | Domingo 2026-12-06 e segunda 2026-12-07 | 422 |
| CT-10 | RF6 | Horário 18:00 | 201 |
| CT-11 | RF6 | Horário 18:30 | 422 |
| CT-12 | RF7 | Horários 12:00, 12:30 e 13:00 | 422 |
| CT-13 | RF8 | Mesmo barbeiro, mesma data e horário, outro cliente | 409 |
| CT-14 | RF8 | Mesma data e horário com outro barbeiro | 201 |
| CT-15 | RF9 | Cancelar agendamento e agendar outro cliente no mesmo horário e barbeiro | 200, depois 201 |
| CT-16 | RF10 | Corte e barba às 14:00; outro agendamento do mesmo barbeiro às 14:30 | 201, depois 409 |
| CT-17 | RF10 | Corte e barba às 14:00 com 14:30 já ocupado | 409 |
| CT-18 | RF10 | Corte e barba às 11:30 e às 18:00 | 422 (ver 3.4, item 2) |
| CT-19 | RF11 | Terceiro agendamento `AGENDADO` do mesmo telefone | 422 |
| CT-20 | RF11 | Depois de atender ou cancelar um dos dois, novo agendamento | 201 |
| CT-21 | RF12 | `GET /servicos` na base inicial | Corte 3500, Barba 2500, Corte e barba 5500 |
| CT-22 | RF13 | Atender `AGENDADO`; atender de novo; cancelar `ATENDIDO`; cancelar `CANCELADO` | 200, 422, 422, 422 |
| CT-23 | RF14 | Agendamentos criados fora de ordem em datas e horários variados | Lista ordenada por data e depois horário |
| CT-24 | RF15 | Buscar `nomeCliente=joão` e `JOÃO` | Mesmos resultados, incluindo "João da Silva" |
| CT-25 | RF16 | 3 agendamentos, 1 cancelado | `total` = 2 |
| CT-26 | RF17 | Corte `AGENDADO`, Barba `ATENDIDO`, Corte e barba `CANCELADO` | `faturamentoPrevistoCentavos` = 3500 |
| CT-27 | RF18 | `DELETE /agendamentos/{id}`; depois `GET` | 204, depois 404 (a confirmação é testada na interface) |
| CT-28 | RF19 | Agendar com barbeiro desativado | 422 |
| CT-29 | RF20, RF21 | Agendamento sem pagamento; depois pagar com um método válido | 201 sem pagamento; 201 no pagamento com o método escolhido |
| CT-30 | RNF5 | Após o pagamento, consultar o banco | Nenhum número de cartão guardado, só `referenciaExterna` |
| CT-31 | RF22 | Editar e desativar barbeiro com agendamentos | Agendamentos dele continuam listados |
| CT-32 | RF23 | Editar preço do Corte para 4000 | Novos agendamentos com 4000; antigos mantêm 3500 |
| CT-33 | RF24 | Disponibilidade de dia livre para Corte | 16 horários, sem 12:00, 12:30 e 13:00 |
| CT-34 | RF24, RF10 | Disponibilidade de dia livre para Corte e barba | 14 horários (sem 11:30 e 18:00) |
| CT-35 | RF24 | Com 14:00 ocupado, disponibilidade para Corte | Não contém 14:00 |
| CT-36 | RF25 | Rodar a rotina diária com agendamentos de hoje e de amanhã | Notificações só para os de hoje, para cliente e barbeiro |
| CT-37 | RF26, RF27 | Cliente com `receberNotificacoes = false` | Barbeiro notificado, cliente não |
| CT-38 | RF28 | Estatísticas por dia, mês e ano, com e sem filtro de barbeiro | Contagens e faturamento previsto (`AGENDADO`) e registrado (`ATENDIDO`) corretos |
| CT-39 | RNF2 | Criar agendamentos, reiniciar todos os containers (sem apagar volumes), consultar | Dados preservados |
| CT-40 | RNF6 | 20 requisições simultâneas para o mesmo barbeiro, data e horário | Exatamente 1 resposta 201 e 19 respostas 409 |
| CT-41 | RNF4 | Fazer cadastro e agendamento e ler os logs | Nome e telefone não aparecem nos logs |
| CT-42 | RFA1 | `GET /health` com tudo no ar | 200, `{"status":"ok"}` |
| CT-43 | RFA2 | Login de cliente e da barbearia com senha certa e errada | 200 com token; 401 |
| CT-44 | RFA2 | Cliente chama `POST /barbeiros`, `GET /estatisticas`, `DELETE /agendamentos/{id}`; rota protegida sem token | 403; 401 |
| CT-45 | RFA2 | Cliente A tenta ver, cancelar ou pagar agendamento do cliente B; lista do cliente A | 403; lista só com os agendamentos de A |
| CT-46 | RFA3 | Corte com preço 3500 e custo 1500: um `AGENDADO` e um `ATENDIDO` | Lucro previsto 2000 e registrado 2000 |
| CT-47 | RFA3 | Editar custo do serviço depois de agendar | Agendamento antigo mantém o custo original no lucro |
| CT-48 | RFA4 | Barbearia muda abertura para 10:00 e último horário para 17:00 | Disponibilidade de Corte com 12 horários (10:00 a 17:00, sem almoço); agendar 09:30 ou 17:30 retorna 422 |
| CT-49 | RFA4 | Configuração inválida (abertura depois do último horário, minuto fora de 00 ou 30) | 400 |
| CT-50 | RFA4 | Agendamento feito às 09:00, depois abertura muda para 10:00 | Agendamento existente continua válido |

### 7.3 Onde fica a suíte de aceitação

Como ela é idêntica para as duas arquiteturas, a recomendação é mantê-la **uma única vez** em um diretório compartilhado (ex.: `testes/aceitacao/` na raiz do repositório), junto dos testes da interface e dos scripts de benchmark (`testes/benchmark/`). Cada implementação só precisa garantir que `docker compose up --build` deixa a API e a interface prontas em `localhost:8080`.

## 8. Arquitetura: monolito

### 8.1 Visão geral

Uma **única aplicação** (um processo, um artefato de build, uma imagem Docker) que contém todas as funcionalidades e também serve a interface web, e **um único banco de dados** PostgreSQL compartilhado por todos os módulos.

```
                 ┌───────────────────────────────────────────────────────┐
 navegador /  ──▶│  barbearia (porta 8080): API + interface web          │
 cliente HTTP    │ ┌────────┐┌────────┐┌───────────┐┌──────────┐┌──────┐ │
                 │ │clientes││catalogo││agendamento││pagamentos││notif.│ │
                 │ └────────┘└────────┘└───────────┘└──────────┘└──────┘ │
                 └──────────────────────────┬────────────────────────────┘
                                            ▼                ▲
                                 PostgreSQL (1 banco)   provedor de pagamento
                                                        externo (simulado)
```

### 8.2 Organização interna (monolito modular)

O código é dividido em módulos por domínio, com as mesmas fronteiras que os serviços terão na versão de microsserviços. Assim a comparação reflete a forma de implantação e comunicação, e não uma modelagem diferente.

| Módulo | Responsabilidade | Requisitos |
|---|---|---|
| `autenticacao` | Login de cliente e da barbearia, emissão e validação de token, permissões por perfil | RFA2 |
| `clientes` | Cadastro (com senha), preferências de notificação | História, RF2, RF3, RF26, RF27 |
| `catalogo` | Barbeiros e serviços (preço e custo) | RF12, RF19, RF22, RF23, RFA3 |
| `agendamento` | Agendamentos, configuração do expediente, regras de horário, disponibilidade, listagem, estatísticas e lucro | RF1, RF4 a RF11, RF13 a RF18, RF24, RF28, RNF6, RFA3, RFA4 |
| `pagamentos` | Pagamento opcional via provedor externo | RF20, RF21, RNF5 |
| `notificacoes` | Rotina diária de notificação | RF25, RF27 |
| `compartilhado` | Erros padronizados, relógio, logs sem dados pessoais, health check | RNF4, RFA1 |
| `web` | Interface responsiva (arquivos estáticos) | RNF3, RF18 |

Cada módulo segue camadas simples:

- `api` (rotas/controllers): valida a entrada e traduz para o formato do contrato.
- `dominio`: entidades e regras de negócio puras, sem dependência de framework (é aqui que ficam os testes unitários).
- `repositorio`: acesso ao banco.

Estrutura sugerida (ajustar à convenção da linguagem escolhida):

```
monolito/
├── SPEC-monolito-v3.md
├── README.md              # como rodar e testar
├── docker-compose.yml     # app + postgres (volume persistente)
├── Dockerfile
├── src/
│   ├── autenticacao/
│   ├── clientes/{api,dominio,repositorio}
│   ├── catalogo/{api,dominio,repositorio}
│   ├── agendamento/{api,dominio,repositorio}
│   ├── pagamentos/{api,dominio,repositorio}
│   ├── notificacoes/
│   ├── compartilhado/
│   └── web/
├── migrations/
└── tests/
    ├── unit/
    └── integration/
```

### 8.3 Comunicação entre módulos

- Módulos conversam por **chamadas de função em memória**, através de uma interface pública de cada módulo (ex.: `catalogo.buscarBarbeiro(id)`). Um módulo não acessa as tabelas de outro diretamente.
- A criação de agendamento acontece em **uma única transação**: busca o cliente pelo telefone, valida barbeiro e serviço, aplica as regras de horário, o limite de 2 ativos (RF11) e o conflito (RF8, RF10), e grava.
- A rotina de notificações (RF25) roda dentro do mesmo processo, agendada uma vez por dia, e consulta os módulos `agendamento`, `clientes` e `catalogo` em memória.
- A autenticação (RFA2) é um filtro na entrada das rotas: valida o token e o perfil antes de chamar o módulo, tudo no mesmo processo.
- O módulo `pagamentos` é o único que fala com o provedor externo (RNF5).

### 8.4 Dados

- Um banco PostgreSQL com tabelas `clientes`, `usuarios_barbearia`, `barbeiros`, `servicos`, `configuracao_expediente`, `agendamentos` e `pagamentos`, com chaves estrangeiras entre elas.
- Volume persistente no Docker Compose (RNF2).
- Concorrência (RNF6): garantida no banco. Como corte e barba ocupa dois horários (RF10), a sugestão é uma tabela de ocupação com uma linha por horário ocupado e restrição única `(barbeiro_id, data, horario)`, apagando as linhas ao cancelar (RF9); outra opção é uma constraint de exclusão por intervalo de tempo.
- Agendamentos referenciam o barbeiro, que é só desativado, nunca apagado (RF22).
- Migrações versionadas em `migrations/`, aplicadas na subida, incluindo os serviços iniciais do RF12, o expediente padrão (RFA4) e o usuário inicial da barbearia (RFA2, senha vinda de variável de ambiente).

### 8.5 Implantação

- `docker-compose.yml` com dois containers: `app` (API, interface e rotina de notificações) e `db`.
- O `GET /health` (RFA1) verifica a conexão com o banco e é usado no `healthcheck` do Compose.

## 9. Testes específicos do monolito

Além da suíte comum (seção 7):

- **Unitários** por módulo em `tests/unit/`, com foco no `dominio` de `agendamento`.
- **Integração** em `tests/integration/` com PostgreSQL real em container, incluindo o teste de concorrência (RNF6) no nível do repositório e a transação de criação de agendamento.
- **Fronteiras de módulo**: um teste (ou regra de lint) que falha se um módulo importar o `repositorio` ou o `dominio` interno de outro módulo, para manter o monolito modular.
- Comando único para tudo (ex.: `make test`), documentado no README.

## 10. Stack e decisões em aberto

A especificação não fixa a stack. O grupo deve decidir **uma vez, para as duas implementações**, e registrar no README:

- **Linguagem e framework HTTP** (ex.: Node.js + Fastify/Express, Python + FastAPI, Java + Spring Boot, Go). Critério: o que o grupo domina, já que o prazo é curto.
- **Interface web**: HTML/CSS/JS simples ou um framework leve; precisa ser a mesma nas duas versões.
- **Banco**: PostgreSQL é a sugestão.
- **Framework de testes**, ferramenta de testes da interface (ex.: Playwright) e de benchmark (ex.: k6).
- **Local da suíte de aceitação e dos benchmarks**: recomendado `testes/` na raiz, compartilhado (seção 7.3).
- Os pontos em aberto dos requisitos (seção 3.4).

## 11. Benchmarks (insumo para o artigo)

Rodar os mesmos scripts contra as duas arquiteturas, na mesma máquina, com a mesma massa de dados inicial e o **mesmo limite total de recursos** (ex.: 2 CPUs e 2 GB somados entre todos os containers da aplicação, sem contar o gerador de carga). A massa de dados e o provedor de pagamento simulado são ferramentas do benchmark, não funcionalidades da aplicação.

Cenários:
1. **Leitura**: `GET /disponibilidade`, `GET /agendamentos` com busca por nome (com token da barbearia).
2. **Escrita**: `POST /agendamentos` com clientes, barbeiros e horários distintos.
3. **Misto**: 80% leitura e 20% escrita.
4. **Rampa**: carga crescente até a taxa de erro passar de 1% ou o p95 de `POST /agendamentos` passar de 3 s (RNF1).

Os scripts fazem login antes (RFA2) e reutilizam o token, para que o custo do login não distorça as medições.

Métricas a registrar: latência p50, p95 e p99; vazão (requisições por segundo); taxa de erro; CPU e memória por container (`docker stats`); tempo de inicialização até o `GET /health` responder 200 (RFA1); tamanho total das imagens; tempo de build.

No monolito, registrar também o efeito de escalar horizontalmente a aplicação inteira (ex.: 2 réplicas atrás de um balanceador, com a rotina de notificações rodando em só uma delas), para comparar com escalar só o serviço de agendamento na versão de microsserviços.
