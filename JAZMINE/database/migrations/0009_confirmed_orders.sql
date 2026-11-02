ALTER TABLE catalog_items ADD COLUMN availability text NOT NULL DEFAULT 'UNKNOWN' CHECK(availability IN ('UNKNOWN','AVAILABLE','LOW_STOCK','OUT_OF_STOCK'));
CREATE TABLE business_counters (
 family text NOT NULL,
 business_date date NOT NULL,
 last_value integer NOT NULL,
 PRIMARY KEY(family,business_date)
);
CREATE TABLE orders (
 id uuid PRIMARY KEY,
 draft_id uuid NOT NULL UNIQUE REFERENCES order_drafts(id),
 order_number text NOT NULL UNIQUE,
 invoice_number text NOT NULL UNIQUE,
 latest_revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_revisions (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 revision integer NOT NULL,
 draft_version integer NOT NULL,
 pricing_revision integer NOT NULL REFERENCES pricing_versions(revision),
 snapshot jsonb NOT NULL,
 confirmed_by uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,revision),
 UNIQUE(order_id,draft_version)
);
CREATE TABLE order_revision_assets (
 revision_id uuid NOT NULL REFERENCES order_revisions(id),
 asset_id uuid NOT NULL REFERENCES graphic_assets(id),
 PRIMARY KEY(revision_id,asset_id)
);
CREATE TABLE production_preparations (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 required_revision integer NOT NULL,
 status text NOT NULL DEFAULT 'WAITING_FOR_PRODUCTION_SHEET'
);
