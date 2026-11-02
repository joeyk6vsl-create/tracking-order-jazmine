ALTER TABLE orders ADD COLUMN business_state text NOT NULL DEFAULT 'ACTIVE' CHECK(business_state IN ('ACTIVE','CANCELLED'));
ALTER TABLE orders ADD COLUMN storage_state text NOT NULL DEFAULT 'ACTIVE' CHECK(storage_state IN ('ACTIVE','ARCHIVED'));
ALTER TABLE orders ADD COLUMN lifecycle_version integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN cancelled_at timestamptz;
ALTER TABLE orders ADD COLUMN cancel_agreed_lak bigint CHECK(cancel_agreed_lak>=0 AND cancel_agreed_lak<=9000000000000000);
CREATE TABLE order_lifecycle_events (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 kind text NOT NULL CHECK(kind IN ('CANCEL','AGREEMENT','ARCHIVE','RESTORE','AUTO_RESTORE')),
 actor_id uuid REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 detail jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_lifecycle_events_order ON order_lifecycle_events(order_id,recorded_at,id);
CREATE TABLE order_lifecycle_commands (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 request_hash text NOT NULL,
 result jsonb NOT NULL
);
CREATE INDEX orders_storage ON orders(storage_state,created_at,id);
