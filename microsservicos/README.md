# Barbearia: microsserviços

Implementação conforme `SPEC-microsservicos-v3.md`: seis serviços independentes, cada um com
processo, imagem Docker e banco próprios, atrás de um API Gateway Nginx na porta 8080. Para quem
usa a aplicação, o contrato HTTP e a interface web são os mesmos do monolito. As decisões de
controle experimental estão em [`../METODOLOGIA.md`](../METODOLOGIA.md).

## Serviços

| Serviço | Rotas públicas (pelo gateway) | Banco | Chama |
|---|---|---|---|
| `gateway` (Nginx) | todas; serve a interface web | nenhum | todos |
| `autenticacao` | `/auth/*` | `autenticacao` | — |
| `clientes` | `/clientes*` | `clientes` | `autenticacao` (credencial no cadastro) |
| `catalogo` | `/barbeiros*`, `/servicos*` | `catalogo` | — |
| `agendamento` | `/agendamentos*`, `/disponibilidade`, `/estatisticas`, `/configuracao/*`, `/health` (agregado) | `agendamento` | `clientes`, `catalogo`, `pagamentos` |
| `pagamentos` | `/agendamentos/{id}/pagamento` | `pagamentos` | `agendamento` |
| `notificacoes` | nenhuma (rotina diária às 09:00) | nenhum | `agendamento`, `clientes` |

- **Código.** `src/<serviço>/` contém o mesmo `index.js`, `repository.js`, `rotas.js` e
  `domain.js` do módulo equivalente do monolito (conferido por `npm run test:paridade` na raiz).
  O que muda é o `dependencias.js`, que chama os outros serviços por HTTP (`src/compartilhado/servicos.js`),
  mais o `internas.js` (rotas `/internal/*`, só na rede interna) e o `main.js` (inicialização).
  Cada imagem leva só `src/compartilhado/` e a pasta do próprio serviço.
- **Comunicação.** HTTP/JSON síncrono pela rede interna, sem passar pelo gateway, com timeout de
  2 s por chamada. Dependência fora do ar ou lenta → 503 `SERVICO_INDISPONIVEL`; um 404 da
  dependência vira 404 na resposta.
- **Autenticação.** Token HMAC emitido pelo `autenticacao` e validado localmente em cada serviço
  com o segredo compartilhado.
- **Dados.** **Decisão (SPEC 8.4):** um container PostgreSQL com **cinco bancos isolados**, um por
  serviço, cada um acessado por um usuário próprio sem permissão de conexão aos outros
  (`db/init/01-bancos.sh`). Escolhemos essa opção para que a camada de dados use os mesmos recursos
  do monolito; não há chaves estrangeiras entre serviços.

## Executar

1. Copie `.env.example` para `.env` e troque as senhas e o `TOKEN_SECRET` (mínimo de 32 caracteres).
2. Na pasta `microsservicos/`:

   ```powershell
   docker compose up --build
   ```

3. Abra <http://localhost:8080>.

O gateway só sobe depois que todos os serviços estão saudáveis. Os bancos ficam na rede interna e
não publicam porta. O volume `postgres_data` mantém os dados entre reinícios. Os bancos e usuários
são criados na primeira inicialização do volume; se você já tinha subido uma versão anterior, use
`docker compose down -v` antes.

Para medições, aplique os limites de recursos (o executor do benchmark faz isso sozinho):

```powershell
docker compose -f docker-compose.yml -f docker-compose.limites.yml up --build
```

Escala seletiva: `docker compose up -d --scale agendamento=2`. O gateway descobre as réplicas
pelo DNS do Docker.

## Testes

Unitários (domínio, autenticação e fronteiras entre módulos):

```powershell
npm ci
npm test
```

Na raiz do repositório, com a aplicação no ar:

```powershell
$env:BARBERIA_PASSWORD = "senha-configurada-no-env"
npm run test:aceitacao      # mesma suíte do monolito
npm run test:resiliencia    # gateway e falhas de serviços (para e pausa containers)
npm run test:paridade       # código idêntico ao do monolito
```

`test:resiliencia` usa o projeto do Compose `microsservicos`, que é o padrão quando a pilha sobe a
partir desta pasta; use `COMPOSE_PROJECT` se tiver usado outro nome.
