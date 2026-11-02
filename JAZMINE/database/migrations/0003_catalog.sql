CREATE TABLE catalog_items (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('PRODUCT','FABRIC')),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 notes text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true,
 row_version integer NOT NULL DEFAULT 1,
 image_data text,
 created_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_kind_id ON catalog_items(kind,id);
