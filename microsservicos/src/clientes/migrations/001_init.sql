-- Banco do serviço clientes. Mesmas colunas do monolito.
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  telefone varchar(11) NOT NULL UNIQUE,
  receber_notificacoes boolean NOT NULL DEFAULT true,
  canal text NOT NULL DEFAULT 'WhatsApp'
);
