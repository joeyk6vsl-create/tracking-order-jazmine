CREATE TABLE production_issue_resolutions (
 issue_id uuid NOT NULL REFERENCES production_issues(id),
 issue_version integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('INITIAL','CORRECTION')),
 rows jsonb NOT NULL,
 actor_id uuid REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 command_id uuid,
 replacement_changes jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(issue_id,issue_version)
);
INSERT INTO production_issue_resolutions(issue_id,issue_version,kind,rows,actor_id,actor_name,reason,recorded_at)
 SELECT id,row_version,'INITIAL',COALESCE(resolution_rows,'[]'::jsonb),resolved_by,COALESCE(resolver_name,'Unknown'),COALESCE(resolution_reason,''),COALESCE(resolved_at,reported_at) FROM production_issues WHERE state='RESOLVED';
CREATE TABLE production_loss_adjustments (
 issue_id uuid NOT NULL,
 issue_version integer NOT NULL,
 sheet_id uuid NOT NULL REFERENCES production_sheets(id),
 line_index integer NOT NULL,
 scrap_delta integer NOT NULL,
 release_delta integer NOT NULL,
 PRIMARY KEY(issue_id,issue_version,line_index),
 FOREIGN KEY(issue_id,issue_version) REFERENCES production_issue_resolutions(issue_id,issue_version)
);
CREATE INDEX production_loss_adjustments_sheet ON production_loss_adjustments(sheet_id,line_index);
CREATE VIEW production_current_losses AS
 SELECT issue_id,sheet_id,line_index,sum(scrap_qty)::int AS scrap_qty,sum(release_qty)::int AS release_qty
 FROM (SELECT issue_id,sheet_id,line_index,scrap_qty,release_qty FROM production_losses UNION ALL SELECT issue_id,sheet_id,line_index,scrap_delta,release_delta FROM production_loss_adjustments) entries
 GROUP BY issue_id,sheet_id,line_index;
