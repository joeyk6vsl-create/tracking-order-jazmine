CREATE TABLE production_issues (
 id uuid PRIMARY KEY,
 sheet_id uuid NOT NULL,
 sheet_version integer NOT NULL,
 department text NOT NULL,
 category text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('CONTINUE','STOP')),
 description text NOT NULL,
 affected jsonb NOT NULL,
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','RESOLVED')),
 row_version integer NOT NULL DEFAULT 1,
 reported_by uuid NOT NULL REFERENCES users(id),
 reporter_name text NOT NULL,
 reported_at timestamptz NOT NULL DEFAULT now(),
 resolved_by uuid REFERENCES users(id),
 resolver_name text,
 resolved_at timestamptz,
 resolution_reason text,
 resolution_rows jsonb,
 request_hash text NOT NULL,
 FOREIGN KEY(sheet_id,sheet_version) REFERENCES production_sheet_versions(sheet_id,version)
);
CREATE INDEX production_issues_sheet ON production_issues(sheet_id,state);
CREATE TABLE production_losses (
 issue_id uuid NOT NULL REFERENCES production_issues(id),
 sheet_id uuid NOT NULL REFERENCES production_sheets(id),
 line_index integer NOT NULL,
 scrap_qty integer NOT NULL CHECK(scrap_qty>=0),
 release_qty integer NOT NULL CHECK(release_qty>=0),
 PRIMARY KEY(issue_id,line_index)
);
CREATE INDEX production_losses_sheet ON production_losses(sheet_id,line_index);
CREATE TABLE production_replacements (
 sheet_id uuid PRIMARY KEY REFERENCES production_sheets(id),
 issue_id uuid NOT NULL REFERENCES production_issues(id),
 created_by uuid NOT NULL REFERENCES users(id),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX production_replacements_issue ON production_replacements(issue_id);
CREATE TABLE production_exception_commands (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL REFERENCES users(id),
 request_hash text NOT NULL,
 result jsonb NOT NULL,
 at timestamptz NOT NULL DEFAULT now()
);
