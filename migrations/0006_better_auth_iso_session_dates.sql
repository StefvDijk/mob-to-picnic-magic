-- Better Auth's D1 adapter stores native Date fields as ISO text. Existing local fixtures
-- may use epoch milliseconds, so both forms are accepted until all environments converge.
DROP TRIGGER IF EXISTS approvals_validate;
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
      AND ((CASE WHEN typeof(s.expiresAt) IN ('integer','real') THEN CAST(s.expiresAt AS INTEGER)
        ELSE CAST(strftime('%s',s.expiresAt) AS INTEGER)*1000
          + CAST(substr(strftime('%f',s.expiresAt),4,3) AS INTEGER) END)) > NEW.approved_at
  ) THEN RAISE(ABORT,'session_not_approvable') END);
END;

DROP TRIGGER IF EXISTS execution_lines_validate_sending;
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
      AND sm.last_activity_at + 1209600000 > NEW.attempt_started_at
      AND ((CASE WHEN typeof(s.expiresAt) IN ('integer','real') THEN CAST(s.expiresAt AS INTEGER)
        ELSE CAST(strftime('%s',s.expiresAt) AS INTEGER)*1000
          + CAST(substr(strftime('%f',s.expiresAt),4,3) AS INTEGER) END)) > NEW.attempt_started_at
  ) THEN RAISE(ABORT,'execution_not_sendable') END);
END;
