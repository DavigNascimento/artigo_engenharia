# Benchmarks

O benchmark usa k6 e executa leitura, escrita, carga mista 80/20 e rampa. Os gráficos/resumos do k6 reportam p50, p95, p99, vazão e erros; o limite do RNF1 é `p95 < 3000 ms` para `POST /agendamentos`.

Pré-requisitos: aplicação saudável em `localhost:8080`, k6 instalado, credenciais locais configuradas e uma data terça–sábado entre 1 e 30 dias à frente. O serviço inicial `Corte` é usado por padrão. O setup cria barbeiros e clientes descartáveis no banco; use uma base de benchmark isolada.

Exemplo PowerShell:

```powershell
$env:BARBERIA_LOGIN = "admin"
$env:BARBERIA_PASSWORD = "senha-local"
$env:DATA = "AAAA-MM-DD"
$env:SCENARIO = "mixed"
$env:VUS = "10"
k6 run tests/benchmark/k6.js
```

Use `SCENARIO=read`, `write`, `mixed` ou `ramp`. Para ramp, configure `START_RATE`, `TARGET_RATE`, `MAX_VUS` e `DURATION`. `HORARIO` deve ser um horário de expediente disponível, por padrão `15:00`.

Registre junto aos resultados o commit, a massa inicial, a configuração da máquina, a duração do build, o tempo até `/health` ficar pronto, e a CPU/memória observadas com `docker stats`. Rode as mesmas configurações e a mesma massa inicial nas duas arquiteturas; faça o reset apenas de uma base de benchmark descartável.
