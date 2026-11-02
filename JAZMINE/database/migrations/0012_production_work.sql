CREATE TABLE production_stage_work (
 sheet_id uuid NOT NULL,
 sheet_version integer NOT NULL,
 department text NOT NULL CHECK(department IN ('PRINTING','HEAT_TRANSFER','LASER','SIZE_SORTING','SEWING','QC_PACKING')),
 state text NOT NULL DEFAULT 'NOT_STARTED' CHECK(state IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
 row_version integer NOT NULL DEFAULT 0,
 started_at timestamptz,
 started_by uuid REFERENCES users(id),
 completed_at timestamptz,
 completed_by uuid REFERENCES users(id),
 PRIMARY KEY(sheet_id,sheet_version,department),
 FOREIGN KEY(sheet_id,sheet_version) REFERENCES production_sheet_versions(sheet_id,version),
 CHECK((state='NOT_STARTED' AND started_at IS NULL AND completed_at IS NULL) OR (state='IN_PROGRESS' AND started_at IS NOT NULL AND completed_at IS NULL) OR (state='COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE TABLE production_stage_events (
 id uuid PRIMARY KEY,
 sheet_id uuid NOT NULL,
 sheet_version integer NOT NULL,
 department text NOT NULL,
 from_state text NOT NULL,
 to_state text NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 at timestamptz NOT NULL DEFAULT now(),
 request_hash text NOT NULL,
 result jsonb NOT NULL,
 FOREIGN KEY(sheet_id,sheet_version,department) REFERENCES production_stage_work(sheet_id,sheet_version,department)
);
CREATE INDEX production_stage_events_history ON production_stage_events(sheet_id,sheet_version,at,id);
