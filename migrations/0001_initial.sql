-- Better Auth 1.7.7 D1 adapter schema (default model/field names).
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  UNIQUE(userId,id)
);
CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);
CREATE TABLE IF NOT EXISTS rateLimit (
  id TEXT PRIMARY KEY NOT NULL,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);

-- Application identity and account lifecycle are intentionally separate from auth user data.
CREATE TABLE app_accounts (
  id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','member')),
  status TEXT NOT NULL CHECK (status IN ('invited','active','blocked','deleting')),
  invitation_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE SET NULL,
  UNIQUE (id, status)
);
CREATE INDEX app_accounts_status_idx ON app_accounts(status, created_at);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','consumed','revoked','expired')),
  invited_by TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  consumed_by TEXT UNIQUE REFERENCES user(id) ON DELETE CASCADE,
  CHECK ((status = 'consumed') = (consumed_at IS NOT NULL)),
  CHECK ((status = 'consumed') = (consumed_by IS NOT NULL))
);
CREATE INDEX invitations_email_status_idx ON invitations(email, status, expires_at);
CREATE INDEX invitations_pending_expiry_idx ON invitations(status, expires_at);
CREATE UNIQUE INDEX invitations_one_pending_per_email ON invitations(email) WHERE status = 'pending';
CREATE TRIGGER invitations_reserve_capacity BEFORE INSERT ON invitations WHEN NEW.status = 'pending' BEGIN
  SELECT (CASE WHEN (SELECT COUNT(*) FROM app_accounts WHERE status IN ('active','blocked','deleting')) + (SELECT COUNT(*) FROM invitations WHERE status = 'pending' AND expires_at > NEW.created_at) >= 10 THEN RAISE(ABORT,'pilot_capacity_reached') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM app_accounts WHERE id = NEW.invited_by AND role = 'admin' AND status = 'active') THEN RAISE(ABORT,'admin_required') END);
END;
CREATE TRIGGER app_accounts_insert_policy BEFORE INSERT ON app_accounts BEGIN
  SELECT (CASE WHEN NEW.status = 'active' AND NOT (NEW.role = 'admin' AND NEW.invitation_id IS NULL AND NOT EXISTS (SELECT 1 FROM app_accounts)) THEN RAISE(ABORT,'account_requires_invitation') END);
  SELECT (CASE WHEN NEW.status = 'invited' AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.id = NEW.invitation_id AND i.status = 'pending' AND i.email = NEW.email COLLATE NOCASE AND i.expires_at > NEW.created_at) THEN RAISE(ABORT,'invitation_invalid') END);
END;
CREATE TRIGGER app_accounts_status_policy BEFORE UPDATE OF status ON app_accounts WHEN NEW.status = 'active' AND OLD.status = 'invited' BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM invitations i WHERE i.id = NEW.invitation_id AND i.status = 'consumed' AND i.consumed_by = NEW.id) THEN RAISE(ABORT,'invitation_not_consumed') END);
END;

-- A single insert is the invitation consume operation; trigger failures abort the statement.
CREATE TABLE invitation_consumptions (
  invitation_id TEXT PRIMARY KEY NOT NULL REFERENCES invitations(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  verified_email TEXT NOT NULL COLLATE NOCASE,
  consumed_at INTEGER NOT NULL
);
CREATE TRIGGER invitation_consumptions_validate BEFORE INSERT ON invitation_consumptions BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM invitations i JOIN user u ON u.id = NEW.owner_id
    WHERE i.id = NEW.invitation_id AND i.status = 'pending' AND i.expires_at > NEW.consumed_at
      AND i.email = NEW.verified_email COLLATE NOCASE AND u.email = NEW.verified_email COLLATE NOCASE AND u.emailVerified = 1
  ) THEN RAISE(ABORT,'invitation_invalid_or_consumed') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM app_accounts a WHERE a.id = NEW.owner_id AND a.status = 'invited' AND a.invitation_id = NEW.invitation_id) THEN RAISE(ABORT,'invited_account_missing') END);
END;
CREATE TRIGGER invitation_consumptions_apply AFTER INSERT ON invitation_consumptions BEGIN
  UPDATE invitations SET status = 'consumed', consumed_by = NEW.owner_id, consumed_at = NEW.consumed_at WHERE id = NEW.invitation_id;
  UPDATE app_accounts SET status = 'active', updated_at = NEW.consumed_at WHERE id = NEW.owner_id AND status = 'invited';
END;

CREATE TABLE session_metadata (
  session_id TEXT PRIMARY KEY NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  authenticated_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  last_verified_at INTEGER,
  revoked_at INTEGER,
  CHECK (last_activity_at >= authenticated_at),
  UNIQUE(owner_id,session_id),
  FOREIGN KEY (owner_id,session_id) REFERENCES session(userId,id) ON DELETE CASCADE
);
CREATE INDEX session_metadata_owner_idx ON session_metadata(owner_id, revoked_at, last_activity_at);

CREATE TABLE connections (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('verification_required','connected','disconnected','invalid')),
  generation INTEGER NOT NULL DEFAULT 1 CHECK (generation > 0),
  encrypted_resume_key TEXT,
  key_version TEXT,
  external_identity TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_id, id),
  CHECK ((status = 'connected') = (encrypted_resume_key IS NOT NULL)),
  CHECK ((encrypted_resume_key IS NULL) = (key_version IS NULL))
);
CREATE UNIQUE INDEX connections_one_active_owner ON connections(owner_id) WHERE status IN ('connected','verification_required');
CREATE UNIQUE INDEX connections_external_identity ON connections(external_identity) WHERE external_identity IS NOT NULL AND status = 'connected';
CREATE INDEX connections_owner_status_idx ON connections(owner_id, status, updated_at);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  status TEXT NOT NULL CHECK (status IN ('reserved','stored','deleting','deleted')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(owner_id,id)
);
CREATE INDEX uploads_owner_status_idx ON uploads(owner_id,status,created_at);
CREATE TABLE app_upload_usage (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes>=0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0),
  cap_bytes INTEGER NOT NULL DEFAULT 5368709120 CHECK(cap_bytes>=0),
  CHECK(used_bytes+reserved_bytes<=cap_bytes)
);
INSERT INTO app_upload_usage(singleton) VALUES(1);
CREATE TABLE user_upload_usage (
  owner_id TEXT PRIMARY KEY REFERENCES app_accounts(id) ON DELETE CASCADE,
  used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes>=0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes>=0),
  cap_bytes INTEGER NOT NULL DEFAULT 524288000 CHECK(cap_bytes>=0),
  CHECK(used_bytes+reserved_bytes<=cap_bytes)
);
CREATE TRIGGER uploads_reserve_quota BEFORE INSERT ON uploads BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM user_upload_usage WHERE owner_id=NEW.owner_id AND used_bytes+reserved_bytes+NEW.byte_size<=cap_bytes) THEN RAISE(ABORT,'user_upload_quota_exceeded') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM app_upload_usage WHERE singleton=1 AND used_bytes+reserved_bytes+NEW.byte_size<=cap_bytes) THEN RAISE(ABORT,'app_upload_quota_exceeded') END);
END;
CREATE TRIGGER uploads_count_reserved AFTER INSERT ON uploads BEGIN
  UPDATE user_upload_usage SET reserved_bytes=reserved_bytes+NEW.byte_size WHERE owner_id=NEW.owner_id;
  UPDATE app_upload_usage SET reserved_bytes=reserved_bytes+NEW.byte_size WHERE singleton=1;
END;
CREATE TRIGGER uploads_usage_transition AFTER UPDATE OF status ON uploads WHEN OLD.status!=NEW.status BEGIN
  UPDATE user_upload_usage SET
    reserved_bytes=reserved_bytes - (CASE WHEN OLD.status='reserved' AND NEW.status IN ('stored','deleted') THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes + (CASE WHEN OLD.status='reserved' AND NEW.status='stored' THEN OLD.byte_size WHEN OLD.status IN ('stored','deleting') AND NEW.status='deleted' THEN -OLD.byte_size ELSE 0 END)
    WHERE owner_id=OLD.owner_id;
  UPDATE app_upload_usage SET
    reserved_bytes=reserved_bytes - (CASE WHEN OLD.status='reserved' AND NEW.status IN ('stored','deleted') THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes + (CASE WHEN OLD.status='reserved' AND NEW.status='stored' THEN OLD.byte_size WHEN OLD.status IN ('stored','deleting') AND NEW.status='deleted' THEN -OLD.byte_size ELSE 0 END)
    WHERE singleton=1;
END;
CREATE TRIGGER uploads_immutable BEFORE UPDATE ON uploads WHEN NEW.id!=OLD.id OR NEW.owner_id!=OLD.owner_id OR NEW.object_key!=OLD.object_key OR NEW.media_type!=OLD.media_type OR NEW.byte_size!=OLD.byte_size BEGIN SELECT RAISE(ABORT,'upload_identity_immutable'); END;
CREATE TRIGGER uploads_status_machine BEFORE UPDATE OF status ON uploads WHEN NOT ((OLD.status='reserved' AND NEW.status IN ('stored','deleted')) OR (OLD.status='stored' AND NEW.status='deleting') OR (OLD.status='deleting' AND NEW.status='deleted')) BEGIN SELECT RAISE(ABORT,'upload_invalid_transition'); END;
CREATE TRIGGER uploads_usage_delete AFTER DELETE ON uploads BEGIN
  UPDATE user_upload_usage SET reserved_bytes=reserved_bytes - (CASE WHEN OLD.status='reserved' THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes - (CASE WHEN OLD.status IN ('stored','deleting') THEN OLD.byte_size ELSE 0 END) WHERE owner_id=OLD.owner_id;
  UPDATE app_upload_usage SET reserved_bytes=reserved_bytes - (CASE WHEN OLD.status='reserved' THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes - (CASE WHEN OLD.status IN ('stored','deleting') THEN OLD.byte_size ELSE 0 END) WHERE singleton=1;
END;

CREATE TABLE imports (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('text','url','upload')),
  source_url TEXT,
  source_text TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued','running','needs_review','failed','saved','expired')),
  error_code TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,id),
  CHECK ((source_kind = 'url' AND source_url IS NOT NULL) OR source_kind != 'url'),
  CHECK ((source_kind = 'text' AND source_text IS NOT NULL) OR source_kind != 'text')
);
CREATE INDEX imports_owner_updated_idx ON imports(owner_id,updated_at DESC);
CREATE INDEX imports_status_updated_idx ON imports(status,updated_at);
CREATE TABLE import_uploads (
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,import_id,upload_id),
  FOREIGN KEY(owner_id,import_id) REFERENCES imports(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,upload_id) REFERENCES uploads(owner_id,id) ON DELETE CASCADE
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  source_label TEXT,
  source_url TEXT,
  base_servings_num INTEGER CHECK (base_servings_num > 0),
  base_servings_den INTEGER NOT NULL DEFAULT 1 CHECK (base_servings_den > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  steps_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(steps_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(owner_id,id)
);
CREATE INDEX recipes_owner_updated_idx ON recipes(owner_id,updated_at DESC);
CREATE TABLE recipe_uploads (
  owner_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,recipe_id,upload_id),
  FOREIGN KEY(owner_id,recipe_id) REFERENCES recipes(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,upload_id) REFERENCES uploads(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE ingredients (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  section TEXT,
  original_text TEXT NOT NULL,
  normalized_name TEXT,
  quantity_kind TEXT NOT NULL CHECK(quantity_kind IN ('exact','range','global','unknown')),
  quantity_num INTEGER CHECK(quantity_num IS NULL OR (typeof(quantity_num)='integer' AND quantity_num >= 0)),
  quantity_den INTEGER NOT NULL DEFAULT 1 CHECK(typeof(quantity_den)='integer' AND quantity_den > 0),
  quantity_max_num INTEGER CHECK(quantity_max_num IS NULL OR (typeof(quantity_max_num)='integer' AND quantity_max_num >= 0)),
  unit TEXT CHECK(unit IS NULL OR unit IN ('g','kg','ml','l','piece')),
  source_origin TEXT CHECK(source_origin IN ('user','parser','ai','estimate')),
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json)),
  uncertainty_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(uncertainty_json)),
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id,recipe_id,id),
  UNIQUE(owner_id,recipe_id,ordinal),
  FOREIGN KEY(owner_id,recipe_id) REFERENCES recipes(owner_id,id) ON DELETE CASCADE,
  CHECK ((quantity_kind IN ('exact','range') AND quantity_num IS NOT NULL AND unit IS NOT NULL) OR quantity_kind IN ('global','unknown')),
  CHECK ((quantity_kind = 'range' AND quantity_max_num IS NOT NULL AND quantity_max_num >= quantity_num) OR (quantity_kind != 'range' AND quantity_max_num IS NULL)),
  CHECK ((quantity_kind IN ('global','unknown') AND quantity_num IS NULL) OR quantity_kind IN ('exact','range'))
);
CREATE INDEX ingredients_recipe_idx ON ingredients(owner_id,recipe_id,ordinal);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  recipe_version INTEGER NOT NULL CHECK(recipe_version > 0),
  connection_id TEXT NOT NULL,
  connection_generation INTEGER NOT NULL CHECK(connection_generation > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  servings_num INTEGER CHECK(servings_num > 0),
  servings_den INTEGER NOT NULL DEFAULT 1 CHECK(servings_den > 0),
  status TEXT NOT NULL CHECK(status IN ('draft','ready','approved','stale','expired')),
  checked_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,id),
  UNIQUE(owner_id,id,version),
  FOREIGN KEY(owner_id,recipe_id) REFERENCES recipes(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX proposals_owner_updated_idx ON proposals(owner_id,updated_at DESC);
CREATE TABLE proposal_needs (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  normalized_name TEXT,
  quantity_kind TEXT NOT NULL CHECK(quantity_kind IN ('exact','range','global','unknown')),
  quantity_num INTEGER CHECK(quantity_num IS NULL OR (typeof(quantity_num)='integer' AND quantity_num >= 0)),
  quantity_den INTEGER NOT NULL DEFAULT 1 CHECK(typeof(quantity_den)='integer' AND quantity_den > 0),
  quantity_max_num INTEGER CHECK(quantity_max_num IS NULL OR (typeof(quantity_max_num)='integer' AND quantity_max_num >= 0)),
  unit TEXT CHECK(unit IS NULL OR unit IN ('g','kg','ml','l','piece')),
  unresolved_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(unresolved_json)),
  UNIQUE(owner_id,proposal_id,id),
  UNIQUE(owner_id,proposal_id,ordinal),
  FOREIGN KEY(owner_id,proposal_id) REFERENCES proposals(owner_id,id) ON DELETE CASCADE,
  CHECK ((quantity_kind IN ('exact','range') AND quantity_num IS NOT NULL AND unit IS NOT NULL) OR quantity_kind IN ('global','unknown')),
  CHECK ((quantity_kind = 'range' AND quantity_max_num IS NOT NULL AND quantity_max_num >= quantity_num) OR (quantity_kind != 'range' AND quantity_max_num IS NULL))
);
CREATE TABLE proposal_need_sources (
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  need_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,proposal_id,need_id,ingredient_id),
  FOREIGN KEY(owner_id,proposal_id,need_id) REFERENCES proposal_needs(owner_id,proposal_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,recipe_id,ingredient_id) REFERENCES ingredients(owner_id,recipe_id,id) ON DELETE CASCADE
);
CREATE TABLE basket_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  need_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity_num INTEGER NOT NULL CHECK(typeof(quantity_num)='integer' AND quantity_num > 0),
  quantity_den INTEGER NOT NULL DEFAULT 1 CHECK(typeof(quantity_den)='integer' AND quantity_den > 0),
  unit TEXT NOT NULL CHECK(unit IN ('g','kg','ml','l','piece')),
  checked_cart_quantity_num INTEGER,
  checked_cart_quantity_den INTEGER NOT NULL DEFAULT 1 CHECK(typeof(checked_cart_quantity_den)='integer' AND checked_cart_quantity_den > 0),
  checked_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','stale','released')),
  UNIQUE(owner_id,proposal_id,id),
  FOREIGN KEY(owner_id,proposal_id,need_id) REFERENCES proposal_needs(owner_id,proposal_id,id) ON DELETE CASCADE
);
CREATE INDEX basket_allocations_owner_status_idx ON basket_allocations(owner_id,status,checked_at);
CREATE TABLE purchase_lines (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  need_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  product_snapshot_json TEXT NOT NULL CHECK(json_valid(product_snapshot_json)),
  pack_count INTEGER NOT NULL CHECK(typeof(pack_count)='integer' AND pack_count > 0),
  pack_quantity_num INTEGER NOT NULL CHECK(typeof(pack_quantity_num)='integer' AND pack_quantity_num > 0),
  pack_quantity_den INTEGER NOT NULL DEFAULT 1 CHECK(typeof(pack_quantity_den)='integer' AND pack_quantity_den > 0),
  unit TEXT NOT NULL CHECK(unit IN ('g','kg','ml','l','piece')),
  price_cents INTEGER CHECK(price_cents IS NULL OR (typeof(price_cents)='integer' AND price_cents >= 0)),
  currency TEXT NOT NULL DEFAULT 'EUR' CHECK(currency = 'EUR'),
  accepted_deviation_json TEXT CHECK(accepted_deviation_json IS NULL OR json_valid(accepted_deviation_json)),
  UNIQUE(owner_id,proposal_id,id),
  UNIQUE(owner_id,proposal_id,ordinal),
  FOREIGN KEY(owner_id,proposal_id,need_id) REFERENCES proposal_needs(owner_id,proposal_id,id) ON DELETE CASCADE
);
CREATE INDEX purchase_lines_proposal_idx ON purchase_lines(owner_id,proposal_id,ordinal);
CREATE TABLE purchase_line_allocations (
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  purchase_line_id TEXT NOT NULL,
  allocation_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,proposal_id,purchase_line_id,allocation_id),
  FOREIGN KEY(owner_id,proposal_id,purchase_line_id) REFERENCES purchase_lines(owner_id,proposal_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,proposal_id,allocation_id) REFERENCES basket_allocations(owner_id,proposal_id,id) ON DELETE CASCADE
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  proposal_version INTEGER NOT NULL,
  starting_session_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  total_price_cents INTEGER CHECK(total_price_cents IS NULL OR (typeof(total_price_cents)='integer' AND total_price_cents >= 0)),
  approved_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  invalidated_at INTEGER,
  UNIQUE(owner_id,id),
  UNIQUE(owner_id,id,proposal_id),
  UNIQUE(owner_id,proposal_id,proposal_version),
  FOREIGN KEY(owner_id,proposal_id) REFERENCES proposals(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX approvals_owner_time_idx ON approvals(owner_id,approved_at DESC);
CREATE TRIGGER approvals_validate BEFORE INSERT ON approvals BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM proposals p JOIN connections c ON c.id = p.connection_id AND c.owner_id = p.owner_id
    JOIN app_accounts a ON a.id = p.owner_id
    WHERE p.owner_id = NEW.owner_id AND p.id = NEW.proposal_id AND p.version = NEW.proposal_version
      AND p.status = 'ready' AND p.expires_at > NEW.approved_at
      AND c.status = 'connected' AND c.generation = p.connection_generation
      AND a.status = 'active'
  ) THEN RAISE(ABORT,'proposal_not_approvable') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM session_metadata sm JOIN session s ON s.id = sm.session_id
    WHERE sm.owner_id = NEW.owner_id AND sm.session_id = NEW.starting_session_id
      AND sm.revoked_at IS NULL AND sm.authenticated_at + 2592000000 > NEW.approved_at
      AND sm.last_activity_at + 1209600000 > NEW.approved_at
      AND s.expiresAt > NEW.approved_at
  ) THEN RAISE(ABORT,'session_not_approvable') END);
END;
CREATE TRIGGER approvals_snapshot_immutable BEFORE UPDATE ON approvals WHEN
  NEW.id != OLD.id OR NEW.owner_id != OLD.owner_id OR NEW.proposal_id != OLD.proposal_id OR NEW.proposal_version != OLD.proposal_version OR NEW.starting_session_id != OLD.starting_session_id OR NEW.snapshot_json != OLD.snapshot_json OR NEW.total_price_cents IS NOT OLD.total_price_cents OR NEW.approved_at != OLD.approved_at OR NEW.expires_at != OLD.expires_at
BEGIN SELECT RAISE(ABORT,'approval_snapshot_immutable'); END;
CREATE TABLE actions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  approval_id TEXT NOT NULL UNIQUE,
  proposal_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_generation INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','partial','succeeded','stopped','unknown','resolved')),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  resolved_at INTEGER,
  UNIQUE(owner_id,id),
  UNIQUE(owner_id,id,connection_id),
  UNIQUE(owner_id,id,proposal_id),
  FOREIGN KEY(owner_id,approval_id,proposal_id) REFERENCES approvals(owner_id,id,proposal_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,proposal_id) REFERENCES proposals(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX actions_one_active_connection ON actions(connection_id) WHERE state IN ('queued','running','unknown');
CREATE INDEX actions_owner_time_idx ON actions(owner_id,created_at DESC);
CREATE TABLE execution_lines (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  purchase_line_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  status TEXT NOT NULL CHECK(status IN ('unsent','sending','added','not_added','unknown','skipped')),
  attempt_id TEXT,
  attempt_started_at INTEGER,
  completed_at INTEGER,
  evidence_json TEXT CHECK(evidence_json IS NULL OR json_valid(evidence_json)),
  user_resolution TEXT CHECK(user_resolution IN ('confirmed_added','confirmed_not_added') OR user_resolution IS NULL),
  UNIQUE(owner_id,action_id,purchase_line_id),
  UNIQUE(owner_id,action_id,ordinal),
  UNIQUE(owner_id,id,action_id),
  FOREIGN KEY(owner_id,action_id,connection_id) REFERENCES actions(owner_id,id,connection_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,action_id,proposal_id) REFERENCES actions(owner_id,id,proposal_id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,proposal_id,purchase_line_id) REFERENCES purchase_lines(owner_id,proposal_id,id) ON DELETE CASCADE
);
CREATE INDEX execution_lines_action_status_idx ON execution_lines(owner_id,action_id,status,ordinal);
CREATE UNIQUE INDEX execution_lines_attempt_unique ON execution_lines(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE TABLE connection_execution_claims (
  connection_id TEXT PRIMARY KEY NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('active','unknown','released')),
  acquired_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,action_id),
  FOREIGN KEY(owner_id,action_id,connection_id) REFERENCES actions(owner_id,id,connection_id) ON DELETE CASCADE
);
CREATE TRIGGER connection_claim_release_guard BEFORE UPDATE OF state ON connection_execution_claims WHEN NEW.state = 'released' BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM execution_lines e WHERE e.owner_id = OLD.owner_id AND e.action_id = OLD.action_id AND e.status IN ('sending','unknown')) THEN RAISE(ABORT,'external_outcome_unresolved') END);
END;
CREATE TABLE outbox (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK(task_type IN ('import','add','delete_account','delete_upload')),
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','failed','unknown')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(task_type,task_id,version)
);
CREATE INDEX outbox_ready_idx ON outbox(status,available_at);

CREATE TABLE product_preferences (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_snapshot_json TEXT NOT NULL CHECK(json_valid(product_snapshot_json)),
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,product_id)
);
CREATE INDEX product_preferences_owner_updated_idx ON product_preferences(owner_id,updated_at DESC);

CREATE TABLE app_budget_months (
  month TEXT PRIMARY KEY NOT NULL CHECK(month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
  cap_cents INTEGER NOT NULL DEFAULT 1500 CHECK(typeof(cap_cents)='integer' AND cap_cents >= 0),
  reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK(typeof(reserved_cents)='integer' AND reserved_cents >= 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK(typeof(spent_cents)='integer' AND spent_cents >= 0),
  CHECK(reserved_cents + spent_cents <= cap_cents)
);
CREATE TABLE user_budget_months (
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  month TEXT NOT NULL REFERENCES app_budget_months(month) ON DELETE RESTRICT,
  cap_cents INTEGER NOT NULL DEFAULT 500 CHECK(typeof(cap_cents)='integer' AND cap_cents >= 0),
  reserved_cents INTEGER NOT NULL DEFAULT 0 CHECK(typeof(reserved_cents)='integer' AND reserved_cents >= 0),
  spent_cents INTEGER NOT NULL DEFAULT 0 CHECK(typeof(spent_cents)='integer' AND spent_cents >= 0),
  PRIMARY KEY(owner_id,month),
  CHECK(reserved_cents + spent_cents <= cap_cents)
);
CREATE TABLE budget_reservations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  month TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  cap_cents INTEGER NOT NULL CHECK(typeof(cap_cents)='integer' AND cap_cents > 0 AND cap_cents <= 5),
  actual_cents INTEGER CHECK(actual_cents IS NULL OR typeof(actual_cents)='integer'),
  state TEXT NOT NULL CHECK(state IN ('reserved','settled','unknown','released')),
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  UNIQUE(owner_id,id),
  FOREIGN KEY(owner_id,import_id) REFERENCES imports(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,month) REFERENCES user_budget_months(owner_id,month) ON DELETE CASCADE,
  CHECK(actual_cents IS NULL OR (actual_cents >= 0 AND actual_cents <= cap_cents)),
  CHECK((state = 'settled') = (actual_cents IS NOT NULL))
);
CREATE INDEX budget_reservations_owner_month_idx ON budget_reservations(owner_id,month,state);
CREATE TRIGGER budget_reservations_check BEFORE INSERT ON budget_reservations BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM app_budget_months a JOIN user_budget_months u ON u.month = a.month AND u.owner_id = NEW.owner_id WHERE a.month = NEW.month AND a.reserved_cents + a.spent_cents + NEW.cap_cents <= a.cap_cents AND u.reserved_cents + u.spent_cents + NEW.cap_cents <= u.cap_cents) THEN RAISE(ABORT,'budget_exceeded') END);
  SELECT (CASE WHEN (SELECT COUNT(*) FROM budget_reservations b WHERE b.owner_id=NEW.owner_id AND b.import_id=NEW.import_id) >= 2 THEN RAISE(ABORT,'import_attempt_limit') END);
  SELECT (CASE WHEN (SELECT COALESCE(SUM((CASE WHEN state='settled' THEN actual_cents WHEN state='released' THEN 0 ELSE cap_cents END)),0) FROM budget_reservations b WHERE b.owner_id=NEW.owner_id AND b.import_id=NEW.import_id) + NEW.cap_cents > 5 THEN RAISE(ABORT,'import_budget_exceeded') END);
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM budget_reservations b WHERE b.owner_id=NEW.owner_id AND b.import_id=NEW.import_id AND b.state='unknown') THEN RAISE(ABORT,'import_outcome_unknown') END);
END;
CREATE TRIGGER budget_reservations_add AFTER INSERT ON budget_reservations BEGIN
  UPDATE app_budget_months SET reserved_cents = reserved_cents + NEW.cap_cents WHERE month = NEW.month;
  UPDATE user_budget_months SET reserved_cents = reserved_cents + NEW.cap_cents WHERE owner_id = NEW.owner_id AND month = NEW.month;
END;
CREATE TRIGGER budget_reservations_settle BEFORE UPDATE OF state ON budget_reservations WHEN OLD.state IN ('reserved','unknown') AND NEW.state = 'settled' BEGIN
  SELECT (CASE WHEN NEW.actual_cents IS NULL OR NEW.actual_cents > OLD.cap_cents THEN RAISE(ABORT,'invalid_budget_settlement') END);
END;
CREATE TRIGGER budget_reservations_release BEFORE UPDATE OF state ON budget_reservations WHEN OLD.state = 'reserved' AND NEW.state = 'released' BEGIN
  UPDATE app_budget_months SET reserved_cents = reserved_cents - OLD.cap_cents WHERE month = OLD.month;
  UPDATE user_budget_months SET reserved_cents = reserved_cents - OLD.cap_cents WHERE owner_id = OLD.owner_id AND month = OLD.month;
END;
CREATE TRIGGER budget_reservations_book AFTER UPDATE OF state ON budget_reservations WHEN OLD.state IN ('reserved','unknown') AND NEW.state = 'settled' BEGIN
  UPDATE app_budget_months SET reserved_cents = reserved_cents - OLD.cap_cents, spent_cents = spent_cents + NEW.actual_cents WHERE month = OLD.month;
  UPDATE user_budget_months SET reserved_cents = reserved_cents - OLD.cap_cents, spent_cents = spent_cents + NEW.actual_cents WHERE owner_id = OLD.owner_id AND month = OLD.month;
END;
CREATE TRIGGER budget_reservations_immutable BEFORE UPDATE ON budget_reservations WHEN OLD.state IN ('settled','released') BEGIN
  SELECT RAISE(ABORT,'budget_reservation_final');
END;
CREATE TRIGGER budget_reservations_fields_immutable BEFORE UPDATE ON budget_reservations WHEN NEW.id != OLD.id OR NEW.owner_id != OLD.owner_id OR NEW.import_id != OLD.import_id OR NEW.month != OLD.month OR NEW.attempt_id != OLD.attempt_id OR NEW.cap_cents != OLD.cap_cents OR NEW.created_at != OLD.created_at BEGIN
  SELECT RAISE(ABORT,'budget_reservation_fields_immutable');
END;
CREATE TRIGGER budget_reservations_state_machine BEFORE UPDATE OF state ON budget_reservations WHEN NOT ((OLD.state = 'reserved' AND NEW.state IN ('settled','unknown','released')) OR (OLD.state = 'unknown' AND NEW.state = 'settled')) BEGIN
  SELECT RAISE(ABORT,'budget_reservation_invalid_transition');
END;

CREATE TABLE deletion_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('queued','running','complete','failed')),
  object_keys_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(object_keys_json)),
  cursor TEXT,
  requested_at INTEGER NOT NULL,
  completed_at INTEGER,
  delete_after INTEGER NOT NULL
  -- Deliberately no account FK: the cleanup record must survive hard account deletion.
);
CREATE INDEX deletion_tasks_status_idx ON deletion_tasks(status,delete_after);
CREATE TABLE feedback (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT REFERENCES app_accounts(id) ON DELETE CASCADE,
  sender_label TEXT,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  consented_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX feedback_expiry_idx ON feedback(expires_at,deleted_at);

CREATE TABLE email_send_usage (
  period TEXT PRIMARY KEY NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK(sent_count>=0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK(reserved_count>=0),
  cap_count INTEGER NOT NULL,
  CHECK(sent_count+reserved_count<=cap_count)
);
CREATE TABLE email_sends (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT REFERENCES app_accounts(id) ON DELETE CASCADE,
  address_hash TEXT NOT NULL,
  daily_period TEXT NOT NULL REFERENCES email_send_usage(period) ON DELETE RESTRICT,
  monthly_period TEXT NOT NULL REFERENCES email_send_usage(period) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('reserved','sent','unknown','failed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX email_sends_address_time_idx ON email_sends(address_hash,created_at DESC);
CREATE TRIGGER email_sends_reserve BEFORE INSERT ON email_sends BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM email_send_usage WHERE period=NEW.daily_period) THEN RAISE(ABORT,'email_daily_quota_missing') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM email_send_usage WHERE period=NEW.monthly_period) THEN RAISE(ABORT,'email_monthly_quota_missing') END);
  SELECT (CASE WHEN (SELECT sent_count+reserved_count FROM email_send_usage WHERE period=NEW.daily_period) >= (SELECT cap_count FROM email_send_usage WHERE period=NEW.daily_period) THEN RAISE(ABORT,'email_daily_quota_exceeded') END);
  SELECT (CASE WHEN (SELECT sent_count+reserved_count FROM email_send_usage WHERE period=NEW.monthly_period) >= (SELECT cap_count FROM email_send_usage WHERE period=NEW.monthly_period) THEN RAISE(ABORT,'email_monthly_quota_exceeded') END);
END;
CREATE TRIGGER email_sends_count AFTER INSERT ON email_sends BEGIN
  UPDATE email_send_usage SET reserved_count=reserved_count+1 WHERE period IN (NEW.daily_period,NEW.monthly_period);
END;
CREATE TRIGGER email_sends_settle BEFORE UPDATE OF status ON email_sends WHEN OLD.status='reserved' AND NEW.status IN ('sent','unknown','failed') BEGIN
  UPDATE email_send_usage SET reserved_count=reserved_count-1,
    sent_count=sent_count + (CASE WHEN NEW.status IN ('sent','unknown') THEN 1 ELSE 0 END)
    WHERE period IN (OLD.daily_period,OLD.monthly_period);
END;
CREATE TRIGGER email_sends_immutable BEFORE UPDATE ON email_sends WHEN NEW.id!=OLD.id OR NEW.address_hash!=OLD.address_hash OR NEW.daily_period!=OLD.daily_period OR NEW.monthly_period!=OLD.monthly_period OR NEW.created_at!=OLD.created_at BEGIN SELECT RAISE(ABORT,'email_send_identity_immutable'); END;
CREATE TRIGGER email_sends_status_machine BEFORE UPDATE OF status ON email_sends WHEN NOT (OLD.status='reserved' AND NEW.status IN ('sent','unknown','failed')) BEGIN SELECT RAISE(ABORT,'email_send_invalid_transition'); END;

CREATE TRIGGER actions_validate BEFORE INSERT ON actions BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM approvals ap JOIN proposals p ON p.owner_id = ap.owner_id AND p.id = ap.proposal_id
    JOIN connections c ON c.owner_id = p.owner_id AND c.id = p.connection_id
    JOIN app_accounts a ON a.id = p.owner_id
    WHERE ap.owner_id = NEW.owner_id AND ap.id = NEW.approval_id AND ap.proposal_id = NEW.proposal_id
      AND ap.invalidated_at IS NULL AND ap.expires_at > NEW.created_at
      AND ap.proposal_version = p.version AND p.status = 'ready'
      AND c.id = NEW.connection_id AND c.status = 'connected'
      AND c.generation = NEW.connection_generation AND p.connection_generation = c.generation
      AND a.status = 'active'
  ) THEN RAISE(ABORT,'approval_not_executable') END);
END;
CREATE TRIGGER actions_identity_immutable BEFORE UPDATE ON actions WHEN
  NEW.id != OLD.id OR NEW.owner_id != OLD.owner_id OR NEW.approval_id != OLD.approval_id OR NEW.proposal_id != OLD.proposal_id OR NEW.connection_id != OLD.connection_id OR NEW.connection_generation != OLD.connection_generation OR NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT,'action_identity_immutable'); END;
CREATE TRIGGER actions_terminal_guard BEFORE UPDATE OF state ON actions WHEN NEW.state IN ('succeeded','partial','stopped','resolved') BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM execution_lines e WHERE e.owner_id=OLD.owner_id AND e.action_id=OLD.id AND e.status IN ('sending','unknown')) THEN RAISE(ABORT,'execution_lines_unresolved') END);
  SELECT (CASE WHEN NEW.state IN ('succeeded','resolved') AND EXISTS (SELECT 1 FROM execution_lines e WHERE e.owner_id=OLD.owner_id AND e.action_id=OLD.id AND e.status='unsent') THEN RAISE(ABORT,'execution_lines_unresolved') END);
END;
CREATE TRIGGER execution_lines_validate_sending BEFORE UPDATE OF status ON execution_lines WHEN NEW.status = 'sending' BEGIN
  SELECT (CASE WHEN OLD.status != 'unsent' OR NOT EXISTS (
    SELECT 1 FROM actions ac JOIN approvals ap ON ap.owner_id = ac.owner_id AND ap.id = ac.approval_id
    JOIN connections c ON c.owner_id = ac.owner_id AND c.id = ac.connection_id
    JOIN app_accounts a ON a.id = ac.owner_id
    JOIN session_metadata sm ON sm.owner_id = ap.owner_id AND sm.session_id = ap.starting_session_id
    JOIN session s ON s.id = sm.session_id AND s.userId = sm.owner_id
    WHERE ac.owner_id = NEW.owner_id AND ac.id = NEW.action_id AND ac.state IN ('queued','running')
      AND ap.invalidated_at IS NULL AND ap.expires_at > NEW.attempt_started_at
      AND c.status = 'connected' AND c.generation = ac.connection_generation AND a.status = 'active'
      AND sm.revoked_at IS NULL AND sm.authenticated_at + 2592000000 > NEW.attempt_started_at
      AND sm.last_activity_at + 1209600000 > NEW.attempt_started_at AND s.expiresAt > NEW.attempt_started_at
  ) THEN RAISE(ABORT,'execution_not_sendable') END);
END;
