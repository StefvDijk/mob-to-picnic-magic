import { useState } from 'react';
import type { RecipeDto } from '../../shared/recipes';
import { recipeImageUrl } from '../../shared/recipe-image';

export function RecipeCover({ recipe, detail = false }: { recipe: RecipeDto; detail?: boolean }) {
  const src = recipeImageUrl(recipe.imageUrl, recipe.sourceUrl);
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || src === failed) return null;
  return <img className={detail ? 'recipe-detail-cover' : 'recipe-cover'} src={src} alt={recipe.title}
    loading={detail ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(src)} />;
}
