-- Knowledge lives with the existing scoped observation: cascade deletion and
-- the existing 90-day retention apply to evidence and semantic search as well.
ALTER TABLE catalog_products ADD COLUMN knowledge_json TEXT CHECK(knowledge_json IS NULL OR json_valid(knowledge_json));
ALTER TABLE catalog_products ADD COLUMN knowledge_version TEXT;
ALTER TABLE catalog_products ADD COLUMN search_text TEXT;
CREATE INDEX catalog_products_context_age ON catalog_products(owner_id,connection_id,connection_generation,checked_at);
