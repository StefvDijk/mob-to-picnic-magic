-- Operational switches. Missing provider credentials must still fail closed.
CREATE TABLE app_switches (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  ai_enabled INTEGER NOT NULL DEFAULT 1 CHECK (typeof(ai_enabled) = 'integer' AND ai_enabled IN (0, 1)),
  add_enabled INTEGER NOT NULL DEFAULT 1 CHECK (typeof(add_enabled) = 'integer' AND add_enabled IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES app_accounts(id) ON DELETE SET NULL
);
INSERT INTO app_switches(singleton) VALUES (1);
