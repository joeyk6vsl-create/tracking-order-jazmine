CREATE TABLE graphic_assets (
 id uuid PRIMARY KEY,
 scope_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('NECK_LABEL','NECK_TAPE','MOCKUP')),
 revision integer NOT NULL,
 origin_draft_id uuid NOT NULL REFERENCES order_drafts(id),
 draft_version integer NOT NULL,
 filename text NOT NULL,
 mime text NOT NULL,
 file_data bytea NOT NULL,
 byte_size integer NOT NULL,
 sha256 text NOT NULL,
 request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_by uuid NOT NULL REFERENCES users(id),
 reviewed_by uuid REFERENCES users(id),
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 UNIQUE(scope_key,kind,revision)
);
CREATE INDEX graphic_assets_origin ON graphic_assets(origin_draft_id);
