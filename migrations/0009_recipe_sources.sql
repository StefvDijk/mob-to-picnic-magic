-- A saved recipe keeps its own private source after the short-lived import
-- concept expires. The import ID is provenance, deliberately not a foreign key.
CREATE TABLE recipe_sources (
  owner_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  import_id TEXT NOT NULL CHECK(length(import_id) BETWEEN 1 AND 100),
  candidate_index INTEGER CHECK(candidate_index IS NULL OR
    (typeof(candidate_index)='integer' AND candidate_index BETWEEN 0 AND 29)),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('text','url','upload')),
  source_label TEXT CHECK(source_label IS NULL OR length(source_label)<=300),
  source_url TEXT CHECK(source_url IS NULL OR length(source_url)<=2048),
  source_text TEXT CHECK(source_text IS NULL OR length(source_text)<=50000),
  selected_candidate_json TEXT CHECK(selected_candidate_json IS NULL OR
    (json_valid(selected_candidate_json) AND json_type(selected_candidate_json)='object'
      AND length(selected_candidate_json)<=250000)),
  imported_at INTEGER NOT NULL CHECK(typeof(imported_at)='integer' AND imported_at>=0),
  PRIMARY KEY(owner_id,recipe_id),
  FOREIGN KEY(owner_id,recipe_id) REFERENCES recipes(owner_id,id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  CHECK(source_kind!='text' OR source_text IS NOT NULL),
  CHECK(source_kind!='url' OR source_url IS NOT NULL),
  CHECK((candidate_index IS NULL)=(selected_candidate_json IS NULL))
);
CREATE INDEX recipe_sources_import_idx ON recipe_sources(owner_id,import_id);

-- Editing the interpreted recipe must never rewrite the original source.
CREATE TRIGGER recipe_sources_immutable BEFORE UPDATE ON recipe_sources BEGIN
  SELECT RAISE(ABORT,'recipe_source_immutable');
END;

-- Recipes are soft-deleted; remove personal source content immediately.
CREATE TRIGGER recipe_sources_soft_delete AFTER UPDATE OF deleted_at ON recipes
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL BEGIN
  DELETE FROM recipe_sources WHERE owner_id=NEW.owner_id AND recipe_id=NEW.id;
END;
