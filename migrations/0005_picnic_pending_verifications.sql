-- One live provider login per owner. The unique owner key prevents concurrent
-- credential submissions from racing and replacing one another.
CREATE TABLE picnic_pending_verifications (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL UNIQUE,
  connection_id TEXT NOT NULL,
  expected_generation INTEGER NOT NULL CHECK(expected_generation >= 0),
  starting_session_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('authenticating','verification_required','verifying')),
  encrypted_auth_key TEXT,
  key_version TEXT,
  external_identity TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  CHECK((encrypted_auth_key IS NULL) = (key_version IS NULL)),
  FOREIGN KEY(owner_id, starting_session_id) REFERENCES session_metadata(owner_id,session_id) ON DELETE CASCADE
);
CREATE INDEX picnic_pending_expiry_idx ON picnic_pending_verifications(expires_at);

CREATE TABLE picnic_connect_limits (
  owner_id TEXT PRIMARY KEY NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  window_started_at INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL CHECK(attempt_count BETWEEN 1 AND 5)
);
