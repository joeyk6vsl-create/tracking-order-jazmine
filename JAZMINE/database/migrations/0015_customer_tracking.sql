CREATE TABLE tracking_links (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tracking_one_active ON tracking_links(order_id) WHERE revoked_at IS NULL;
CREATE TABLE tracking_sessions (
 session_hash text PRIMARY KEY,
 link_id uuid NOT NULL REFERENCES tracking_links(id),
 order_revision integer NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_sessions_link ON tracking_sessions(link_id);
CREATE TABLE tracking_attempts (
 bucket text PRIMARY KEY,
 failures integer NOT NULL,
 reset_at timestamptz NOT NULL
);
CREATE TABLE customer_requests (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 kind text NOT NULL CHECK(kind IN ('GENERAL','DELIVERY','EXPEDITE')),
 message text NOT NULL,
 request_hash text NOT NULL,
 state text NOT NULL DEFAULT 'SUBMITTED' CHECK(state IN ('SUBMITTED','UNDER_REVIEW','RESOLVED')),
 outcome text CHECK(outcome IN ('APPROVED','REJECTED','NO_ACTION')),
 response text NOT NULL DEFAULT '',
 row_version integer NOT NULL DEFAULT 1,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by uuid REFERENCES users(id)
);
CREATE INDEX customer_requests_order ON customer_requests(order_id,submitted_at,id);
CREATE INDEX customer_requests_state ON customer_requests(state,submitted_at,id);
CREATE TABLE tracking_commands (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 operation text NOT NULL,
 request_hash text NOT NULL,
 result jsonb NOT NULL
);
