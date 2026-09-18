CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE wallet_status AS ENUM ('active', 'restricted', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_transaction_type AS ENUM ('deposit', 'withdraw', 'reward', 'stake_lock', 'entry_lock', 'tournament_entry_fee', 'refund');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_transaction_status AS ENUM ('pending', 'completed', 'failed', 'processed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  locked_balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  status wallet_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transaction_pins (
  user_id TEXT PRIMARY KEY REFERENCES wallets(user_id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES wallets(user_id) ON DELETE CASCADE,
  type wallet_transaction_type NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  method TEXT,
  destination TEXT,
  reference_id TEXT NOT NULL UNIQUE,
  status wallet_transaction_status NOT NULL,
  idempotency_key TEXT NOT NULL,
  note TEXT,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS wallet_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_user_created ON wallet_audit_events(user_id, created_at DESC);
