ALTER TABLE orders ADD COLUMN settlement_version integer NOT NULL DEFAULT 0;
CREATE TABLE payment_entries (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 order_revision integer NOT NULL,
 number text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('RECEIPT','REFUND')),
 purpose text NOT NULL CHECK(purpose IN ('DEPOSIT','PAYMENT','REFUND')),
 receipt_id uuid REFERENCES payment_entries(id),
 corrects_id uuid REFERENCES payment_entries(id),
 state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','VOIDED')),
 currency text NOT NULL CHECK(currency IN ('LAK','THB','USD')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 lak_amount bigint NOT NULL CHECK(lak_amount>=0),
 exchange_rate text NOT NULL,
 rate_revision integer NOT NULL REFERENCES pricing_versions(revision),
 method text NOT NULL CHECK(method IN ('CASH','TRANSFER')),
 reference text NOT NULL,
 occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid NOT NULL REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 snapshot jsonb NOT NULL,
 voided_by uuid REFERENCES users(id),
 voided_at timestamptz,
 void_reason text
);
CREATE INDEX payment_entries_order ON payment_entries(order_id,recorded_at,id);
CREATE INDEX payment_entries_refund ON payment_entries(receipt_id,state);
CREATE TABLE shipments (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 order_revision integer NOT NULL,
 number text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'PREPARED' CHECK(state IN ('PREPARED','CONFIRMED','CANCELLED')),
 method text NOT NULL CHECK(method IN ('CUSTOMER_PICKUP','SHOP_DELIVERY')),
 recipient text NOT NULL,
 phone text NOT NULL,
 address text NOT NULL,
 carrier text NOT NULL,
 tracking text NOT NULL,
 notes text NOT NULL,
 snapshot jsonb NOT NULL,
 prepared_by uuid NOT NULL REFERENCES users(id),
 prepared_name text NOT NULL,
 prepared_at timestamptz NOT NULL DEFAULT now(),
 confirmed_by uuid REFERENCES users(id),
 confirmed_name text,
 confirmed_at timestamptz,
 confirmed_early boolean,
 due_at_confirmation bigint,
 cancelled_by uuid REFERENCES users(id),
 cancelled_at timestamptz,
 cancel_reason text
);
CREATE INDEX shipments_order ON shipments(order_id,state);
CREATE TABLE shipment_items (
 shipment_id uuid NOT NULL REFERENCES shipments(id),
 line_index integer NOT NULL,
 goods_key text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 PRIMARY KEY(shipment_id,line_index)
);
CREATE TABLE shipment_allocations (
 shipment_id uuid NOT NULL REFERENCES shipments(id),
 sheet_id uuid NOT NULL,
 sheet_version integer NOT NULL,
 line_index integer NOT NULL,
 goods_key text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0),
 PRIMARY KEY(shipment_id,sheet_id,sheet_version,line_index),
 FOREIGN KEY(sheet_id,sheet_version) REFERENCES production_sheet_versions(sheet_id,version)
);
CREATE INDEX shipment_allocations_source ON shipment_allocations(sheet_id,line_index);
CREATE TABLE settlement_commands (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 request_hash text NOT NULL,
 result jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
