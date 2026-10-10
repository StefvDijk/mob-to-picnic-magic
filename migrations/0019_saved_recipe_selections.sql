-- Explicit per-user recipe shopping snapshots; recipes and accounts own their data.
CREATE TABLE saved_recipe_selections (
  owner_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  recipe_version INTEGER NOT NULL CHECK(recipe_version > 0),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,recipe_id),
  FOREIGN KEY(owner_id,recipe_id) REFERENCES recipes(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX saved_recipe_selections_updated ON saved_recipe_selections(owner_id,updated_at DESC,recipe_id DESC);
