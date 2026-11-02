ALTER TABLE catalog_items DROP CONSTRAINT catalog_items_kind_check;
ALTER TABLE catalog_items ADD CONSTRAINT catalog_items_kind_check CHECK(kind IN ('PRODUCT','FABRIC','COMPONENT'));
ALTER TABLE catalog_items ADD COLUMN section text NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE catalog_items ADD COLUMN display_group integer NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN display_order integer NOT NULL DEFAULT 0;
ALTER TABLE catalog_items ADD COLUMN source_key text UNIQUE;
