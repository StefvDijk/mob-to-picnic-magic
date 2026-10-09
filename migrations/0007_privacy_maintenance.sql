-- A deletion worker may be interrupted after an R2 call. Lease tokens fence stale
-- workers while allowing another scheduled run to resume an expired claim.
ALTER TABLE deletion_tasks ADD COLUMN lease_token TEXT;
ALTER TABLE deletion_tasks ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE deletion_tasks ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0);
ALTER TABLE deletion_tasks ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deletion_tasks ADD COLUMN last_error_code TEXT;
ALTER TABLE deletion_tasks ADD COLUMN r2_verified_at INTEGER;
ALTER TABLE deletion_tasks ADD COLUMN tombstone_expires_at INTEGER;
CREATE INDEX deletion_tasks_retry_idx ON deletion_tasks(status,next_attempt_at,lease_expires_at);

-- The first statement of the purge batch inserts this assertion row. A stale
-- lease aborts the whole D1 transaction before any owner data can be deleted.
CREATE TABLE account_purge_guards (
  owner_id TEXT PRIMARY KEY NOT NULL,
  lease_token TEXT NOT NULL,
  checked_at INTEGER NOT NULL
);
CREATE TRIGGER account_purge_guards_validate BEFORE INSERT ON account_purge_guards BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM deletion_tasks d JOIN app_accounts a ON a.id=d.owner_id
    WHERE d.owner_id=NEW.owner_id AND d.status='running' AND d.lease_token=NEW.lease_token
      AND d.lease_expires_at>NEW.checked_at AND d.r2_verified_at IS NOT NULL
      AND a.status='deleting'
      AND NOT EXISTS(SELECT 1 FROM uploads u WHERE u.owner_id=d.owner_id AND u.status!='deleted')
  ) THEN RAISE(ABORT,'account_purge_lease_lost') END);
END;

-- A stale reserved upload needs a durable claim before R2 deletion. Record its
-- origin so quota triggers distinguish it from a stored object being deleted.
ALTER TABLE uploads ADD COLUMN deleting_from_reserved INTEGER NOT NULL DEFAULT 0
  CHECK(deleting_from_reserved IN (0,1));
DROP TRIGGER uploads_status_machine;
CREATE TRIGGER uploads_status_machine BEFORE UPDATE OF status ON uploads WHEN NOT (
  (OLD.status='reserved' AND NEW.status='stored' AND NEW.deleting_from_reserved=0) OR
  (OLD.status='reserved' AND NEW.status='deleted' AND NEW.deleting_from_reserved=0) OR
  (OLD.status='reserved' AND NEW.status='deleting' AND NEW.deleting_from_reserved=1) OR
  (OLD.status='stored' AND NEW.status='deleting' AND NEW.deleting_from_reserved=0) OR
  (OLD.status='deleting' AND NEW.status='deleted' AND NEW.deleting_from_reserved=OLD.deleting_from_reserved)
) BEGIN SELECT RAISE(ABORT,'upload_invalid_transition'); END;
CREATE TRIGGER uploads_cleanup_origin_guard BEFORE UPDATE OF deleting_from_reserved ON uploads
WHEN NEW.deleting_from_reserved!=OLD.deleting_from_reserved AND NOT (
  OLD.status='reserved' AND NEW.status='deleting' AND OLD.deleting_from_reserved=0 AND NEW.deleting_from_reserved=1
) BEGIN SELECT RAISE(ABORT,'upload_cleanup_origin_immutable'); END;
DROP TRIGGER uploads_usage_transition;
CREATE TRIGGER uploads_usage_transition AFTER UPDATE OF status ON uploads WHEN OLD.status!=NEW.status BEGIN
  UPDATE user_upload_usage SET
    reserved_bytes=reserved_bytes-(CASE WHEN (OLD.status='reserved' AND NEW.status IN ('stored','deleted')) OR
      (OLD.status='deleting' AND OLD.deleting_from_reserved=1 AND NEW.status='deleted') THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes+(CASE WHEN OLD.status='reserved' AND NEW.status='stored' THEN OLD.byte_size
      WHEN OLD.status IN ('stored','deleting') AND NEW.status='deleted' AND OLD.deleting_from_reserved=0 THEN -OLD.byte_size ELSE 0 END)
    WHERE owner_id=OLD.owner_id;
  UPDATE app_upload_usage SET
    reserved_bytes=reserved_bytes-(CASE WHEN (OLD.status='reserved' AND NEW.status IN ('stored','deleted')) OR
      (OLD.status='deleting' AND OLD.deleting_from_reserved=1 AND NEW.status='deleted') THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes+(CASE WHEN OLD.status='reserved' AND NEW.status='stored' THEN OLD.byte_size
      WHEN OLD.status IN ('stored','deleting') AND NEW.status='deleted' AND OLD.deleting_from_reserved=0 THEN -OLD.byte_size ELSE 0 END)
    WHERE singleton=1;
END;
DROP TRIGGER uploads_usage_delete;
CREATE TRIGGER uploads_usage_delete AFTER DELETE ON uploads BEGIN
  UPDATE user_upload_usage SET reserved_bytes=reserved_bytes-(CASE WHEN OLD.status='reserved' OR
    (OLD.status='deleting' AND OLD.deleting_from_reserved=1) THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes-(CASE WHEN OLD.status='stored' OR (OLD.status='deleting' AND OLD.deleting_from_reserved=0) THEN OLD.byte_size ELSE 0 END)
    WHERE owner_id=OLD.owner_id;
  UPDATE app_upload_usage SET reserved_bytes=reserved_bytes-(CASE WHEN OLD.status='reserved' OR
    (OLD.status='deleting' AND OLD.deleting_from_reserved=1) THEN OLD.byte_size ELSE 0 END),
    used_bytes=used_bytes-(CASE WHEN OLD.status='stored' OR (OLD.status='deleting' AND OLD.deleting_from_reserved=0) THEN OLD.byte_size ELSE 0 END)
    WHERE singleton=1;
END;

-- This applies to direct SQL as well as repository helpers. The account status
-- and upload transition are checked by SQLite in the same write.
CREATE TRIGGER uploads_active_account_insert BEFORE INSERT ON uploads BEGIN
  SELECT (CASE WHEN NEW.object_key GLOB 'private/account-tombstones/*'
    THEN RAISE(ABORT,'reserved_object_key') END);
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM app_accounts WHERE id=NEW.owner_id AND status='active'
  ) THEN RAISE(ABORT,'upload_account_inactive') END);
END;
CREATE TRIGGER uploads_active_account_store BEFORE UPDATE OF status ON uploads
WHEN NEW.status='stored' BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM app_accounts WHERE id=NEW.owner_id AND status='active'
  ) THEN RAISE(ABORT,'upload_account_inactive') END);
END;

CREATE INDEX imports_draft_retention_idx ON imports(status,updated_at);
CREATE INDEX actions_retention_idx ON actions(state,created_at);
CREATE INDEX ingredients_retired_retention_idx ON ingredients(retired_at) WHERE retired_at IS NOT NULL;

-- Expiring an import cascades to its budget attempts. Unknown/reserved usage is
-- conservatively charged to the app and user totals instead of releasing room
-- for a duplicate paid call. Settled attempts are already in spent_cents.
CREATE TRIGGER budget_reservations_retention_delete BEFORE DELETE ON budget_reservations
WHEN OLD.state IN ('reserved','unknown') BEGIN
  UPDATE app_budget_months SET reserved_cents=reserved_cents-OLD.cap_cents,
    spent_cents=spent_cents+OLD.cap_cents WHERE month=OLD.month;
  UPDATE user_budget_months SET reserved_cents=reserved_cents-OLD.cap_cents,
    spent_cents=spent_cents+OLD.cap_cents WHERE owner_id=OLD.owner_id AND month=OLD.month;
END;

CREATE TRIGGER feedback_max_retention_insert BEFORE INSERT ON feedback
WHEN NEW.expires_at > NEW.consented_at + 7776000000 OR NEW.expires_at <= NEW.consented_at BEGIN
  SELECT RAISE(ABORT,'feedback_retention_invalid');
END;
CREATE TRIGGER feedback_max_retention_update BEFORE UPDATE OF expires_at,consented_at ON feedback
WHEN NEW.expires_at > NEW.consented_at + 7776000000 OR NEW.expires_at <= NEW.consented_at BEGIN
  SELECT RAISE(ABORT,'feedback_retention_invalid');
END;
