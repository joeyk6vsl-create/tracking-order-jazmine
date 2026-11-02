CREATE TABLE pricing_versions (
 id uuid PRIMARY KEY,
 revision integer NOT NULL UNIQUE,
 config jsonb NOT NULL,
 source text NOT NULL,
 reason text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
