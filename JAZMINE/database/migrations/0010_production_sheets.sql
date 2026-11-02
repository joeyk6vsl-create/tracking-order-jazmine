CREATE TABLE production_sheets (
 id uuid PRIMARY KEY,
 order_id uuid NOT NULL REFERENCES orders(id),
 order_revision integer NOT NULL,
 sheet_number text UNIQUE,
 state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','READY','CANCELLED')),
 row_version integer NOT NULL DEFAULT 1,
 issued_version integer NOT NULL DEFAULT 0,
 ready_input_version integer,
 allocations jsonb NOT NULL,
 notes text NOT NULL,
 request_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX production_sheets_order ON production_sheets(order_id);
CREATE TABLE production_part_files (
 id uuid PRIMARY KEY,
 sheet_id uuid NOT NULL REFERENCES production_sheets(id),
 part text NOT NULL,
 revision integer NOT NULL,
 filename text NOT NULL,
 mime text NOT NULL,
 file_data bytea NOT NULL,
 sha256 text NOT NULL,
 request_hash text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sheet_id,part,revision)
);
CREATE TABLE production_sheet_versions (
 id uuid PRIMARY KEY,
 sheet_id uuid NOT NULL REFERENCES production_sheets(id),
 version integer NOT NULL,
 snapshot jsonb NOT NULL,
 issued_by uuid NOT NULL REFERENCES users(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sheet_id,version)
);
CREATE TABLE production_sheet_version_files (
 version_id uuid NOT NULL REFERENCES production_sheet_versions(id),
 file_id uuid NOT NULL REFERENCES production_part_files(id),
 PRIMARY KEY(version_id,file_id)
);
