-- Durable result and fenced worker lease for import jobs. Existing drafts retain
-- their source/status and simply have no extracted result until processed.
ALTER TABLE imports ADD COLUMN source_title TEXT;
ALTER TABLE imports ADD COLUMN source_label TEXT;
ALTER TABLE imports ADD COLUMN result_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(result_json));
ALTER TABLE imports ADD COLUMN uncertainties_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(uncertainties_json));
ALTER TABLE imports ADD COLUMN work_token TEXT;
ALTER TABLE imports ADD COLUMN work_expires_at INTEGER;
ALTER TABLE imports ADD COLUMN work_version INTEGER NOT NULL DEFAULT 1 CHECK(work_version > 0);

CREATE INDEX imports_work_lease_idx ON imports(status,work_expires_at,updated_at);

ALTER TABLE outbox ADD COLUMN dispatch_token TEXT;
