CREATE TABLE order_drafts (
 id uuid PRIMARY KEY,
 row_version integer NOT NULL DEFAULT 1,
 input_json jsonb NOT NULL,
 quote_json jsonb NOT NULL,
 selection_json jsonb NOT NULL,
 request_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
