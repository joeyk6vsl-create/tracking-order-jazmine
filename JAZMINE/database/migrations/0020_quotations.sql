CREATE TABLE quotations (
 id uuid PRIMARY KEY,
 draft_id uuid NOT NULL UNIQUE REFERENCES order_drafts(id),
 number text NOT NULL UNIQUE,
 latest_revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE quotation_revisions (
 id uuid PRIMARY KEY,
 quotation_id uuid NOT NULL REFERENCES quotations(id),
 revision integer NOT NULL,
 draft_version integer NOT NULL,
 pricing_revision integer NOT NULL REFERENCES pricing_versions(revision),
 snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(quotation_id,revision)
);
CREATE INDEX quotation_revisions_history ON quotation_revisions(quotation_id,revision DESC);
CREATE TABLE quotation_commands (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 request_hash text NOT NULL,
 result jsonb NOT NULL
);
