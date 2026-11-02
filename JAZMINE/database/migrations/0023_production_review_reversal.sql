-- Add reversal history without changing existing keys or deleting records.
ALTER TABLE production_revision_carries ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE production_revision_carries ADD COLUMN source_state text CHECK(source_state IN ('DRAFT','READY'));
ALTER TABLE production_revision_carries ADD COLUMN source_guard text;
CREATE TABLE production_revision_carry_history (LIKE production_revision_carries INCLUDING DEFAULTS);
ALTER TABLE production_revision_carry_history ADD PRIMARY KEY(source_sheet_id,review_id);
ALTER TABLE production_revision_carry_history ADD FOREIGN KEY(source_sheet_id) REFERENCES production_sheets(id);
ALTER TABLE production_revision_carry_history ADD FOREIGN KEY(review_id) REFERENCES production_revision_reviews(id);
ALTER TABLE production_revision_carry_history ADD FOREIGN KEY(target_sheet_id) REFERENCES production_sheets(id);
CREATE INDEX production_revision_carry_history_review ON production_revision_carry_history(review_id);
CREATE UNIQUE INDEX production_revision_carry_history_target ON production_revision_carry_history(target_sheet_id);
CREATE INDEX production_revision_carries_review ON production_revision_carries(review_id);
CREATE VIEW production_revision_carry_records AS
 SELECT * FROM production_revision_carries
 UNION ALL
 SELECT h.* FROM production_revision_carry_history h WHERE NOT EXISTS (
  SELECT 1 FROM production_revision_carries c WHERE c.source_sheet_id=h.source_sheet_id AND c.review_id=h.review_id
 );
CREATE TABLE production_revision_reversals (
 id uuid PRIMARY KEY,
 review_id uuid NOT NULL UNIQUE REFERENCES production_revision_reviews(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 request_hash text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
