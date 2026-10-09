-- The user-approved MVP sends only the exact current proposal while additions are enabled.
CREATE TRIGGER approvals_mvp_gate BEFORE INSERT ON approvals BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM proposals p
    JOIN recipes r ON r.owner_id=p.owner_id AND r.id=p.recipe_id
    JOIN app_switches st ON st.singleton=1
    WHERE p.owner_id=NEW.owner_id AND p.id=NEW.proposal_id
      AND r.deleted_at IS NULL AND r.version=p.recipe_version AND st.add_enabled=1
  ) THEN RAISE(ABORT,'proposal_changed_or_add_disabled') END);
END;
CREATE TRIGGER execution_lines_mvp_gate BEFORE UPDATE OF status ON execution_lines
WHEN NEW.status='sending' BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM actions ac
    JOIN proposals p ON p.owner_id=ac.owner_id AND p.id=ac.proposal_id
    JOIN recipes r ON r.owner_id=p.owner_id AND r.id=p.recipe_id
    JOIN app_switches st ON st.singleton=1
    WHERE ac.owner_id=NEW.owner_id AND ac.id=NEW.action_id
      AND r.deleted_at IS NULL AND r.version=p.recipe_version
      AND p.expires_at>NEW.attempt_started_at AND st.add_enabled=1
  ) THEN RAISE(ABORT,'proposal_changed_or_add_disabled') END);
END;
