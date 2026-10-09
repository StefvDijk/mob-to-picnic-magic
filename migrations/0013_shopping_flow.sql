-- Private, connection-scoped candidate index. Never shares customer catalogues.
CREATE TABLE shopping_catalog (
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL,
  connection_generation INTEGER NOT NULL,
  query TEXT NOT NULL,
  products_json TEXT NOT NULL CHECK(json_valid(products_json)),
  checked_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,connection_id,connection_generation,query),
  FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE ingredient_preferences (
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  ingredient_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  matcher_version TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,ingredient_key)
);
CREATE TABLE shopping_requests (
  owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,request_id),
  FOREIGN KEY(owner_id,proposal_id) REFERENCES proposals(owner_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
