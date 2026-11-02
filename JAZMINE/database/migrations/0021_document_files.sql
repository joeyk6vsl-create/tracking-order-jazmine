CREATE TABLE document_jobs (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('QUOTATION','INVOICE','RECEIPT','PRODUCTION')),
 source_id uuid NOT NULL,
 source_version integer NOT NULL CHECK(source_version>0),
 number text NOT NULL,
 payload jsonb NOT NULL,
 template_version text NOT NULL DEFAULT 'archive-v1',
 render_language text NOT NULL DEFAULT 'lo-en',
 render_origin text,
 queued_by uuid NOT NULL REFERENCES users(id),
 state text NOT NULL DEFAULT 'RENDER_PENDING' CHECK(state IN ('RENDER_PENDING','PREPARING','FAILED','ISSUED')),
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 5,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 rendered_at timestamptz,
 UNIQUE(kind,source_id,source_version)
);
CREATE INDEX document_jobs_pending ON document_jobs(state,available_at,created_at);
CREATE TABLE document_files (
 id uuid PRIMARY KEY,
 job_id uuid NOT NULL UNIQUE REFERENCES document_jobs(id),
 file_data bytea NOT NULL,
 sha256 text NOT NULL CHECK(length(sha256)=64),
 byte_length integer NOT NULL CHECK(byte_length>0),
 page_count integer NOT NULL CHECK(page_count>0),
 rendered_by text NOT NULL DEFAULT 'system-worker'
);
CREATE TABLE document_retry_commands (
 id uuid PRIMARY KEY,
 request_hash text NOT NULL,
 job_id uuid NOT NULL REFERENCES document_jobs(id)
);
