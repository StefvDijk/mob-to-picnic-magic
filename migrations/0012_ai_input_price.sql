-- Preserve existing request snapshots while accepting the conservative input rate.
CREATE TABLE ai_attempts_v12 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  import_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation IN (1,2)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN (
    'pending','counting','count_failed','counted','reserved','sending',
    'succeeded','invalid_output','known_failed','unknown','manual')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json)='object'
    AND length(payload_json) BETWEEN 1 AND 120000),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64),
  model_id TEXT NOT NULL CHECK(model_id='gpt-6-luna'),
  price_version TEXT NOT NULL CHECK(price_version='gpt-6-luna-standard-2026-10-08'),
  price_valid_until INTEGER NOT NULL CHECK(typeof(price_valid_until)='integer' AND price_valid_until>0),
  input_price_cents_per_million INTEGER NOT NULL DEFAULT 13 CHECK(input_price_cents_per_million IN (10,13)),
  output_price_cents_per_million INTEGER NOT NULL DEFAULT 50 CHECK(output_price_cents_per_million=50),
  eur_per_usd_bps INTEGER NOT NULL CHECK(typeof(eur_per_usd_bps)='integer' AND eur_per_usd_bps BETWEEN 15000 AND 50000),
  max_output_tokens INTEGER NOT NULL CHECK(typeof(max_output_tokens)='integer' AND max_output_tokens BETWEEN 1 AND 6000),
  count_calls INTEGER NOT NULL DEFAULT 0 CHECK(typeof(count_calls)='integer' AND count_calls BETWEEN 0 AND 1),
  count_started_at INTEGER,
  count_lease_until INTEGER,
  counted_input_tokens INTEGER CHECK(counted_input_tokens IS NULL OR
    (typeof(counted_input_tokens)='integer' AND counted_input_tokens>0)),
  cap_cents INTEGER CHECK(cap_cents IS NULL OR
    (typeof(cap_cents)='integer' AND cap_cents BETWEEN 1 AND 5)),
  reservation_id TEXT UNIQUE,
  send_token TEXT,
  send_started_at INTEGER,
  provider_request_id TEXT CHECK(provider_request_id IS NULL OR length(provider_request_id)<=200),
  usage_input_tokens INTEGER CHECK(usage_input_tokens IS NULL OR
    (typeof(usage_input_tokens)='integer' AND usage_input_tokens>=0)),
  usage_output_tokens INTEGER CHECK(usage_output_tokens IS NULL OR
    (typeof(usage_output_tokens)='integer' AND usage_output_tokens>=0)),
  reason_code TEXT CHECK(reason_code IS NULL OR length(reason_code)<=64),
  dispatch_state TEXT NOT NULL DEFAULT 'pending' CHECK(dispatch_state IN ('pending','sending','sent','failed')),
  dispatch_token TEXT,
  dispatch_attempts INTEGER NOT NULL DEFAULT 0 CHECK(typeof(dispatch_attempts)='integer' AND dispatch_attempts>=0),
  dispatch_available_at INTEGER NOT NULL,
  dispatch_updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,import_id,generation),
  FOREIGN KEY(owner_id,import_id) REFERENCES imports(owner_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,reservation_id) REFERENCES budget_reservations(owner_id,id) ON DELETE CASCADE,
  CHECK((usage_input_tokens IS NULL)=(usage_output_tokens IS NULL)),
  CHECK(reservation_id IS NULL OR cap_cents IS NOT NULL),
  CHECK(state NOT IN ('reserved','sending','succeeded','invalid_output','known_failed','unknown')
    OR reservation_id IS NOT NULL)
);
INSERT INTO ai_attempts_v12 SELECT * FROM ai_attempts;
DROP TRIGGER ai_attempts_budget_insert;
DROP TABLE ai_attempts;
ALTER TABLE ai_attempts_v12 RENAME TO ai_attempts;
CREATE INDEX ai_attempts_dispatch_idx ON ai_attempts(dispatch_state,dispatch_available_at);
CREATE INDEX ai_attempts_recovery_idx ON ai_attempts(state,count_lease_until,send_started_at);
CREATE INDEX ai_attempts_owner_import_idx ON ai_attempts(owner_id,import_id,generation);

CREATE TRIGGER ai_attempts_budget_insert BEFORE INSERT ON budget_reservations
WHEN EXISTS(SELECT 1 FROM ai_attempts a WHERE a.id=NEW.attempt_id) BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM ai_attempts a JOIN imports i ON i.id=a.import_id AND i.owner_id=a.owner_id
      JOIN app_accounts ac ON ac.id=a.owner_id JOIN app_switches sw ON sw.singleton=1
    WHERE a.id=NEW.attempt_id AND a.owner_id=NEW.owner_id AND a.import_id=NEW.import_id
      AND a.state='counted' AND a.reservation_id IS NULL AND a.count_calls=1
      AND a.counted_input_tokens IS NOT NULL AND a.cap_cents=NEW.cap_cents
      AND i.status='needs_review' AND COALESCE(i.expires_at,i.created_at+604800000)>NEW.created_at
      AND ac.status='active' AND sw.ai_enabled=1
  ) THEN RAISE(ABORT,'ai_budget_binding_invalid') END);
END;

CREATE TRIGGER ai_attempts_second_generation BEFORE INSERT ON ai_attempts
WHEN NEW.generation=2 BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM ai_attempts first
    JOIN budget_reservations b ON b.id=first.reservation_id AND b.owner_id=first.owner_id
    WHERE first.owner_id=NEW.owner_id AND first.import_id=NEW.import_id
      AND first.generation=1 AND first.state='invalid_output' AND b.state='settled'
      AND first.usage_input_tokens IS NOT NULL AND first.usage_output_tokens IS NOT NULL
  ) THEN RAISE(ABORT,'ai_repair_requires_known_outcome') END);
END;

CREATE TRIGGER ai_attempts_initial_gate BEFORE INSERT ON ai_attempts BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM imports i JOIN app_accounts a ON a.id=i.owner_id
    JOIN app_switches sw ON sw.singleton=1
    WHERE i.id=NEW.import_id AND i.owner_id=NEW.owner_id AND i.source_kind IN ('url','upload')
      AND i.status='needs_review' AND COALESCE(i.expires_at,i.created_at+604800000)>NEW.created_at
      AND a.status='active' AND sw.ai_enabled=1
  ) THEN RAISE(ABORT,'ai_import_unavailable') END);
END;

CREATE TRIGGER ai_attempts_immutable_request BEFORE UPDATE ON ai_attempts
WHEN NEW.id!=OLD.id OR NEW.owner_id!=OLD.owner_id OR NEW.import_id!=OLD.import_id
  OR NEW.generation!=OLD.generation OR NEW.payload_json!=OLD.payload_json
  OR NEW.payload_sha256!=OLD.payload_sha256 OR NEW.model_id!=OLD.model_id
  OR NEW.price_version!=OLD.price_version OR NEW.price_valid_until!=OLD.price_valid_until
  OR NEW.input_price_cents_per_million!=OLD.input_price_cents_per_million
  OR NEW.output_price_cents_per_million!=OLD.output_price_cents_per_million
  OR NEW.eur_per_usd_bps!=OLD.eur_per_usd_bps OR NEW.max_output_tokens!=OLD.max_output_tokens
  OR NEW.created_at!=OLD.created_at
  OR (OLD.counted_input_tokens IS NOT NULL AND NEW.counted_input_tokens IS NOT OLD.counted_input_tokens)
  OR (OLD.cap_cents IS NOT NULL AND NEW.cap_cents IS NOT OLD.cap_cents)
  OR (OLD.reservation_id IS NOT NULL AND NEW.reservation_id IS NOT OLD.reservation_id)
  OR (OLD.send_token IS NOT NULL AND NEW.send_token IS NOT OLD.send_token)
  OR (OLD.send_started_at IS NOT NULL AND NEW.send_started_at IS NOT OLD.send_started_at)
  OR (OLD.usage_input_tokens IS NOT NULL AND NEW.usage_input_tokens IS NOT OLD.usage_input_tokens)
  OR (OLD.usage_output_tokens IS NOT NULL AND NEW.usage_output_tokens IS NOT OLD.usage_output_tokens)
  OR NEW.count_calls<OLD.count_calls BEGIN
  SELECT RAISE(ABORT,'ai_request_immutable');
END;

CREATE TRIGGER ai_attempts_reservation_binding BEFORE UPDATE OF reservation_id ON ai_attempts
WHEN NEW.reservation_id IS NOT NULL AND OLD.reservation_id IS NULL BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM budget_reservations b WHERE b.id=NEW.reservation_id
      AND b.owner_id=NEW.owner_id AND b.import_id=NEW.import_id
      AND b.attempt_id=NEW.id AND b.cap_cents=NEW.cap_cents AND b.state='reserved'
  ) THEN RAISE(ABORT,'ai_budget_binding_invalid') END);
END;

CREATE TRIGGER ai_attempts_send_gate BEFORE UPDATE OF state ON ai_attempts
WHEN NEW.state='sending' BEGIN
  SELECT (CASE WHEN NEW.send_started_at IS NULL OR NEW.send_token IS NULL OR
    NEW.count_calls!=1 OR NEW.counted_input_tokens IS NULL OR NEW.cap_cents IS NULL OR
    NEW.price_valid_until<=NEW.send_started_at OR NOT EXISTS(
      SELECT 1 FROM budget_reservations b JOIN imports i
        ON i.id=b.import_id AND i.owner_id=b.owner_id
      JOIN app_accounts a ON a.id=i.owner_id JOIN app_switches sw ON sw.singleton=1
      WHERE b.id=NEW.reservation_id AND b.owner_id=NEW.owner_id
        AND b.import_id=NEW.import_id AND b.attempt_id=NEW.id
        AND b.cap_cents=NEW.cap_cents AND b.state='reserved'
        AND i.source_kind IN ('url','upload') AND i.status='needs_review'
        AND COALESCE(i.expires_at,i.created_at+604800000)>NEW.send_started_at AND a.status='active' AND sw.ai_enabled=1
    ) THEN RAISE(ABORT,'ai_send_unavailable') END);
END;

CREATE TRIGGER ai_attempts_count_gate BEFORE UPDATE OF state ON ai_attempts
WHEN NEW.state='counting' BEGIN
  SELECT (CASE WHEN NEW.count_calls!=1 OR NEW.count_started_at IS NULL OR NEW.count_lease_until IS NULL OR NOT EXISTS(
    SELECT 1 FROM imports i JOIN app_accounts a ON a.id=i.owner_id JOIN app_switches sw ON sw.singleton=1
    WHERE i.id=NEW.import_id AND i.owner_id=NEW.owner_id AND i.status='needs_review'
      AND COALESCE(i.expires_at,i.created_at+604800000)>NEW.count_started_at AND a.status='active' AND sw.ai_enabled=1
  ) THEN RAISE(ABORT,'ai_count_unavailable') END);
END;

CREATE TRIGGER ai_attempts_state_machine BEFORE UPDATE OF state ON ai_attempts
WHEN NEW.state!=OLD.state AND NOT (
  (OLD.state='pending' AND NEW.state IN ('counting','manual')) OR
  (OLD.state='counting' AND NEW.state IN ('counted','count_failed')) OR
  (OLD.state='counted' AND NEW.state IN ('reserved','manual')) OR
  (OLD.state='reserved' AND NEW.state IN ('sending','manual')) OR
  (OLD.state='sending' AND NEW.state IN ('succeeded','invalid_output','known_failed','unknown')) OR
  (OLD.state='unknown' AND NEW.state IN ('succeeded','invalid_output','known_failed'))
) BEGIN
  SELECT RAISE(ABORT,'ai_attempt_invalid_transition');
END;
