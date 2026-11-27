-- Banco do serviço pagamentos. Mesmas colunas do monolito; sem chaves estrangeiras para
-- agendamentos e clientes, que ficam em outros bancos (SPEC 8.4). Nunca guarda cartão (RNF5).
CREATE TABLE IF NOT EXISTS pagamentos (
  id uuid PRIMARY KEY,
  agendamento_id uuid NOT NULL UNIQUE,
  cliente_id uuid NOT NULL,
  metodo text NOT NULL CHECK (metodo IN ('Pix', 'Cartão de crédito', 'Cartão de débito')),
  status text NOT NULL,
  referencia_externa text NOT NULL UNIQUE,
  valor_centavos integer NOT NULL CHECK (valor_centavos >= 0),
  criado_em timestamptz NOT NULL DEFAULT now()
);
