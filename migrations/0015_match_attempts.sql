-- Separate matching ledger, sharing the existing atomic import budget counters.
-- Rounded cents remain a conservative enforcement bound; actual micro-euros
-- preserve measured costs without pretending each small match cost one cent.
CREATE TABLE match_attempts (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
 context_key TEXT NOT NULL,
 payload_key TEXT NOT NULL CHECK(length(payload_key)=64),
 payload_json TEXT CHECK(payload_json IS NULL OR (json_valid(payload_json) AND length(payload_json)<=16000)),
 model_version TEXT NOT NULL,
 month TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('reserved','sending','succeeded','invalid','unknown')),
 cap_cents INTEGER NOT NULL CHECK(cap_cents BETWEEN 1 AND 5),
 bound_tokens INTEGER NOT NULL CHECK(bound_tokens BETWEEN 1 AND 16000),
 eur_bps INTEGER NOT NULL CHECK(eur_bps BETWEEN 15000 AND 50000),
 lease_until INTEGER NOT NULL,
 send_token TEXT,
 result_status TEXT CHECK(result_status IN ('suitable','substitution','unsuitable','unresolved')),
 input_tokens INTEGER CHECK(input_tokens>=0),
 actual_micro_eur INTEGER CHECK(actual_micro_eur>=0),
 actual_cents INTEGER CHECK(actual_cents BETWEEN 0 AND cap_cents),
 provider_request_id TEXT CHECK(length(provider_request_id)<=200),
 reason_code TEXT CHECK(length(reason_code)<=64),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(owner_id,context_key,payload_key),
 FOREIGN KEY(owner_id,month) REFERENCES user_budget_months(owner_id,month) ON DELETE CASCADE,
 CHECK((state IN ('succeeded','invalid'))=(actual_cents IS NOT NULL))
);
CREATE INDEX match_attempts_retention_idx ON match_attempts(updated_at);
CREATE TRIGGER match_budget_check BEFORE INSERT ON match_attempts BEGIN
 SELECT (CASE WHEN NEW.state!='reserved' OR NOT EXISTS(SELECT 1 FROM app_accounts a JOIN app_switches sw ON sw.singleton=1 WHERE a.id=NEW.owner_id AND a.status='active' AND sw.ai_enabled=1) THEN RAISE(ABORT,'match_disabled') END);
 SELECT (CASE WHEN NOT EXISTS(SELECT 1 FROM app_budget_months a JOIN user_budget_months u ON u.month=a.month AND u.owner_id=NEW.owner_id WHERE a.month=NEW.month AND a.spent_cents+a.reserved_cents+NEW.cap_cents<=MIN(a.cap_cents,1500) AND u.spent_cents+u.reserved_cents+NEW.cap_cents<=MIN(u.cap_cents,500)) THEN RAISE(ABORT,'budget_exceeded') END);
END;
CREATE TRIGGER match_budget_add AFTER INSERT ON match_attempts BEGIN
 UPDATE app_budget_months SET reserved_cents=reserved_cents+NEW.cap_cents WHERE month=NEW.month;
 UPDATE user_budget_months SET reserved_cents=reserved_cents+NEW.cap_cents WHERE owner_id=NEW.owner_id AND month=NEW.month;
END;
CREATE TRIGGER match_budget_settle AFTER UPDATE OF state ON match_attempts WHEN OLD.state='sending' AND NEW.state IN ('succeeded','invalid') BEGIN
 UPDATE app_budget_months SET reserved_cents=reserved_cents-OLD.cap_cents,spent_cents=spent_cents+NEW.actual_cents WHERE month=OLD.month;
 UPDATE user_budget_months SET reserved_cents=reserved_cents-OLD.cap_cents,spent_cents=spent_cents+NEW.actual_cents WHERE owner_id=OLD.owner_id AND month=OLD.month;
END;
CREATE TRIGGER match_budget_delete BEFORE DELETE ON match_attempts WHEN OLD.state IN ('reserved','sending','unknown') BEGIN
 UPDATE app_budget_months SET reserved_cents=reserved_cents-OLD.cap_cents,spent_cents=spent_cents+OLD.cap_cents WHERE month=OLD.month;
 UPDATE user_budget_months SET reserved_cents=reserved_cents-OLD.cap_cents,spent_cents=spent_cents+OLD.cap_cents WHERE owner_id=OLD.owner_id AND month=OLD.month;
END;
CREATE TRIGGER match_immutable BEFORE UPDATE ON match_attempts WHEN NEW.id!=OLD.id OR NEW.owner_id!=OLD.owner_id OR NEW.context_key!=OLD.context_key OR NEW.payload_key!=OLD.payload_key OR (NEW.payload_json IS NOT OLD.payload_json AND NEW.payload_json IS NOT NULL) OR NEW.cap_cents!=OLD.cap_cents OR NEW.month!=OLD.month OR NEW.bound_tokens!=OLD.bound_tokens OR NEW.eur_bps!=OLD.eur_bps OR NEW.model_version!=OLD.model_version OR NEW.created_at!=OLD.created_at BEGIN SELECT RAISE(ABORT,'match_immutable'); END;
CREATE TRIGGER match_transitions BEFORE UPDATE OF state ON match_attempts WHEN NOT ((OLD.state='reserved' AND NEW.state IN ('sending','unknown')) OR (OLD.state='sending' AND NEW.state IN ('succeeded','invalid','unknown'))) BEGIN SELECT RAISE(ABORT,'match_final'); END;
