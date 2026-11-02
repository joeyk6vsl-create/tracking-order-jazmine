CREATE TABLE payment_qr_settings (
 currency text PRIMARY KEY CHECK(currency IN ('LAK','THB')),
 version integer NOT NULL DEFAULT 0 CHECK(version>=0),
 enabled boolean NOT NULL DEFAULT false
);
INSERT INTO payment_qr_settings(currency) VALUES('LAK'),('THB');
CREATE TABLE payment_qr_versions (
 id uuid PRIMARY KEY,
 currency text NOT NULL REFERENCES payment_qr_settings(currency),
 version integer NOT NULL CHECK(version>0),
 enabled boolean NOT NULL,
 bank_name text NOT NULL,
 receiver_name text NOT NULL,
 account_reference text NOT NULL,
 filename text NOT NULL,
 original_mime text NOT NULL,
 original_data bytea NOT NULL,
 print_data bytea NOT NULL,
 print_sha256 text NOT NULL,
 payload_sha256 text NOT NULL,
 verified_in_bank_app boolean NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id),
 actor_name text NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(currency,version)
);
CREATE TABLE payment_qr_commands (
 id uuid PRIMARY KEY,
 request_hash text NOT NULL,
 result jsonb NOT NULL
);
