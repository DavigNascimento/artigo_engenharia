#!/bin/sh
# Cria um banco e um usuário por serviço no mesmo container PostgreSQL (SPEC 8.4, opção
# "bancos isolados no mesmo container"). Cada usuário só pode se conectar ao próprio banco,
# então nenhum serviço acessa o banco de outro. Roda só na primeira inicialização do volume.
set -eu

for servico in autenticacao clientes catalogo agendamento pagamentos; do
  psql -v ON_ERROR_STOP=1 -v servico="$servico" -v senha="$POSTGRES_PASSWORD" \
    --username "$POSTGRES_USER" --dbname postgres <<'SQL'
CREATE ROLE :"servico" LOGIN PASSWORD :'senha';
CREATE DATABASE :"servico" OWNER :"servico";
REVOKE ALL ON DATABASE :"servico" FROM PUBLIC;
SQL
done
