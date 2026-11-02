CREATE TABLE catalog_item_sizes (
 item_id uuid NOT NULL REFERENCES catalog_items(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 20),
 position integer NOT NULL,
 PRIMARY KEY(item_id,name)
);
CREATE TABLE catalog_item_fabrics (
 item_id uuid NOT NULL REFERENCES catalog_items(id),
 fabric_id uuid NOT NULL REFERENCES catalog_items(id),
 PRIMARY KEY(item_id,fabric_id),
 CHECK(item_id<>fabric_id)
);
