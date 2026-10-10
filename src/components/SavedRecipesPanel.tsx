import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Pencil, RotateCcw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { SavedRecipeDto } from '../../shared/recipes';
import { Button } from '@/components/ui/button';
import { AdditionStatus } from '@/components/AdditionStatus';

type RepeatIntent = { requestId: string; proposal?: { id: string; version: number; totalPriceCents: number }; actionId?: string };
const readIntent = (key: string): RepeatIntent | null => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as RepeatIntent | null; } catch { return null; } };

export function SavedRecipesPanel({ ownerId, onAuthExpired, onReview }: {
  ownerId: string;
  onAuthExpired: () => void;
  onReview: (recipe: SavedRecipeDto) => void;
}) {
  const [recipes, setRecipes] = useState<SavedRecipeDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionRecipeId, setActionRecipeId] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<Array<{ name: string; reason: 'unverified' | 'unavailable' }>>([]);

  const load = useCallback(async (next?: string) => {
    setLoading(true); setError('');
    try {
      const result = await api.listSavedRecipes(next);
      setRecipes(current => next ? [...current, ...result.recipes] : result.recipes);
      setCursor(result.nextCursor);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setError(cause instanceof Error ? cause.message : 'Je herinnerde recepten zijn niet geladen.');
    } finally { setLoading(false); }
  }, [onAuthExpired]);
  useEffect(() => { void load(); }, [load, ownerId]);
  useEffect(() => {
    const pending = recipes.find(recipe => readIntent(`picnic:saved-repeat:${ownerId}:${recipe.recipeId}`)?.actionId);
    if (!pending) return;
    const intent = readIntent(`picnic:saved-repeat:${ownerId}:${pending.recipeId}`);
    if (intent?.actionId) { setActionRecipeId(pending.recipeId);setActionId(intent.actionId); }
  }, [ownerId, recipes]);

  async function repeat(recipe: SavedRecipeDto) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setUnavailable([]); setReviewId(null);
    const key = `picnic:saved-repeat:${ownerId}:${recipe.recipeId}`;
    let intent = readIntent(key);
    if (!intent) { intent = { requestId: crypto.randomUUID() }; localStorage.setItem(key, JSON.stringify(intent)); }
    try {
      if (intent.actionId) { setActionRecipeId(recipe.recipeId);setActionId(intent.actionId); return; }
      if (!intent.proposal) {
        const result = await api.repeatSavedRecipe(recipe.recipeId, intent.requestId);
        if (!result.proposal) {
          localStorage.removeItem(key);
          setReviewId(recipe.recipeId);
          setUnavailable(result.unavailable.map(item => ({ name: item.name, reason: item.reason })));
          if (!result.unavailable.length) setError('Voor dit recept zijn geen producten geselecteerd.');
          return;
        }
        intent = { ...intent, proposal: result.proposal };
        localStorage.setItem(key, JSON.stringify(intent));
      }
      let actionId = intent.actionId;
      if (!actionId) {
        try {
          const approved = await api.approveProposal(intent.proposal!.id, intent.proposal!.version);
          actionId = approved.action.id;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 401) throw cause;
          try { actionId = (await api.getProposalAction(intent.proposal!.id)).action.id; }
          catch (check) {
            if (check instanceof ApiError && check.status === 401) throw check;
            if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && check instanceof ApiError && check.status === 404) {
              localStorage.removeItem(key);
              setReviewId(recipe.recipeId);
              throw new Error('Er is niets toegevoegd. Controleer de actuele keuzes en probeer opnieuw.');
            }
            throw new Error('De toevoeging wordt niet opnieuw verstuurd. Controleer de status of hervat dezelfde toevoeging.');
          }
        }
        intent = { ...intent, actionId };
        localStorage.setItem(key, JSON.stringify(intent));
      }
      setActionRecipeId(recipe.recipeId);setActionId(actionId);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else if (cause instanceof ApiError && cause.code === 'RECIPE_STALE') { localStorage.removeItem(key);setReviewId(recipe.recipeId);setError('Dit recept is gewijzigd. Kies de boodschappen opnieuw en bewaar de selectie daarna weer.'); }
      else if (cause instanceof ApiError && ['MATCH_NOT_CONFIRMED','SUBSTITUTION_NOT_ACCEPTED','PRICE_UNAVAILABLE'].includes(cause.code)) { localStorage.removeItem(key);setReviewId(recipe.recipeId);setError('Een bewaard product moet opnieuw worden gecontroleerd. Pas de keuzes aan en probeer het daarna opnieuw.'); }
      else setError(cause instanceof Error ? cause.message : 'Het recept is niet toegevoegd.');
    } finally { busyRef.current = false; setBusy(false); }
  }

  if (actionId) return <section className="sp-saved-recipes"><AdditionStatus id={actionId} onAuthExpired={onAuthExpired} shoppingOnly onNewProposal={() => {if(actionRecipeId)localStorage.removeItem(`picnic:saved-repeat:${ownerId}:${actionRecipeId}`);setActionId(null);setActionRecipeId(null);}} /></section>;

  return <section className="sp-saved-recipes" aria-labelledby="saved-recipes-title">
    <header className="sp-saved-heading"><div><h1 id="saved-recipes-title">Recepten</h1><p>Je bewaarde productkeuzes staan klaar om opnieuw toe te voegen.</p></div><BookOpen size={21} aria-hidden="true" /></header>
    {error && <p className="sp-error" role="alert">{error}<button type="button" onClick={() => void load()}>Opnieuw proberen</button></p>}
    {unavailable.length > 0 && <div className="sp-saved-unavailable" role="alert"><strong>Er is niets toegevoegd.</strong><p>Controleer deze keuzes en probeer het daarna opnieuw:</p><ul>{unavailable.map((item, index) => <li key={`${item.name}-${index}`}>{item.name} · {item.reason === 'unverified' ? 'opnieuw controleren' : 'niet beschikbaar'}</li>)}</ul>{reviewId&&<Button variant="outline" onClick={()=>{const recipe=recipes.find(item=>item.recipeId===reviewId);if(recipe)onReview(recipe);}}>Keuzes aanpassen</Button>}</div>}
    {error&&reviewId&&<Button className="sp-saved-review" variant="outline" onClick={()=>{const recipe=recipes.find(item=>item.recipeId===reviewId);if(recipe)onReview(recipe);}}>Keuzes opnieuw bekijken</Button>}
    {loading && !recipes.length ? <p role="status" className="sp-saved-state">Je recepten laden…</p> : recipes.length ? <ul className="sp-saved-list">{recipes.map(recipe => <li key={recipe.recipeId}>
      <Button className="sp-saved-main" variant="ghost" aria-label={`${busy ? 'Bezig met toevoegen' : 'Voeg'} ${recipe.recipeTitle} met de bewaarde productkeuzes opnieuw toe`} disabled={busy} onClick={() => void repeat(recipe)}>
        <span className="sp-saved-copy"><strong>{recipe.recipeTitle}</strong><span>{new Set(recipe.choices.map(choice=>choice.productId)).size} producten · {recipe.servings} personen{recipe.skippedGroupIds.length ? ` · ${recipe.skippedGroupIds.length} overgeslagen` : ''}</span></span>
        <span className="sp-saved-repeat-indicator" aria-hidden="true">{busy ? 'Bezig…' : <><RotateCcw size={16}/><span>Toevoegen</span></>}</span>
      </Button>
      <Button className="sp-saved-edit" variant="ghost" disabled={busy} aria-label={`Pas ${recipe.recipeTitle} aan`} onClick={() => onReview(recipe)}><Pencil size={17}/></Button>
    </li>)}</ul> : !loading && !error ? <p className="sp-saved-state">Je hebt nog geen receptkeuzes bewaard. Bewaar een selectie bij je boodschappen.</p> : null}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>Meer recepten <ArrowRight size={16}/></Button>}
  </section>;
}
