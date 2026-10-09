-- Persist the shared interactive deadline across queue delivery/reloads.
-- NULL keeps historical imports readable without inventing a new paid attempt.
ALTER TABLE imports ADD COLUMN workflow_deadline_at INTEGER
  CHECK(workflow_deadline_at IS NULL OR (typeof(workflow_deadline_at)='integer' AND workflow_deadline_at>0));
CREATE TRIGGER imports_workflow_deadline_immutable BEFORE UPDATE OF workflow_deadline_at ON imports
WHEN NEW.workflow_deadline_at IS NOT OLD.workflow_deadline_at BEGIN
  SELECT RAISE(ABORT,'import_workflow_deadline_immutable');
END;
