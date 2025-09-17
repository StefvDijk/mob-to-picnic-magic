import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Recipe } from '@/services/recipeService';
import { ChefHat, Clock, Users } from 'lucide-react';

interface RecipeCardProps {
  recipe: Recipe;
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl text-picnic-orange mb-2">{recipe.title}</CardTitle>
            <CardDescription className="text-base">{recipe.description}</CardDescription>
          </div>
          {recipe.imageUrl && (
            <div className="ml-4 flex-shrink-0">
              <img
                src={recipe.imageUrl}
                alt={recipe.title}
                className="w-24 h-24 object-cover rounded-lg shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
        
        <div className="flex gap-4 mt-4">
          {recipe.servings && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              {recipe.servings} porties
            </div>
          )}
          {recipe.cookingTime && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {recipe.cookingTime}
            </div>
          )}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <ChefHat className="w-4 h-4" />
            {recipe.ingredients.length} ingrediënten
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-picnic-green mb-3">Ingrediënten:</h3>
            <div className="grid gap-2">
              {recipe.ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-picnic-light-green text-picnic-green border-picnic-green/20">
                    {ingredient.quantity && ingredient.unit 
                      ? `${ingredient.quantity} ${ingredient.unit}` 
                      : ingredient.quantity || '1x'
                    }
                  </Badge>
                  <span className="text-sm">{ingredient.name}</span>
                </div>
              ))}
            </div>
          </div>
          
          {recipe.instructions.length > 0 && (
            <div>
              <h3 className="font-semibold text-picnic-green mb-3">Bereidingswijze:</h3>
              <div className="space-y-2">
                {recipe.instructions.slice(0, 3).map((instruction, index) => (
                  <p key={index} className="text-sm text-muted-foreground">
                    {instruction}
                  </p>
                ))}
                {recipe.instructions.length > 3 && (
                  <p className="text-sm text-muted-foreground italic">
                    ... en nog {recipe.instructions.length - 3} stappen meer
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}