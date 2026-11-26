# Barbearia — monólito modular

Implementação conforme `SPEC-monolito-v3.md`: um processo/artefato Node.js atende a API e a interface web; os módulos de domínio se comunicam por chamadas em memória e compartilham um único PostgreSQL. Nenhum módulo é implantado como serviço separado.

## Stack e módulos

- Node.js 24, HTTP nativo e PostgreSQL 17 (`pg`).
- `src/autenticacao/`: login, hash de senhas e identidade da barbearia.
- `src/clientes/`: cadastro e preferências dos clientes.
- `src/catalogo/`: barbeiros, serviços e expediente.
- `src/agendamento/`: disponibilidade, transações, estados, listagem e estatísticas.
- `src/pagamentos/`: criação de pagamento por adaptador de provedor.
- `src/notificacoes/`: rotina diária no próprio processo.
- `src/compartilhado/`: PostgreSQL, autenticação, relógio, validações e erros.
- `src/app.js`: camada HTTP/controladores; `web/`: interface responsiva.
- `migrations/`: esquema e dados iniciais. Todas as tabelas ficam no mesmo banco PostgreSQL.

Os preços e custos são armazenados em centavos. Senhas são derivadas com scrypt; tokens Bearer são assinados. Nome e telefone não são escritos nos logs. O Postgres não publica uma porta no host.

## Executar com Docker Compose

1. Copie `.env.example` para `.env` e substitua as senhas e `TOKEN_SECRET` por valores locais fortes (pelo menos 32 caracteres para o segredo de token).
2. Na pasta `monolito/`, execute:

   ```powershell
   docker compose up --build
   ```

3. Abra <http://localhost:8080>. A API e o endpoint `GET /health` usam a mesma porta.

O Compose aguarda o Postgres ficar saudável antes de iniciar o app. O volume `postgres_data` mantém os dados entre reinícios. `docker compose down` para os containers sem apagar esse volume. Não use credenciais de exemplo em ambientes reais.

O usuário inicial da barbearia é configurado por `BARBERIA_LOGIN` e `BARBERIA_PASSWORD` no `.env`; a senha é persistida somente como hash. Para acesso local inicial, use os valores configurados nesse arquivo.

## Executar sem Docker

É necessário um PostgreSQL acessível. Na pasta `monolito/`, instale as dependências e configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `BARBERIA_PASSWORD` e `TOKEN_SECRET`; então rode `npm start`. O processo aplica a migração e escuta em `PORT` (padrão `8080`). `APP_NOW` pode fixar o relógio no formato ISO para testes.

## Testes

```powershell
npm test
```

Testes de aceitação contra a aplicação já iniciada:

```powershell
$env:BARBERIA_LOGIN = "admin"
$env:BARBERIA_PASSWORD = "senha-configurada-no-env"
npm run test:acceptance
```

Os testes de aceitação usam `http://127.0.0.1:8080` por padrão; `BASE_URL` permite apontar para outro host.

O arquivo `.env.example` seleciona Pix, cartão de crédito e cartão de débito como métodos, e WhatsApp como canal de notificação. Pagamento e envio de notificação usam adaptadores simulados: nenhum dado de cartão é recebido ou persistido e nenhuma mensagem real é enviada sem integração com um provedor externo.
