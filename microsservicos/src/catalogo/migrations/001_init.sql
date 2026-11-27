-- Banco do serviço catalogo. Mesmas colunas e serviços iniciais (RF12) do monolito.
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
