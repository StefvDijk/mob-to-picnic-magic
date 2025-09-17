import React, { useEffect, useMemo, useState } from 'react';
import { Recipe } from '@/services/recipeService';
import {
  picnicService,
  MatchSessionResponse,
  IngredientItem,
  Candidate,
} from '@/services/picnicService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle2, Loader2, ShoppingCart, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MatchSessionPanelProps {
  recipe: Recipe;
  session: MatchSessionResponse | null;
  onSessionUpdated: (session: MatchSessionResponse) => void;
}

type SelectionState = Record<string, string | null>;

type CandidatePick = { raw: string; productId: string };

function deriveInitialSelections(items: IngredientItem[]) {
  const selections: SelectionState = {};
  items.forEach((item) => {
    if (item.added) return;
    if (item.decision.decision === 'pick' && item.decision.chosenProductId) {
      selections[item.raw] = item.decision.chosenProductId;
      return;
    }
    selections[item.raw] = item.candidates[0]?.id ?? null;
  });
  return selections;
}

function renderCandidateDetails(candidate: Candidate) {
  return (
    <div className="flex flex-col">
      <span className="font-medium text-sm text-foreground">{candidate.name}</span>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
        {candidate.brand && <span>Merk: {candidate.brand}</span>}
        {candidate.unitSize && <span>Formaat: {candidate.unitSize}</span>}
        {candidate.priceEUR && <span>€{candidate.priceEUR}</span>}
        <span>{candidate.isBio ? 'Biologisch' : 'Niet-biologisch'}</span>
        {typeof candidate.matchScore === 'number' && (
          <span>Score: {candidate.matchScore.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}

export function MatchSessionPanel({
  recipe,
  session,
  onSessionUpdated,
}: MatchSessionPanelProps) {
  const [selections, setSelections] = useState<SelectionState>({});
  const [isMatching, setIsMatching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const { toast } = useToast();

  const itemsNeedingReview = useMemo(
    () => session?.items.filter((item) => !item.added) ?? [],
    [session?.items],
  );

  useEffect(() => {
    if (session) {
      setSelections(deriveInitialSelections(session.items));
    }
  }, [session]);

  const handleStartSession = async () => {
    if (!recipe.ingredients.length) {
      toast({
        title: 'Geen ingrediënten gevonden',
        description: 'Laad eerst een recept om te matchen met Picnic',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsMatching(true);
      const rawItems = recipe.ingredients.map((ingredient) => ({ raw: ingredient.raw || ingredient.name }));
      const matchSession = await picnicService.startMatchSession(rawItems);
      onSessionUpdated(matchSession);
      toast({
        title: 'Matchsessie aangemaakt',
        description: `${matchSession.summary.autoAdded} ingrediënten direct toegevoegd, ${matchSession.summary.needsReview} ter review`,
      });
    } catch (error) {
      console.error('Failed to start match session', error);
      toast({
        title: 'Matching mislukt',
        description: error instanceof Error ? error.message : 'Onbekende fout tijdens matching',
        variant: 'destructive',
      });
    } finally {
      setIsMatching(false);
    }
  };

  const handleSelectionChange = (raw: string, value: string) => {
    setSelections((prev) => ({
      ...prev,
      [raw]: value === 'none' ? null : value,
    }));
  };

  const handleConfirm = async () => {
    if (!session) return;
    const picks: CandidatePick[] = Object.entries(selections)
      .filter(([, productId]) => Boolean(productId))
      .map(([raw, productId]) => ({ raw, productId: productId as string }));

    if (picks.length === 0) {
      toast({
        title: 'Geen producten geselecteerd',
        description: 'Er worden geen extra producten toegevoegd. Pas een selectie aan of sluit de review.',
      });
      return;
    }

    try {
      setIsConfirming(true);
      const response = await picnicService.confirmAdditions(session.sessionId, picks);
      onSessionUpdated({
        sessionId: response.session.sessionId,
        items: response.session.items,
        summary: response.session.summary,
        mode: session.mode,
      });
      toast({
        title: 'Producten toegevoegd',
        description: `${response.addedCount} ingrediënten toegevoegd aan het winkelmandje`,
      });
    } catch (error) {
      console.error('Failed to confirm picks', error);
      toast({
        title: 'Bevestigen mislukt',
        description: error instanceof Error ? error.message : 'Onbekende fout tijdens bevestigen',
        variant: 'destructive',
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const renderReviewList = () => {
    if (!session) {
      return (
        <div className="text-muted-foreground text-sm">
          Start een matchsessie om AI-voorstellen te ontvangen voor dit recept.
        </div>
      );
    }

    if (itemsNeedingReview.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <CheckCircle2 className="w-10 h-10 text-picnic-green" />
          <div>
            <p className="font-semibold text-foreground">Alle ingrediënten zijn toegevoegd!</p>
            <p className="text-sm text-muted-foreground">
              Controleer je Picnic winkelmandje om de producten te bekijken.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {itemsNeedingReview.map((item) => (
          <Card key={item.raw} className="border border-muted bg-card/60">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  {item.raw}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  AI-confidence: {(item.decision.confidence * 100).toFixed(0)}%
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Zoekopdracht: <span className="font-medium text-foreground">{item.normalizedQuery}</span>
              </CardDescription>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="bg-muted text-foreground">
                  Categorie: {item.attributes.category}
                </Badge>
                {item.attributes.variant && (
                  <Badge variant="outline">Variant: {item.attributes.variant}</Badge>
                )}
                {item.quantity.sizeHint && (
                  <Badge variant="outline">Verpakking: {item.quantity.sizeHint}</Badge>
                )}
                {typeof item.attributes.organic === 'boolean' && (
                  <Badge variant={item.attributes.organic ? 'secondary' : 'outline'}>
                    {item.attributes.organic ? 'Biologisch gewenst' : 'Niet-biologisch'}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {item.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen kandidaten gevonden. Probeer dit ingrediënt handmatig in de Picnic app toe te voegen.
                </p>
              ) : (
                <RadioGroup
                  value={selections[item.raw] ?? undefined}
                  onValueChange={(value) => handleSelectionChange(item.raw, value)}
                  className="space-y-3"
                >
                  {item.candidates.map((candidate) => (
                    <Label
                      key={candidate.id}
                      htmlFor={`${item.raw}-${candidate.id}`}
                      className="border rounded-lg px-3 py-2 flex gap-3 items-start cursor-pointer hover:border-picnic-green"
                    >
                      <RadioGroupItem id={`${item.raw}-${candidate.id}`} value={candidate.id} className="mt-1" />
                      {renderCandidateDetails(candidate)}
                    </Label>
                  ))}
                  <Label
                    htmlFor={`${item.raw}-none`}
                    className="border rounded-lg px-3 py-2 flex gap-3 items-start cursor-pointer hover:border-destructive/50"
                  >
                    <RadioGroupItem id={`${item.raw}-none`} value="none" className="mt-1" />
                    <div className="flex flex-col">
                      <span className="font-medium text-sm text-foreground">Overslaan</span>
                      <span className="text-xs text-muted-foreground">
                        Geen product toevoegen voor dit ingrediënt.
                      </span>
                    </div>
                  </Label>
                </RadioGroup>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <Card className="bg-gradient-card shadow-recipe">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl text-picnic-green">
            <Sparkles className="w-6 h-6" />
            Picnic matchen
          </CardTitle>
          {session && (
            <Badge variant="outline" className="text-xs">
              Servermodus: {session.mode === 'mock' ? 'Mock (demo)' : 'Live'}
            </Badge>
          )}
        </div>
        <CardDescription className="text-base">
          Laat AI ingrediënten matchen met Picnic. Automatische matches worden direct toegevoegd, de rest controleer je hier.
        </CardDescription>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleStartSession}
            disabled={isMatching}
            variant="picnic"
            className="gap-2"
          >
            {isMatching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Matching...
              </>
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                Start matchsessie
              </>
            )}
          </Button>
          {session && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{session.summary.autoAdded} automatisch toegevoegd</span>
              <Separator orientation="vertical" className="h-4" />
              <span>{session.summary.needsReview} ter review</span>
              <Separator orientation="vertical" className="h-4" />
              <span>{session.summary.noMatch} geen match</span>
            </div>
          )}
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">
        <ScrollArea className="max-h-[420px] pr-4">
          {renderReviewList()}
        </ScrollArea>
        {session && itemsNeedingReview.length > 0 && (
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleConfirm}
              disabled={isConfirming}
              variant="ingredient"
              className="gap-2"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Toevoegen...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Bevestig selectie
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
