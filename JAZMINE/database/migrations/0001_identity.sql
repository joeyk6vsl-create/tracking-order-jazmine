CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN_PROMAX','STAFF')),
  department text NOT NULL CHECK (department IN ('ADMIN','GRAPHIC','PRINTING','HEAT_TRANSFER','LASER','SIZE_SORTING','SEWING','QC_PACKING')),
  status text NOT NULL CHECK (status IN ('PENDING','ACTIVE','DISABLED')),
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  username text NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS login_throttle (
  key text PRIMARY KEY, attempts integer NOT NULL, window_started timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL, entity_id uuid, reason text, detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY, type text NOT NULL, aggregate_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
CREATE TABLE IF NOT EXISTS worker_receipts (
  event_id uuid PRIMARY KEY REFERENCES outbox_events(id) ON DELETE RESTRICT,
  processed_at timestamptz NOT NULL DEFAULT now()
);
