# Barbearia: monolito modular

Implementação conforme `SPEC-monolito-v3.md`: **um processo** Node.js atende a API e a interface
web e usa **um único PostgreSQL**. Os módulos se comunicam por chamadas de função em memória e
cada um só acessa as próprias tabelas. As decisões de controle experimental em relação aos
microsserviços estão em [`../METODOLOGIA.md`](../METODOLOGIA.md).

## Módulos

| Pasta | Responsabilidade | Tabelas |
|---|---|---|
| `src/autenticacao/` | Login, hash de senhas, credenciais de clientes, usuário da barbearia | `usuarios_barbearia`, `credenciais_clientes` |
| `src/clientes/` | Cadastro e preferências de notificação | `clientes` |
| `src/catalogo/` | Barbeiros e serviços | `barbeiros`, `servicos` |
| `src/agendamento/` | Agendamentos, regras de horário, disponibilidade, expediente, listagem e estatísticas | `agendamentos`, `ocupacoes_horario`, `configuracao_expediente` |
| `src/pagamentos/` | Pagamento opcional por provedor simulado | `pagamentos` |
| `src/notificacoes/` | Rotina diária de notificação (09:00) | nenhuma |
| `src/compartilhado/` | Servidor HTTP, autenticação por token, validação, erros, banco e inicialização | |

Cada módulo tem `index.js` (regras e interface pública), `repository.js` (SQL das próprias
tabelas), `rotas.js` (rotas HTTP) e, quando usa outros módulos, `dependencias.js`, o único arquivo
que importa outro módulo. Esses arquivos são idênticos aos dos microsserviços, exceto o
`dependencias.js`, que lá faz chamadas HTTP. `src/app.js` junta as rotas de todos os módulos.

Preços e custos em centavos. Senhas com scrypt; tokens Bearer assinados com HMAC. Nome e telefone
não aparecem nos logs. O Postgres não publica porta no host.

## Executar

1. Copie `.env.example` para `.env` e troque as senhas e o `TOKEN_SECRET` (mínimo de 32 caracteres).
2. Na pasta `monolito/`:

   ```powershell
   docker compose up --build
   ```

3. Abra <http://localhost:8080>. A API e o `GET /health` usam a mesma porta.

O volume `postgres_data` mantém os dados entre reinícios. **Se você já tinha subido uma versão
anterior**, apague o volume antes (`docker compose down -v`), porque o esquema mudou.

Para medições, aplique os limites de recursos (o executor do benchmark faz isso sozinho):

```powershell
docker compose -f docker-compose.yml -f docker-compose.limites.yml up --build
```

Controle "monolito + gateway" (mesmo Nginx dos microsserviços na frente do monolito):

```powershell
docker compose -f docker-compose.yml -f docker-compose.gateway.yml up --build
```

Em réplicas extras do monolito (escala horizontal), defina `NOTIFICACOES_ATIVAS=false` para que
a rotina diária rode só em uma delas.

## Testes

Unitários (regras de domínio, autenticação, HTTP e fronteiras entre módulos):

```powershell
npm ci
npm test
```

A suíte de aceitação, o teste de paridade com os microsserviços e o benchmark ficam em
[`../testes/`](../testes/) e são os mesmos para as duas arquiteturas. Com a aplicação no ar, na
raiz do repositório:

```powershell
$env:BARBERIA_PASSWORD = "senha-configurada-no-env"
npm run test:aceitacao
npm run test:paridade
```

Pagamento e notificação usam adaptadores simulados: nenhum dado de cartão é recebido ou
guardado e nenhuma mensagem real é enviada.
