-- Monolito: um único banco com as tabelas de todos os módulos e chaves estrangeiras entre elas
-- (SPEC 8.4). As colunas e índices de cada tabela são os mesmos dos bancos dos microsserviços;
-- a única diferença de esquema são as chaves estrangeiras entre tabelas de módulos diferentes.

-- Módulo clientes
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  telefone varchar(11) NOT NULL UNIQUE,
  receber_notificacoes boolean NOT NULL DEFAULT true,
  canal text NOT NULL DEFAULT 'WhatsApp'
);

-- Módulo autenticacao
CREATE TABLE IF NOT EXISTS usuarios_barbearia (
  id uuid PRIMARY KEY,
  login text NOT NULL UNIQUE,
  senha_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS credenciais_clientes (
  cliente_id uuid PRIMARY KEY REFERENCES clientes(id),
  telefone varchar(11) NOT NULL UNIQUE,
  senha_hash text NOT NULL
);

-- Módulo catalogo
CREATE TABLE IF NOT EXISTS barbeiros (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS servicos (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  duracao_minutos integer NOT NULL CHECK (duracao_minutos > 0 AND duracao_minutos % 30 = 0),
  preco_centavos integer NOT NULL CHECK (preco_centavos >= 0),
  custo_centavos integer NOT NULL DEFAULT 0 CHECK (custo_centavos >= 0)
);

INSERT INTO servicos (id, nome, duracao_minutos, preco_centavos, custo_centavos)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Corte', 30, 3500, 0),
  ('00000000-0000-4000-8000-000000000002', 'Barba', 30, 2500, 0),
  ('00000000-0000-4000-8000-000000000003', 'Corte e barba', 60, 5500, 0)
ON CONFLICT (id) DO NOTHING;

-- Módulo agendamento
CREATE TABLE IF NOT EXISTS configuracao_expediente (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  hora_abertura time NOT NULL,
  ultimo_horario time NOT NULL,
  CHECK (hora_abertura < ultimo_horario)
);

INSERT INTO configuracao_expediente (singleton, hora_abertura, ultimo_horario)
VALUES (true, '09:00', '18:00')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS agendamentos (
  id uuid PRIMARY KEY,
  cliente_id uuid NOT NULL REFERENCES clientes(id),
  nome_cliente text NOT NULL,
  barbeiro_id uuid NOT NULL REFERENCES barbeiros(id),
  servico_id uuid NOT NULL REFERENCES servicos(id),
  data date NOT NULL,
  horario time NOT NULL,
  situacao text NOT NULL CHECK (situacao IN ('AGENDADO', 'ATENDIDO', 'CANCELADO')),
  preco_centavos integer NOT NULL CHECK (preco_centavos >= 0),
  custo_centavos integer NOT NULL CHECK (custo_centavos >= 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agendamentos_data_horario_idx
  ON agendamentos (data, horario);
CREATE INDEX IF NOT EXISTS agendamentos_cliente_situacao_idx
  ON agendamentos (cliente_id, situacao);

CREATE TABLE IF NOT EXISTS ocupacoes_horario (
  barbeiro_id uuid NOT NULL REFERENCES barbeiros(id),
  data date NOT NULL,
  horario time NOT NULL,
  agendamento_id uuid NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  PRIMARY KEY (barbeiro_id, data, horario)
);

CREATE INDEX IF NOT EXISTS ocupacoes_agendamento_idx
  ON ocupacoes_horario (agendamento_id);

-- Módulo pagamentos
CREATE TABLE IF NOT EXISTS pagamentos (
  id uuid PRIMARY KEY,
  agendamento_id uuid NOT NULL UNIQUE REFERENCES agendamentos(id),
  cliente_id uuid NOT NULL REFERENCES clientes(id),
  metodo text NOT NULL CHECK (metodo IN ('Pix', 'Cartão de crédito', 'Cartão de débito')),
  status text NOT NULL,
  referencia_externa text NOT NULL UNIQUE,
  valor_centavos integer NOT NULL CHECK (valor_centavos >= 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);
