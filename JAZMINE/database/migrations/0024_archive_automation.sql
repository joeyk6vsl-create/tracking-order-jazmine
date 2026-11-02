CREATE TABLE archive_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean NOT NULL DEFAULT false,
 row_version integer NOT NULL DEFAULT 0,
 actor_id uuid REFERENCES users(id),
 actor_name text NOT NULL DEFAULT '',
 reason text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 scan_after uuid,
 last_run_at timestamptz
);
INSERT INTO archive_settings(id) VALUES(true);
CREATE TABLE archive_settings_commands(id uuid PRIMARY KEY,request_hash text NOT NULL,result jsonb NOT NULL);
CREATE TABLE order_archive_candidates (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 eligible_since timestamptz,
 activity_token text,
 policy_version integer NOT NULL
);
