import React, { useState } from 'react';
// import { RecipeInput } from '@/components/RecipeInput';
import { PicnicLogin } from '@/components/PicnicLogin';
import { RecipeCard } from '@/components/RecipeCard';
import { AddToBasketButton } from '@/components/AddToBasketButton';
import { UnmatchedMapper } from '@/components/UnmatchedMapper';
import { Recipe } from '@/types/recipe';
import { picnicService, PicnicCredentials } from '@/services/picnicService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { LogOut, Utensils, ShoppingBag } from 'lucide-react';
import { AuthPanel } from '@/components/AuthPanel';
import { backendService } from '@/services/backendService';
import { PicnicCredentialsPanel } from '@/components/PicnicCredentialsPanel';
import { IngredientInput } from '@/components/IngredientInput';

const Index = () => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(backendService.isLoggedIn());
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();
  const [unmatched, setUnmatched] = useState<string[]>([])

  const handleParsed = (ings: { name: string; quantity?: string; unit?: string }[]) => {
    const r: Recipe = {
      title: 'Jouw ingrediënten',
      description: 'Geparste ingrediëntenlijst',
      ingredients: ings,
      instructions: []
    };
    setRecipe(r);
    toast({ title: 'Ingrediënten geparst', description: `${ings.length} items gevonden` });
  };

  const handlePicnicLogin = async (_credentials: PicnicCredentials) => {
    // Deprecated: login is now via backend stored credentials panel
    toast({ title: 'Gebruik het Picnic-koppel formulier hierboven', variant: 'destructive' });
  };

  const handleLogout = () => {
    picnicService.logout();
    backendService.logout();
    setIsLoggedIn(false);
    setRecipe(null);
    setUnmatched([])
    toast({
      title: 'Uitgelogd',
      description: 'Je bent uitgelogd bij Picnic',
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Utensils className="w-8 h-8 text-picnic-orange" />
                <ShoppingBag className="w-8 h-8 text-picnic-green" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">Ingredienten → Picnic</h1>
                <p className="text-sm text-muted-foreground">
                  Plak je ingrediënten en zet ze direct in je winkelmandje
                </p>
              </div>
            </div>
            
            {isLoggedIn && (
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Uitloggen
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto space-y-8">
          
          {/* App Auth */}
          {!isLoggedIn && (
            <AuthPanel onAuthenticated={() => setIsLoggedIn(true)} />
          )}

          {/* Picnic Credentials Setup */}
          {isLoggedIn && (
            <PicnicCredentialsPanel onConfigured={() => {}} />
          )}

          {/* Ingredient free-form input */}
          <IngredientInput onParsed={handleParsed} />
          
          {/* Picnic Login (vervangen door credentials panel) */}
          
          {/* Recipe Display */}
          {recipe && (
            <div className="space-y-6">
              <RecipeCard recipe={recipe} />
              
              {isLoggedIn && (
                <AddToBasketButton recipe={recipe} onFailed={(f) => setUnmatched(f)} />
              )}
              
              {isLoggedIn && unmatched.length > 0 && (
                <UnmatchedMapper unmatched={unmatched} onSaved={() => { /* noop: user can retry add afterwards */ }} />
              )}

              {!isLoggedIn && recipe && (
                <div className="text-center p-6 bg-muted/30 rounded-lg border-2 border-dashed border-muted">
                  <p className="text-muted-foreground mb-4">
                    Log in bij Picnic om ingrediënten toe te voegen aan je winkelmandje
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Status Display */}
          {isLoggedIn && !recipe && (
            <div className="text-center p-8 bg-picnic-light-green/20 rounded-lg border border-picnic-green/20">
              <div className="flex items-center justify-center gap-2 text-picnic-green mb-2">
                <ShoppingBag className="w-6 h-6" />
                <span className="font-semibold">Plak je ingrediënten en parse ze!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Plak een lijst ingrediënten in het veld hierboven om te beginnen
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
