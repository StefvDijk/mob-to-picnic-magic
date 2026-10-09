-- Private observations; no inferred complete catalogue or global product identity.
CREATE TABLE catalog_products (
 owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL,
 connection_generation INTEGER NOT NULL,
 product_id TEXT NOT NULL,
 market TEXT NOT NULL DEFAULT 'NL',
 product_json TEXT NOT NULL CHECK(json_valid(product_json)),
 details_json TEXT CHECK(details_json IS NULL OR json_valid(details_json)),
 content_fingerprint TEXT NOT NULL,
 commercial_fingerprint TEXT NOT NULL,
 source_route TEXT NOT NULL,
 first_seen INTEGER NOT NULL,
 checked_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,connection_id,connection_generation,product_id),
 FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX catalog_products_retention ON catalog_products(checked_at);
CREATE TABLE catalog_tasks (
 owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL,
 connection_generation INTEGER NOT NULL,
 product_id TEXT NOT NULL,
 due_at INTEGER NOT NULL,
 lease_until INTEGER,
 attempts INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(owner_id,connection_id,connection_generation,product_id),
 FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id) ON DELETE CASCADE
);
