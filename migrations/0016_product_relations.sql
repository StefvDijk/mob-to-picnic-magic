CREATE TABLE product_relations (
 id TEXT NOT NULL UNIQUE,
 owner_id TEXT NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL,
 connection_generation INTEGER NOT NULL,
 ingredient_key TEXT NOT NULL,
 product_id TEXT NOT NULL,
 content_fingerprint TEXT NOT NULL,
 rules_version TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('suitable','substitution','unsuitable','unresolved')),
 assessment_json TEXT NOT NULL CHECK(json_valid(assessment_json)),
 checked_at INTEGER NOT NULL,
 PRIMARY KEY(owner_id,connection_id,connection_generation,ingredient_key,product_id,content_fingerprint,rules_version),
 FOREIGN KEY(owner_id,connection_id) REFERENCES connections(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX product_relations_retention ON product_relations(checked_at);
