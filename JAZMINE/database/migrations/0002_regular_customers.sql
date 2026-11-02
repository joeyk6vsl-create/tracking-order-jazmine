CREATE TABLE customers (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  phone text NOT NULL,
  normalized_phone text NOT NULL CHECK (normalized_phone ~ '^[0-9]{6,20}$'),
  customer_group text NOT NULL CHECK (customer_group IN ('RETAIL','AGENT_LEVEL_1','AGENT_LEVEL_2','AGENT_LEVEL_3','AGENT_LEVEL_4','AGENT_LEVEL_5')),
  branding_type text NOT NULL CHECK (branding_type IN ('JAZMINE_STANDARD','CUSTOM_AGENT')),
  customer_since date NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  row_version bigint NOT NULL DEFAULT 1,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_phone_idx ON customers(normalized_phone text_pattern_ops);
CREATE INDEX customers_name_idx ON customers(lower(name) text_pattern_ops);
CREATE INDEX customers_status_id_idx ON customers(status,id);
CREATE TABLE customer_create_requests (
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL,
  payload_hash text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,request_key)
);
