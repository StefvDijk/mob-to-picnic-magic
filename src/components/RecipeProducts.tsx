import { ShoppingLoader } from './ShoppingLoader';
import { restoreShoppingChoice, type ShoppingChoiceState as Choice } from '@/lib/shopping-choice';
import { unitPriceForPacks } from '../../shared/product-pricing';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecipeDto, RecipeIngredientDto, SavedRecipeDto } from '../../shared/recipes';
import type { ShoppingCandidate, ShoppingPlan, ShoppingProposalInput, ShoppingProposalResult, ShoppingRow } from '../../shared/shopping';
import { validServings } from '../../worker/domain/shopping';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProductImage, ProductPrice, ProductSummary, ProductCard, ProductRail, QuantityStepper } from '@/components/picnic/catalog';
import { AdditionStatus } from '@/components/AdditionStatus';
import { ShoppingProgress } from '@/components/ShoppingProgress';
import { RecipeFlow } from '@/components/RecipeFlow';
import { quantityLabel, shoppingQuantityLabel } from '@/lib/recipe-presentation';
import { ArrowLeft, ChevronDown, ChevronRight, Check, Pencil, RefreshCw, LoaderCircle, ShoppingBasket } from 'lucide-react';

type PendingPurchase = { input: ShoppingProposalInput; result?: ShoppingProposalResult; actionId?: string };
const euro = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
function readSaved<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; } }
const validCount = (count: number | null | undefined): count is number => Number.isSafeInteger(count) && count! >= 1 && count! <= 10_000;
const sourceText = (row: ShoppingRow) => [...new Set(row.sources.map(source => source.originalText))].join(' + ');

export function RecipeProducts({ recipe: originalRecipe, ownerId, initialServings, initialDeadlineAt, clientDeadlineAt, initialSavedSelection, onBack, onAuthExpired, compact = false, onEditIngredient }: {
  compact?: boolean; onEditIngredient?: (sources: RecipeIngredientDto[]) => void; recipe: RecipeDto; ownerId: string; initialServings?: string; initialDeadlineAt?: number; clientDeadlineAt?: number; initialSavedSelection?: SavedRecipeDto; onBack: (servings: string) => void; onAuthExpired: () => void;
}) {
  const key = `picnic:shopping:${ownerId}:${originalRecipe.id}`;
  const [recipe, setRecipe] = useState(originalRecipe);
  const [servings, setServings] = useState(() => {const saved=readSaved<{servings:string;version:number}>(key);return saved&&saved.version!==originalRecipe.version?saved.servings:initialServings??saved?.servings??originalRecipe.baseServings??'2';});
  const [baseServings, setBaseServings] = useState('');
  const [plan, setPlan] = useState<ShoppingPlan | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!loading) return;
    setElapsed(0); const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState<'all' | 'attention' | 'skipped'>('all');
  const [rememberRecipe, setRememberRecipe] = useState(() => initialSavedSelection?.recipeId === originalRecipe.id && initialSavedSelection.recipeVersion === originalRecipe.version);
  const [rememberedStatus, setRememberedStatus] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const returnProductFocus = useRef<string | null>(null);
  const [purchase, setPurchase] = useState<PendingPurchase | null>(() => readSaved<PendingPurchase>(`${key}:purchase`));
  const working = useRef(false);
  const [recovering, setRecovering] = useState(!!purchase);
  const requestCache = useRef<{ key: string; promise: ReturnType<typeof api.shoppingPlan> } | null>(null);

  const persistPurchase = (next: PendingPurchase) => { localStorage.setItem(`${key}:purchase`, JSON.stringify(next)); setPurchase(next); };
  useEffect(() => {
    let cancelled = false;
    const stored = readSaved<PendingPurchase>(`${key}:purchase`);
    if (!stored?.result || stored.actionId) { setRecovering(false); return; }
    void api.getProposalAction(stored.result.proposal.id).then(result => {
      if (!cancelled) {
        const next = { ...stored, actionId: result.action.id };
        localStorage.setItem(`${key}:purchase`, JSON.stringify(next)); setPurchase(next);
      }
    }).catch(cause => {
      if (!cancelled && !(cause instanceof ApiError && cause.status === 404)) setError('De vorige toevoeging kon niet worden gecontroleerd. Probeer dezelfde toevoeging opnieuw om de status op te halen.');
    }).finally(() => { if (!cancelled) setRecovering(false); });
    return () => { cancelled = true; };
  }, [key]);
  useEffect(() => {
    if (purchase) return;
    if (!validServings(recipe.baseServings) || !validServings(servings)) { setPlan(null); setLoading(false); return; }
    let active = true;
    setLoading(true); setError(''); setPlan(current => current?.recipeId === recipe.id && current.recipeVersion === recipe.version && current.servings === servings ? current : null);
    const cacheKey = `${recipe.id}:${recipe.version}:${servings}:${refresh}`;
    if (requestCache.current?.key !== cacheKey) {
      // Only the initial automatic request shares the import budget. Explicit
      // quantity changes and refreshes start a new read-only retrieval attempt.
      const firstRequest = requestCache.current === null && refresh === 0;
      requestCache.current = {key:cacheKey,promise:api.shoppingPlan(recipe.id,servings,refresh>0,
        firstRequest ? initialDeadlineAt : undefined,
        firstRequest && clientDeadlineAt !== undefined ? Math.max(1,clientDeadlineAt-Date.now()) : 30_000)};
    }
    void requestCache.current.promise.then(({ plan: next }) => {
      if (!active) return;
      const saved = readSaved<{ servings: string; version: number; choices: Record<string, Choice> }>(key);
      const restored = saved?.servings === servings && saved.version === recipe.version ? saved.choices : Object.fromEntries(Object.entries(saved?.choices ?? {}).filter(([,choice]) => choice.omitted));
      const currentSaved = initialSavedSelection?.recipeId === recipe.id && initialSavedSelection.recipeVersion === recipe.version && initialSavedSelection.servings === servings;
      if (initialSavedSelection?.recipeId === recipe.id && initialSavedSelection.recipeVersion !== recipe.version) setError('Deze bewaarde selectie hoort bij een oudere receptversie. Controleer de actuele keuzes en bewaar ze opnieuw.');
      const remembered = currentSaved ? new Map(initialSavedSelection.choices.map(choice => [choice.groupId, choice])) : null;
      const skipped = currentSaved ? new Set(initialSavedSelection.skippedGroupIds) : null;
      setChoices(Object.fromEntries(next.rows.map(row => {
        const choice = remembered?.get(row.id);
        if (choice) return [row.id, { productId: choice.productId, selected: true, count: choice.packCount, changed: true, countChanged: true, remember: false, substitutionAccepted: choice.substitutionAccepted, omitted: false } satisfies Choice];
        if (skipped?.has(row.id)) return [row.id, { productId: null, selected: false, count: null, changed: false, remember: false, substitutionAccepted: false, omitted: true } satisfies Choice];
        return [row.id, restoreShoppingChoice(row, restored?.[row.id])];
      })));
      setPlan(next);
    }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setError(cause instanceof Error ? cause.message : 'Boodschappen zoeken is niet gelukt.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [recipe, servings, refresh, key, onAuthExpired, purchase, initialDeadlineAt, clientDeadlineAt, initialSavedSelection]);
  useEffect(() => {
    if (plan && plan.servings === servings && !purchase && !loading) localStorage.setItem(key, JSON.stringify({ servings, version: recipe.version, choices }));
  }, [key, plan, choices, servings, recipe.version, purchase, loading]);
  const update = (id: string, change: Partial<Choice>) => { setRememberedStatus(''); setChoices(current => ({ ...current, [id]: { ...current[id], ...change } })); };
  const selected = useMemo(() => (plan?.rows ?? []).flatMap(row => {
    const choice = choices[row.id];
    const candidate = row.candidates.find(item => item.product.id === choice?.productId);
    return choice?.selected && candidate && (candidate.match === 'suitable' || candidate.match === 'substitution' && choice.substitutionAccepted) && choice.count !== null && choice.count >= 1 && Number.isSafeInteger(choice.count) && choice.count <= 10_000 && candidate.product.priceCertainty === 'known' && candidate.product.displayPriceCents !== null
      ? [{ row, choice, candidate }] : [];
  }), [plan, choices]);
  const productCount = new Set(selected.map(item => item.candidate.product.id)).size;
  const total = selected.reduce((sum, item) => sum + item.choice.count! * unitPriceForPacks(item.candidate.product, item.choice.count!)!, 0);
  const missing = plan?.rows.filter(row => !row.pantry && !choices[row.id]?.omitted && !choices[row.id]?.productId) ?? [];
  const unready = plan?.rows.filter(row => (choices[row.id]?.selected || compact && !row.pantry && !choices[row.id]?.omitted && !!choices[row.id]?.productId) && !selected.some(item => item.row.id === row.id)) ?? [];
  const attentionIds = new Set([...missing, ...unready].map(row => row.id));
  const uncounted = plan?.rows.filter(row => choices[row.id]?.selected && !validCount(choices[row.id]?.count)) ?? [];
  const selectionReady = !!plan && selected.length > 0 && missing.length === 0 && unready.length === 0 && uncounted.length === 0;

  function selectionToRemember() {
    if (!plan || !selectionReady) throw new Error('Maak eerst voor ieder ingrediënt een geldige keuze of sla het over.');
    return {
      recipeVersion: recipe.version,
      servings,
      choices: selected.map(({ row, choice, candidate }) => ({ groupId: row.id, productId: candidate.product.id, packCount: choice.count!, substitutionAccepted: choice.substitutionAccepted })).sort((a, b) => a.groupId.localeCompare(b.groupId)),
      skippedGroupIds: plan.rows.filter(row => choices[row.id]?.omitted || row.pantry && !choices[row.id]?.selected).map(row => row.id).sort(),
    };
  }

  async function saveSelection() {
    if (working.current || !selectionReady) return;
    working.current = true; setBusy(true); setError(''); setRememberedStatus('');
    try {
      await api.saveRecipeSelection(recipe.id, selectionToRemember());
      setRememberedStatus('Recept bewaard.');
      setRememberRecipe(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else if (cause instanceof ApiError && cause.code === 'RECIPE_STALE') setError('Het recept is gewijzigd. Haal de boodschappen opnieuw op en bewaar de selectie daarna weer.');
      else setError(cause instanceof Error ? cause.message : 'Je receptkeuzes zijn niet bewaard.');
    } finally { working.current = false; setBusy(false); }
  }

  async function saveBase(event: React.FormEvent) {
    event.preventDefault(); if (!validServings(baseServings) || working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      const updated = await api.updateRecipe(recipe.id, recipe.version, { title: recipe.title, sourceLabel: recipe.sourceLabel, sourceUrl: recipe.sourceUrl,
        baseServings, steps: recipe.steps, ingredients: recipe.ingredients, uploads: recipe.uploads.map(item => item.id) });
      setRecipe(updated.recipe);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bewaren is niet gelukt.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function add() {
    if (working.current || recovering || (!purchase && !selected.length)) return;
    working.current = true; setBusy(true); setError('');
    let intent = purchase ?? readSaved<PendingPurchase>(`${key}:purchase`);
    let savingRemembered = false;
    try {
      if (!intent) {
        if (rememberRecipe) {
          savingRemembered = true;
          await api.saveRecipeSelection(recipe.id, selectionToRemember());
          savingRemembered = false;
          setRememberedStatus('Recept bewaard.');
        }
        const input: ShoppingProposalInput = { requestId: '', recipeId: recipe.id, recipeVersion: recipe.version, servings,
          choices: selected.map(({ row, choice, candidate }) => ({ groupId: row.id, productId: candidate.product.id,
            assessmentId: candidate.assessment?.id, packCount: choice.count!, substitutionAccepted: choice.substitutionAccepted, remember: choice.remember,
            expectedPriceCents: unitPriceForPacks(candidate.product, choice.count!)! })).sort((a, b) => a.groupId.localeCompare(b.groupId)) };
        // Deterministic across tabs/reloads; only an explicit next purchase creates a new round.
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([ownerId, input, localStorage.getItem(`${key}:round`) ?? 'first'])));
        input.requestId = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
        intent = { input }; persistPurchase(intent);
      }
      if (!intent.result) { intent = { ...intent, result: await api.prepareShopping(intent.input) }; persistPurchase(intent); }
      const response = await api.approveProposal(intent.result!.proposal.id, intent.result!.proposal.version);
      persistPurchase({ ...intent, actionId: response.action.id });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else if (savingRemembered) {
        if (cause instanceof ApiError && cause.code === 'RECIPE_STALE') setError('Het recept is gewijzigd. Er is niets toegevoegd. Haal de boodschappen opnieuw op en bewaar de selectie daarna weer.');
        else setError(`Er is niets toegevoegd omdat je receptkeuzes niet bewaard konden worden. ${cause instanceof Error ? cause.message : ''}`.trim());
      }
      // Before proposal creation, explicit 4xx errors prove that no action was sent.
      else if (cause instanceof ApiError && !intent?.result && cause.status >= 400 && cause.status < 500) {
        localStorage.removeItem(`${key}:purchase`); setPurchase(null);
        setError(cause.message);
      } else if (cause instanceof ApiError && cause.status === 409 && intent?.result) {
        try {
          const response = await api.getProposalAction(intent.result.proposal.id);
          persistPurchase({ ...intent, actionId: response.action.id });
        } catch (check) {
          if (check instanceof ApiError && check.status === 404) {
            localStorage.removeItem(`${key}:purchase`); setPurchase(null); setRefresh(value => value + 1);
            setError('Deze bevestiging is verlopen of gewijzigd. Er is niets verstuurd; controleer de actuele selectie.');
          } else setError('De vorige toevoeging kon niet worden gecontroleerd. Hervat dezelfde toevoeging.');
        }
      } else setError(cause instanceof Error ? `${cause.message} Hervat dezelfde toevoeging; die wordt niet dubbel verstuurd.` : 'Uitkomst onbekend. Hervat dezelfde toevoeging.');
    } finally { working.current = false; setBusy(false); }
  }
  function nextPurchase() {
    localStorage.setItem(`${key}:round`, crypto.randomUUID()); localStorage.removeItem(`${key}:purchase`);
    setPurchase(null); setPlan(null); setChoices({}); setRefresh(value => value + 1);
  }
  if (purchase?.actionId) return <section className={`shopping-page ${compact ? 'sp-shopping sp-receipt' : ''}`}><Button variant="ghost" onClick={() => onBack(servings)}><ArrowLeft /> {compact ? 'Boodschappen' : 'Terug naar recept'}</Button>
    {purchase.result?.unavailable.length ? <p role="status" className="shopping-warning">Niet verstuurd; beschikbaarheid kon niet worden bevestigd: {purchase.result.unavailable.map(item => item.name).join(', ')}.</p> : null}
    {!compact && <RecipeFlow current={4} />}<AdditionStatus id={purchase.actionId} onAuthExpired={onAuthExpired} onNewProposal={nextPurchase} shoppingOnly={compact} /></section>;

  const popup = plan?.rows.find(row => row.id === openRow);
  const locked = busy || recovering || !!purchase || loading;
  function choose(row: ShoppingRow, candidate: ShoppingCandidate) {
    update(row.id, { productId: candidate.product.id, count: candidate.packCount, selected: true, changed: true, remember: false,
      omitted: false, substitutionAccepted: candidate.match === 'substitution' });
    setOpenRow(null);
  }
  function renderRow(row: ShoppingRow) {
    const choice = choices[row.id];
    if (!choice) return null;
    const candidate = row.candidates.find(item => item.product.id === choice.productId);
    if (compact) {
      const needsAttention = attentionIds.has(row.id);
      const skipped = choice.omitted || row.pantry && !choice.selected;
      const shown = candidate ?? (skipped ? row.candidates.find(item=>item.product.id===row.selectedProductId) : undefined);
      const needed = row.demand && row.demand.kind !== 'unknown' ? row.demand.kind === 'global' ? 'Naar smaak' : `${shoppingQuantityLabel(row.demand)} nodig` : row.sources.every(source=>quantityLabel(source.quantity,source.originalText)==='Hoeveelheid controleren') ? 'Geen hoeveelheid in de bron' : `${row.sources.map(source=>quantityLabel(source.quantity,source.originalText)).join(' + ')} uit bron`;
      return <li key={row.id} id={`product-${row.id}`} className={`sp-product-tile ${needsAttention ? 'sp-tile-attention' : ''} ${skipped ? 'sp-tile-skipped' : ''}`}>
        <div className="sp-product-visual">
          {shown ? <ProductImage product={shown.product}/> : <span className="sp-product-placeholder" aria-hidden="true">{skipped?<Check size={24}/>:<ShoppingBasket size={24}/>}</span>}
          {!skipped && candidate && <QuantityStepper id={`count-${row.id}`} label={row.name} value={choice.count} max={candidate.product.maxCount ?? 10000} disabled={locked} onChange={count => update(row.id,{count,countChanged:true,selected:true})}/>}
        </div>
        <div className="sp-product-info">
          {needsAttention && <span className="sp-attention-label">{!candidate ? 'Product kiezen' : !validCount(choice.count) ? 'Aantal kiezen' : 'Keuze controleren'}</span>}
          <button type="button" id={`choose-${row.id}`} className="sp-product-choice" disabled={locked || skipped} onClick={() => {returnProductFocus.current=row.id;setOpenRow(row.id);}} aria-label={`Product kiezen voor ${row.name}`}><strong>{shown?.product.name ?? row.name}</strong>{!skipped && <ChevronRight size={15} aria-hidden="true"/>}</button>
          {shown && <ProductPrice product={{...shown.product,displayPriceCents:validCount(choice.count) ? unitPriceForPacks(shown.product,choice.count) : shown.product.displayPriceCents}}/>}
          <p className="sp-product-measure">{shown?.product.unitQuantity && <span>{shown.product.unitQuantity} · </span>}{needed}</p>
          {!skipped && !candidate && <button className="sp-match-action" type="button" disabled={locked} onClick={()=>{returnProductFocus.current=row.id;setOpenRow(row.id);}}>{row.error ? 'Opnieuw kiezen' : 'Kies een product'}<ChevronRight size={14}/></button>}
          {!skipped && candidate && !validCount(choice.count) && <p className="sp-count-needed">Kies het aantal verpakkingen</p>}
          <div className="sp-row-actions"><button type="button" className="sp-in-house" aria-label={`${skipped ? 'Toch nodig' : 'Heb ik al'}: ${row.name}`} aria-pressed={skipped} disabled={locked} onClick={() => update(row.id, skipped ? { ...restoreShoppingChoice({...row,pantry:false}), omitted:false } : {omitted:true,selected:false,remember:false})}><span aria-hidden="true">{skipped && <Check size={12}/>}</span>{skipped?'Toch toevoegen':'Heb ik al'}</button><button type="button" id={`edit-${row.sources[0].id}`} className="sp-edit-ingredient" disabled={locked || !onEditIngredient} aria-label={`Ingrediënt aanpassen: ${row.name}`} onClick={() => onEditIngredient?.(row.sources)}><Pencil size={17} aria-hidden="true"/></button></div>
          {!skipped && candidate?.estimates.length ? <details className="sp-tile-estimate"><summary>Berekening bekijken</summary>{candidate.estimates.map(note=><p key={note}>{note}</p>)}</details> : null}
          {!skipped && choice.changed && candidate?.match === 'suitable' && <label className="sp-remember"><input type="checkbox" checked={choice.remember} disabled={locked} onChange={event=>update(row.id,{remember:event.target.checked})}/>Onthoud dit product</label>}
          {candidate?.match === 'substitution' && <span className="sp-substitution">Zelf gekozen vervanging</span>}
        </div>
      </li>;
    }
    return <li key={row.id} className={`shopping-row ${choice.selected ? '' : 'shopping-row-unselected'}`}>
      <div className="shopping-ingredient"><input type="checkbox" aria-label={`${row.name} toevoegen`} checked={choice.selected} disabled={locked || !candidate} onChange={event => update(row.id, { selected: event.target.checked, omitted: !event.target.checked })} />
        <div><strong>{row.name}</strong><span className="shopping-source">{sourceText(row)}</span>
          {row.sources.length > 1 && <small>{row.sources.length} bronregels samengeteld</small>}
          {row.demand && row.demand.kind !== 'unknown' && <small className="shopping-demand">{quantityLabel(row.demand)} nodig voor {servings} personen</small>}
          <button type="button" className="shopping-omit" disabled={locked} aria-pressed={!!choice.omitted} onClick={() => update(row.id, choice.omitted ? { ...restoreShoppingChoice(row), omitted: false } : { omitted: true, selected: false, remember: false })}>{choice.omitted ? 'Toch nodig' : 'Heb ik al'}</button>
          {choice.omitted && <small>Wordt overgeslagen</small>}
        </div>
      </div>
      {!choice.omitted && <div className="shopping-product" id={`product-${row.id}`}>
        <button type="button" className="shopping-product-open" disabled={locked} onClick={() => setOpenRow(row.id)} aria-label={`Product kiezen voor ${row.name}`}>
          {candidate ? <ProductSummary product={candidate.product} /> : <span><strong>{choice.note ?? row.error ?? 'Geen passende match'}</strong><span>Bekijk alternatieven</span></span>}<span className="shopping-change">Ander product<ChevronDown size={16} aria-hidden="true" /></span>
        </button>
        {candidate && <>
          <div className="shopping-count"><label htmlFor={`count-${row.id}`}>Verpakkingen</label><QuantityStepper id={`count-${row.id}`} label={row.name} value={choice.count} max={candidate.product.maxCount ?? 10000} disabled={locked} onChange={count => update(row.id, { count, countChanged: true })} />
            <strong>{choice.count && candidate.product.displayPriceCents !== null ? euro(choice.count * unitPriceForPacks(candidate.product, choice.count)!) : 'Kies aantal'}</strong></div>
          {candidate.match === 'substitution' && <small className="shopping-warning">Zelf gekozen vervanging · controleer of deze past.</small>}
          {candidate.estimates.length > 0 && <details className="shopping-estimate"><summary>{candidate.estimates.some(note => /schat/i.test(note)) ? 'Aantal op basis van schatting' : 'Berekening bekijken'}</summary>{candidate.estimates.map(note => <p key={note}>{note}</p>)}</details>}
          {row.preferred && !choice.changed && <small>Jouw onthouden keuze</small>}
          {choice.changed && candidate.match === 'suitable' && <label className="shopping-remember"><input type="checkbox" checked={choice.remember} disabled={locked} onChange={event => update(row.id, { remember: event.target.checked })} /> Onthoud mijn keuze voor dit ingrediënt</label>}
        </>}
      </div>}
    </li>;
  }
  return <article className={`shopping-page ${compact ? 'sp-shopping' : ''}`} aria-labelledby="shopping-title">
    <Button variant="ghost" onClick={() => onBack(servings)}><ArrowLeft aria-hidden="true" /> {compact ? 'Boodschappen' : 'Terug naar recept'}</Button>
    {!compact && <RecipeFlow current={3} />}<header className="shopping-heading"><p className="eyebrow">{compact ? 'Controleer je boodschappen' : 'Jouw boodschappen'}</p><h1 id="shopping-title">{recipe.title}</h1>
      {!compact && <p>Passende producten voor je recept. Vink uit wat je al hebt en pas aan wat je wilt.</p>}
      <div className="shopping-servings"><label htmlFor="shopping-servings">Personen</label><QuantityStepper id="shopping-servings" label="personen" inputLabel="Personen" max={1000} value={servings ? Number(servings) : null} disabled={busy || recovering || !!purchase} onChange={value => {setRememberedStatus('');setServings(value === null ? '' : String(value));}} /></div>
    </header>
    {error && <p role="alert" className="recipe-error">{error}</p>}
    {!validServings(recipe.baseServings) && <form className="panel form-stack" onSubmit={saveBase}><label htmlFor="shopping-base">Voor hoeveel personen is het oorspronkelijke recept?</label><input id="shopping-base" type="number" min="1" max="1000" required value={baseServings} onChange={event => setBaseServings(event.target.value)} /><Button disabled={busy || !validServings(baseServings)}>Bereken mijn boodschappen</Button></form>}
    {loading && (compact ? <ShoppingProgress stage="products" compact source={recipe.title}/> : <div className="shopping-loading"><div className="shopping-loading-status" role="status"><LoaderCircle className="animate-spin" aria-hidden="true" /><div><strong>Je boodschappen worden gezocht</strong><p>{elapsed >= 8 ? 'Dit duurt wat langer. Je recept blijft bewaard; je kunt teruggaan.' : 'We controleren passende producten, verpakkingen en prijzen.'}</p></div><span aria-hidden="true">{elapsed}s</span></div><ul className="shopping-skeleton" aria-hidden="true">{recipe.ingredients.slice(0, 4).map(item => <li key={item.id}><span>{item.originalText}</span><div><i /><i /></div></li>)}</ul></div>)}
    {!loading && !plan && !purchase && validServings(recipe.baseServings) && <Button variant="outline" disabled={!validServings(servings)} onClick={() => setRefresh(value => value + 1)}>Boodschappen ophalen</Button>}
    {plan && !loading && <>
      {!compact && (missing.length > 0 || unready.length > 0) && <div className="shopping-review-summary" role="status"><strong>{missing.length + unready.length} {missing.length + unready.length === 1 ? 'ingrediënt vraagt' : 'ingrediënten vragen'} je aandacht</strong>{!compact && <p>Kies een product en aantal, of geef aan wat je al hebt.</p>}{compact ? <button type="button" onClick={()=>setFilter('attention')}>Maak je keuzes <ChevronRight size={14}/></button> : <a href={`#product-${(missing[0] ?? unready[0]).id}`}>Bekijk eerste aandachtspunt</a>}</div>}
      {compact && <div className="sp-filter-bar" role="group" aria-label="Boodschappenfilter"><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Alles <span>{plan.rows.length}</span></button><button type="button" className={missing.length+unready.length ? 'sp-filter-attention' : undefined} aria-pressed={filter==='attention'} onClick={()=>setFilter('attention')}>Te kiezen <span>{missing.length+unready.length}</span></button><button type="button" aria-pressed={filter==='skipped'} onClick={()=>setFilter('skipped')}>Heb ik al <span>{plan.rows.filter(row=>choices[row.id]?.omitted || row.pantry&&!choices[row.id]?.selected).length}</span></button></div>}
      <div className="shopping-column-labels" aria-hidden="true"><span>Ingrediënt</span><span>Picnic-product</span></div>
      <ul className={compact ? 'sp-product-grid' : 'shopping-list'}>{plan.rows.filter(row => compact ? filter==='attention' ? missing.some(item=>item.id===row.id)||unready.some(item=>item.id===row.id) : filter==='skipped' ? choices[row.id]?.omitted||row.pantry&&!choices[row.id]?.selected : !(choices[row.id]?.omitted||row.pantry&&!choices[row.id]?.selected) : !row.pantry).sort((a,b)=>compact ? Number(attentionIds.has(b.id))-Number(attentionIds.has(a.id)) : 0).map(renderRow)}</ul>{compact && filter==='attention' && !missing.length && !unready.length && <p className="sp-filter-empty"><Check size={22}/>Alles is gekozen. Je boodschappen staan klaar.</p>}
      {compact && filter==='all' && plan.rows.some(row=>choices[row.id]?.omitted||row.pantry&&!choices[row.id]?.selected) && <section className="sp-pantry"><h2>Uit eigen keuken</h2><p>Deze producten slaan we over. Voeg toe als je ze nodig hebt.</p><ul className="sp-product-grid">{plan.rows.filter(row=>choices[row.id]?.omitted||row.pantry&&!choices[row.id]?.selected).map(renderRow)}</ul></section>}
      {!compact && plan.rows.some(row => row.pantry) && <section className="shopping-pantry"><h2>Waarschijnlijk in je keukenkastje</h2><p>Zout, zwarte peper en gewone bakolie staan uit. Vink ze aan als je ze nodig hebt.</p><ul className="shopping-list">{plan.rows.filter(row => row.pantry).map(renderRow)}</ul></section>}
      <div className="shopping-footer">
        {compact && plan && <div className="sp-remember-recipe-control"><label><input type="checkbox" checked={rememberRecipe} disabled={locked} onChange={event=>{setRememberRecipe(event.target.checked);setRememberedStatus('');}}/><span>Herinner recept voor een andere keer</span></label><Button variant="outline" disabled={locked || !selectionReady} onClick={()=>void saveSelection()}>Bewaar selectie</Button>{rememberedStatus&&<p role="status">{rememberedStatus}</p>}{!selectionReady&&<small>Maak voor ieder ingrediënt een keuze of sla het over om te bewaren.</small>}</div>}
        {!compact && missing.length > 0 && <p className="shopping-warning" role="status">Nog geen passende match: {missing.map(row => row.name).join(', ')}. Kies een product of geef aan dat je dit al hebt.</p>}
        {uncounted.length > 0 && <p className="shopping-warning">Geen aantal gekozen: {uncounted.map(row => row.name).join(', ')}. Vul een geldig aantal in.</p>}
        <div className="shopping-checkout" role="region" aria-label="Geselecteerde boodschappen"><span><strong>{euro(total)}</strong><small>{selected.reduce((sum, item) => sum + item.choice.count!, 0)} verpakkingen · {productCount} {productCount === 1 ? 'product' : 'producten'}</small>{compact && (missing.length > 0 || unready.length > 0) && <small className="sp-checkout-reason">Nog {missing.length + unready.length} {missing.length + unready.length === 1 ? 'keuze' : 'keuzes'} nodig</small>}</span>
          <Button size="lg" disabled={locked || !productCount || missing.length > 0 || unready.length > 0 || !validServings(servings) || plan.servings !== servings} onClick={() => void add()}><ShoppingBasket aria-hidden="true" /> {busy ? 'Toevoegen…' : compact ? 'Zet in Picnic-mandje' : `Voeg toe aan Picnic (${productCount})`}</Button></div>
        <p className="subtle">Toevoegen aan je bestaande mandje. Bestellen en betalen doe je in Picnic.</p>
        <Button variant="link" disabled={locked} onClick={() => setRefresh(value => value + 1)}>{compact && <RefreshCw size={14}/>}Producten en prijzen vernieuwen</Button>
      </div>
    </>}
    {purchase && !purchase.actionId && <section className="panel" role="status">{compact && busy && <ShoppingLoader/>}<p>{busy ? 'Je selectie wordt gecontroleerd en toegevoegd…' : 'Je bevestiging is bewaard. Hervat dezelfde toevoeging om veilig verder te gaan.'}</p><Button disabled={busy || recovering} onClick={() => void add()}>{busy ? 'Bezig…' : 'Hervat dezelfde toevoeging'}</Button></section>}
    <Dialog open={!!popup} onOpenChange={open => { if (!open) setOpenRow(null); }}><DialogContent onCloseAutoFocus={event=>{if(compact){event.preventDefault();(document.getElementById(`choose-${returnProductFocus.current}`) ?? document.querySelector<HTMLButtonElement>('.sp-filter-bar button[aria-pressed="true"]'))?.focus();}}} className={`shopping-dialog ${compact ? 'sp-sheet sp-product-sheet' : ''}`}><DialogHeader><DialogTitle>{popup?.name}</DialogTitle><DialogDescription>{popup ? sourceText(popup) : ''}</DialogDescription></DialogHeader>
      {compact && popup && !popup.candidates.length && <p>Er is geen product gevonden. Sluit dit venster en geef aan of je dit ingrediënt al hebt.</p>}
      {popup?.candidatesTruncated && <p className="subtle">Een deel van de zoekresultaten is bekeken; dit is geen volledig assortiment.</p>}
      {popup && <div className="shopping-alternatives">{(['suitable', 'substitution', 'unresolved'] as const).filter(match => !compact || popup.candidates.some(item => item.match === match)).map(match => <section key={match}><h3>{match === 'suitable' ? 'Passende alternatieven' : match === 'substitution' ? 'Mogelijke vervangingen · zelf beoordelen' : 'Nog onvoldoende informatie'}</h3>
        {!popup.candidates.some(item => item.match === match) && <p>Geen resultaten gevonden.</p>}
        <ProductRail label={`Producten voor ${popup.name}: ${match === 'suitable' ? 'passend' : match === 'substitution' ? 'vervangingen' : 'onbeoordeeld'}`}>
          {popup.candidates.filter(item => item.match === match).map(item => <ProductCard key={item.product.id} product={item.product}
            selected={choices[popup.id]?.productId === item.product.id}
            disabled={locked || match === 'unresolved' || item.product.isAvailable === false || item.product.maxCount === 0 || item.product.priceCertainty !== 'known' || item.product.quantity?.kind !== 'exact'}
            onChoose={() => choose(popup, item)} action={match === 'substitution' ? 'Kies deze vervanging' : 'Kies dit product'} note={item.assessment?.reason}>
            {item.packCount && item.totalPriceCents !== null ? `${item.packCount} verpakkingen · ${euro(item.totalPriceCents)} ${compact ? 'totaal' : 'voor je recept'}` : 'Kies het aantal na selectie'}
          </ProductCard>)}
        </ProductRail>
      </section>)}</div>}
    </DialogContent></Dialog>
  </article>;
}
