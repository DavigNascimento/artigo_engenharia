-- Banco do serviço agendamento. Mesmas colunas e índices do monolito; clientes, barbeiros e
-- serviços ficam em outros bancos, então não há chaves estrangeiras para eles (SPEC 8.4).
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
  cliente_id uuid NOT NULL,
  nome_cliente text NOT NULL,
  barbeiro_id uuid NOT NULL,
  servico_id uuid NOT NULL,
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
  barbeiro_id uuid NOT NULL,
  data date NOT NULL,
  horario time NOT NULL,
  agendamento_id uuid NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  PRIMARY KEY (barbeiro_id, data, horario)
);

CREATE INDEX IF NOT EXISTS ocupacoes_agendamento_idx
  ON ocupacoes_horario (agendamento_id);
