CREATE TABLE production_revision_reviews (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 order_revision integer NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 request_hash text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE production_revision_carries (
 source_sheet_id uuid PRIMARY KEY REFERENCES production_sheets(id),
 review_id uuid NOT NULL REFERENCES production_revision_reviews(id),
 source_version integer NOT NULL,
 target_sheet_id uuid UNIQUE REFERENCES production_sheets(id),
 target_fingerprint text,
 mappings jsonb NOT NULL,
 quantities jsonb NOT NULL,
 inherited_stages jsonb NOT NULL
);
CREATE INDEX production_revision_reviews_order ON production_revision_reviews(order_id,created_at,id);
ALTER TABLE production_part_files ADD COLUMN source_file_id uuid REFERENCES production_part_files(id);
CREATE INDEX production_part_files_source ON production_part_files(source_file_id);
