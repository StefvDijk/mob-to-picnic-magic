import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Check, AlertCircle } from 'lucide-react';
import { Recipe } from '@/services/recipeService';
import { picnicService } from '@/services/picnicService';
import { backendService } from '@/services/backendService';
import { useToast } from '@/hooks/use-toast';

interface AddToBasketButtonProps {
  recipe: Recipe;
  onFailed?: (failed: string[]) => void;
}

export function AddToBasketButton({ recipe, onFailed }: AddToBasketButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const handleAddToBasket = async () => {
    if (!backendService.isLoggedIn()) {
      toast({
        title: 'Niet ingelogd',
        description: 'Log eerst in bij de app en koppel je Picnic-account',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setIsSuccess(false);

    try {
      // Route via backend so credentials blijven server-side
      const result = await backendService.addIngredients(recipe.ingredients);
      
      if (result.success > 0) {
        setIsSuccess(true);
        toast({
          title: 'Ingrediënten toegevoegd!',
          description: `${result.success} ingrediënten zijn toegevoegd aan je Picnic winkelmandje`,
        });

        if (result.failed.length > 0) {
          onFailed?.(result.failed)
          toast({
            title: 'Enkele ingrediënten niet gevonden',
            description: `${result.failed.length} ingrediënten konden niet worden toegevoegd: ${result.failed.slice(0, 3).join(', ')}${result.failed.length > 3 ? '...' : ''}`,
            variant: 'destructive',
          });
        }

        // Reset success state after 3 seconds
        setTimeout(() => setIsSuccess(false), 3000);
      } else {
        toast({
          title: 'Geen ingrediënten toegevoegd',
          description: 'Geen van de ingrediënten kon worden gevonden in Picnic',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to add ingredients:', error);
      toast({
        title: 'Fout opgetreden',
        description: 'Er is een fout opgetreden bij het toevoegen van ingrediënten',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <Button variant="ingredient" size="lg" className="w-full text-lg h-14" disabled>
        <Check className="w-5 h-5 mr-2" />
        Toegevoegd aan winkelmandje!
      </Button>
    );
  }

  return (
    <Button
      onClick={handleAddToBasket}
      variant="picnic"
      size="lg"
      className="w-full text-lg h-14"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <div className="w-5 h-5 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Ingrediënten toevoegen...
        </>
      ) : (
        <>
          <ShoppingCart className="w-5 h-5 mr-2" />
          Voeg {recipe.ingredients.length} ingrediënten toe aan Picnic
        </>
      )}
    </Button>
  );
}