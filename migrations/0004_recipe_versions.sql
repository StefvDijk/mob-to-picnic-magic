-- A per-write token lets every child mutation in a D1 batch prove it belongs to
-- the request that won the expected-version compare-and-swap.
ALTER TABLE recipes ADD COLUMN write_token TEXT;
CREATE UNIQUE INDEX recipes_write_token_unique ON recipes(write_token) WHERE write_token IS NOT NULL;

-- Preserve old ingredient rows while proposals still reference them. Active
-- recipe contents are versioned by retiring rows and inserting fresh rows.
CREATE TABLE ingredients_new (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  section TEXT,
  original_text TEXT NOT NULL,
  normalized_name TEXT,
  quantity_kind TEXT NOT NULL CHECK(quantity_kind IN ('exact','range','global','unknown')),
  quantity_num INTEGER CHECK(quantity_num IS NULL OR (typeof(quantity_num)='integer' AND quantity_num >= 0)),
  quantity_den INTEGER NOT NULL DEFAULT 1 CHECK(typeof(quantity_den)='integer' AND quantity_den > 0),
  quantity_max_num INTEGER CHECK(quantity_max_num IS NULL OR (typeof(quantity_max_num)='integer' AND quantity_max_num >= 0)),
  unit TEXT CHECK(unit IS NULL OR unit IN ('g','kg','ml','l','piece')),
  source_origin TEXT CHECK(source_origin IN ('user','parser','ai','estimate') OR source_origin IS NULL),
  attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json)),
  uncertainty_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(uncertainty_json)),
  created_at INTEGER NOT NULL,
  retired_at INTEGER,
  UNIQUE(owner_id,recipe_id,id),
  FOREIGN KEY(owner_id,recipe_id) REFERENCES recipes(owner_id,id) ON DELETE CASCADE,
  CHECK ((quantity_kind IN ('exact','range') AND quantity_num IS NOT NULL AND unit IS NOT NULL) OR quantity_kind IN ('global','unknown')),
  CHECK ((quantity_kind = 'range' AND quantity_max_num IS NOT NULL AND quantity_max_num >= quantity_num) OR (quantity_kind != 'range' AND quantity_max_num IS NULL)),
  CHECK ((quantity_kind IN ('global','unknown') AND quantity_num IS NULL) OR quantity_kind IN ('exact','range'))
);
INSERT INTO ingredients_new(id,owner_id,recipe_id,ordinal,section,original_text,normalized_name,quantity_kind,quantity_num,
  quantity_den,quantity_max_num,unit,source_origin,attributes_json,uncertainty_json,created_at,retired_at)
  SELECT id,owner_id,recipe_id,ordinal,section,original_text,normalized_name,quantity_kind,quantity_num,quantity_den,
    quantity_max_num,unit,source_origin,attributes_json,uncertainty_json,created_at,NULL FROM ingredients;

CREATE TABLE proposal_need_sources_new (
  owner_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  need_id TEXT NOT NULL,
  ingredient_id TEXT NOT NULL,
  PRIMARY KEY(owner_id,proposal_id,need_id,ingredient_id),
  FOREIGN KEY(owner_id,proposal_id,need_id) REFERENCES proposal_needs(owner_id,proposal_id,id) ON DELETE CASCADE,
  FOREIGN KEY(owner_id,recipe_id,ingredient_id) REFERENCES ingredients_new(owner_id,recipe_id,id) ON DELETE CASCADE
);
INSERT INTO proposal_need_sources_new(owner_id,proposal_id,recipe_id,need_id,ingredient_id)
  SELECT owner_id,proposal_id,recipe_id,need_id,ingredient_id FROM proposal_need_sources;
DROP TABLE proposal_need_sources;
DROP TABLE ingredients;
ALTER TABLE ingredients_new RENAME TO ingredients;
ALTER TABLE proposal_need_sources_new RENAME TO proposal_need_sources;
CREATE UNIQUE INDEX ingredients_active_ordinal_unique ON ingredients(owner_id,recipe_id,ordinal) WHERE retired_at IS NULL;
CREATE INDEX ingredients_recipe_idx ON ingredients(owner_id,recipe_id,ordinal);
