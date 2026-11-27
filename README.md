# Monolito e Microsserviços para Iniciantes

Artigo comparando, de forma introdutória, as arquiteturas **monolítica** e de **microsserviços**: definição de cada conceito e um comparativo por diferentes aspectos, incluindo diferenças práticas quantitativas obtidas por meio de testes e benchmarks.

## Integrantes

- Davi Gonçalves Nascimento
- João Victor Sales de Santana Melo
- Pedro Faria Barreto
- Pedro Henrique Moraes Silva Poderoso

## Organização

Quadro do Trello com o planejamento do projeto: [Artigo: Monolito vs Microsserviços](https://trello.com/b/AK5eosyl/artigo-monolito-vs-microsservi%C3%A7os)

## Estrutura do repositório

| Diretório / arquivo | Conteúdo |
|---------------------|----------|
| `artigo/`           | Artigo em LaTeX (template SBC) |
| `monolito/`         | Implementação com arquitetura monolítica (monolito modular) |
| `microsservicos/`   | Implementação com arquitetura de microsserviços |
| `testes/`           | Suíte de aceitação, testes de resiliência, teste de paridade e benchmark, comuns às duas |
| `METODOLOGIA.md`    | Como os fatores além da arquitetura foram controlados e ameaças à validade |
| `docs/`             | Briefing e documentos de referência do trabalho |

## Executar as aplicações

Em cada pasta (`monolito/` ou `microsservicos/`), copie `.env.example` para `.env`, troque as
credenciais de exemplo e execute:

```powershell
docker compose up --build
```

Depois, acesse http://localhost:8080 (uma arquitetura por vez, ambas usam a porta 8080). Os
READMEs do [monolito](./monolito/README.md) e dos [microsserviços](./microsservicos/README.md)
detalham a estrutura e os testes.

## Testes e benchmark

Na raiz, com uma das aplicações no ar (Node.js 20+, sem dependências):

```powershell
$env:BARBERIA_PASSWORD = "senha-configurada-no-env"
npm run test:aceitacao     # mesma suíte para as duas arquiteturas
npm run test:paridade      # garante que só a arquitetura difere entre as implementações
npm run test:resiliencia   # só microsserviços
npm run benchmark          # protocolo completo; ver testes/benchmark/README.md
```

## Estrutura do artigo

- **Introdução:** por que precisamos de arquiteturas e quais são as formas de organização (monolito e microsserviços).
- **Metodologia:** como implementar cada arquitetura e como foram construídos os testes e benchmarks.
- **Conclusão:** resultado do comparativo e diferenças práticas entre as arquiteturas.

## Prazos

- Revisão do projeto: **28/11**
- Entrega final: **30/11 às 8:30**
