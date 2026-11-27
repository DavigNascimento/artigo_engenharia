# Barbearia - microsservicos

Implementacao do Barbearia conforme `SPEC-microsservicos-v3.md`, com API
exposta pelo gateway na porta 8080 e interface web responsiva.

## Stack

- Node.js 24 e HTTP nativo
- PostgreSQL 17
- Nginx como API gateway
- Docker Compose

## Executar

No PowerShell, a partir desta pasta:

```powershell
Copy-Item .env.example .env
# Edite .env antes de subir a aplicacao
docker compose up --build
```

Abra http://localhost:8080.

Os bancos ficam na rede interna do Compose e nao publicam portas no host.
O volume `postgres_agendamento_data` preserva os dados entre reinicios.

## Testes

```powershell
npm install
npm test
```

Com a aplicacao iniciada:

```powershell
npm run test:acceptance
```

## Decisao de banco

Nesta versao os processos independentes apontam para um PostgreSQL isolado
na rede interna do Docker Compose. O banco nao publica porta no host e usa
um volume persistente dedicado.
