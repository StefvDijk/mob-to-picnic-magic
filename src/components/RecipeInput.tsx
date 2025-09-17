import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChefHat, ExternalLink } from 'lucide-react';

interface RecipeInputProps {
  onRecipeLoad: (url: string) => void;
  isLoading: boolean;
}

export function RecipeInput({ onRecipeLoad, isLoading }: RecipeInputProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onRecipeLoad(url.trim());
    }
  };

  const isValidMobUrl = url.includes('mob.co.uk');

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl text-picnic-orange">
          <ChefHat className="w-7 h-7" />
          Recipe Importer
        </CardTitle>
        <CardDescription className="text-lg">
          Voer een mob.co.uk recept URL in om ingrediënten naar je Picnic winkelmandje te sturen
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="url"
              placeholder="https://mob.co.uk/recipes/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="text-lg h-12"
              disabled={isLoading}
            />
            {url && !isValidMobUrl && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <ExternalLink className="w-4 h-4" />
                Alleen mob.co.uk recepten worden ondersteund
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="picnic"
            size="lg"
            className="w-full text-lg h-12"
            disabled={isLoading || !isValidMobUrl || !url.trim()}
          >
            {isLoading ? 'Recept laden...' : 'Recept importeren'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}