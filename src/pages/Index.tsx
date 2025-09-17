import React, { useState } from 'react';
import { RecipeInput } from '@/components/RecipeInput';
import { PicnicLogin } from '@/components/PicnicLogin';
import { RecipeCard } from '@/components/RecipeCard';
import { MatchSessionPanel } from '@/components/MatchSessionPanel';
import { recipeService, Recipe } from '@/services/recipeService';
import { picnicService, PicnicCredentials, MatchSessionResponse } from '@/services/picnicService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { LogOut, Utensils, ShoppingBag } from 'lucide-react';

const Index = () => {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState<MatchSessionResponse | null>(null);
  const [isLoadingRecipe, setIsLoadingRecipe] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { toast } = useToast();

  const handleRecipeLoad = async (url: string) => {
    setIsLoadingRecipe(true);
    try {
      const loadedRecipe = await recipeService.fetchRecipe(url);
      setRecipe(loadedRecipe);
      setSession(null);
      toast({
        title: 'Recept geladen!',
        description: `${loadedRecipe.title} met ${loadedRecipe.ingredients.length} ingrediënten`,
      });
    } catch (error) {
      console.error('Failed to load recipe:', error);
      toast({
        title: 'Fout bij laden recept',
        description: error instanceof Error ? error.message : 'Onbekende fout opgetreden',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingRecipe(false);
    }
  };

  const handlePicnicLogin = async (credentials: PicnicCredentials) => {
    setIsLoggingIn(true);
    try {
      const result = await picnicService.login(credentials);
      if (result.success) {
        setIsLoggedIn(true);
        setSession(null);
        toast({
          title: 'Verbonden met Picnic',
          description: result.message,
        });
      } else {
        toast({
          title: 'Inloggen mislukt',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Picnic login error:', error);
      toast({
        title: 'Fout bij inloggen',
        description: error instanceof Error ? error.message : 'Er is een fout opgetreden bij het inloggen',
        variant: 'destructive',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await picnicService.logout();
    } catch (error) {
      console.error('Picnic logout error:', error);
    }
    setIsLoggedIn(false);
    setRecipe(null);
    setSession(null);
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
                <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Mob → Picnic
                </h1>
                <p className="text-sm text-muted-foreground">
                  Recepten direct naar je winkelmandje
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
          
          {/* Recipe Input */}
          <RecipeInput onRecipeLoad={handleRecipeLoad} isLoading={isLoadingRecipe} />
          
          {/* Picnic Login */}
          {!isLoggedIn && (
            <PicnicLogin onLogin={handlePicnicLogin} isLoading={isLoggingIn} />
          )}
          
          {/* Recipe Display */}
          {recipe && (
            <div className="space-y-6">
              <RecipeCard recipe={recipe} />
              
              {isLoggedIn && (
                <MatchSessionPanel
                  recipe={recipe}
                  session={session}
                  onSessionUpdated={setSession}
                />
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
                <span className="font-semibold">Klaar om ingrediënten toe te voegen!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Importeer een recept hierboven om te beginnen
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
