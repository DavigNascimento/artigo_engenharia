-- Banco do serviço autenticacao. Mesmas colunas do monolito; sem chave estrangeira para
-- clientes, que fica em outro banco (SPEC 8.4).
CREATE TABLE IF NOT EXISTS usuarios_barbearia (
  id uuid PRIMARY KEY,
  login text NOT NULL UNIQUE,
  senha_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS credenciais_clientes (
  cliente_id uuid PRIMARY KEY,
  telefone varchar(11) NOT NULL UNIQUE,
  senha_hash text NOT NULL
);
