import { restoreShoppingChoice, type ShoppingChoiceState as Choice } from '@/lib/shopping-choice';
import { unitPriceForPacks } from '../../shared/product-pricing';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RecipeDto } from '../../shared/recipes';
import type { ShoppingCandidate, ShoppingPlan, ShoppingProposalInput, ShoppingProposalResult, ShoppingRow } from '../../shared/shopping';
import { validServings } from '../../worker/domain/shopping';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdditionStatus } from '@/components/AdditionStatus';
import { ArrowLeft, ChevronDown, LoaderCircle, ShoppingBasket } from 'lucide-react';

type PendingPurchase = { input: ShoppingProposalInput; result?: ShoppingProposalResult; actionId?: string };
const euro = (cents: number) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
function readSaved<T>(key: string): T | null { try { return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; } catch { return null; } }
const validCount = (count: number | null | undefined): count is number => Number.isSafeInteger(count) && count! >= 1 && count! <= 10_000;
const sourceText = (row: ShoppingRow) => [...new Set(row.sources.map(source => source.originalText))].join(' + ');

export function RecipeProducts({ recipe: originalRecipe, ownerId, initialServings, initialDeadlineAt, clientDeadlineAt, onBack, onAuthExpired }: {
  recipe: RecipeDto; ownerId: string; initialServings: string; initialDeadlineAt?: number; clientDeadlineAt?: number; onBack: () => void; onAuthExpired: () => void;
}) {
  const key = `picnic:shopping:${ownerId}:${originalRecipe.id}`;
  const [recipe, setRecipe] = useState(originalRecipe);
  const [servings, setServings] = useState(() => readSaved<{ servings: string }>(key)?.servings ?? initialServings);
  const [baseServings, setBaseServings] = useState('');
  const [plan, setPlan] = useState<ShoppingPlan | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [openRow, setOpenRow] = useState<string | null>(null);
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
      const restored = saved?.servings === servings && saved.version === recipe.version ? saved.choices : {};
      setChoices(Object.fromEntries(next.rows.map(row => [row.id, restoreShoppingChoice(row, restored?.[row.id])])));
      setPlan(next);
    }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setError(cause instanceof Error ? cause.message : 'Boodschappen zoeken is niet gelukt.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [recipe, servings, refresh, key, onAuthExpired, purchase, initialDeadlineAt, clientDeadlineAt]);
  useEffect(() => {
    if (plan && plan.servings === servings && !purchase && !loading) localStorage.setItem(key, JSON.stringify({ servings, version: recipe.version, choices }));
  }, [key, plan, choices, servings, recipe.version, purchase, loading]);
  const update = (id: string, change: Partial<Choice>) => setChoices(current => ({ ...current, [id]: { ...current[id], ...change } }));
  const selected = useMemo(() => (plan?.rows ?? []).flatMap(row => {
    const choice = choices[row.id];
    const candidate = row.candidates.find(item => item.product.id === choice?.productId);
    return choice?.selected && candidate && (candidate.match === 'suitable' || candidate.match === 'substitution' && choice.substitutionAccepted) && choice.count !== null && choice.count >= 1 && Number.isSafeInteger(choice.count) && choice.count <= 10_000 && candidate.product.priceCertainty === 'known' && candidate.product.displayPriceCents !== null
      ? [{ row, choice, candidate }] : [];
  }), [plan, choices]);
  const productCount = new Set(selected.map(item => item.candidate.product.id)).size;
  const total = selected.reduce((sum, item) => sum + item.choice.count! * unitPriceForPacks(item.candidate.product, item.choice.count!)!, 0);
  const missing = plan?.rows.filter(row => !row.pantry && !choices[row.id]?.productId) ?? [];
  const uncounted = plan?.rows.filter(row => choices[row.id]?.selected && !validCount(choices[row.id]?.count)) ?? [];

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
    try {
      if (!intent) {
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
  if (purchase?.actionId) return <section className="shopping-page"><Button variant="ghost" onClick={onBack}><ArrowLeft /> Alle recepten</Button>
    {purchase.result?.unavailable.length ? <p role="status" className="shopping-warning">Niet verstuurd; beschikbaarheid kon niet worden bevestigd: {purchase.result.unavailable.map(item => item.name).join(', ')}.</p> : null}
    <AdditionStatus id={purchase.actionId} onAuthExpired={onAuthExpired} onNewProposal={nextPurchase} /></section>;

  const popup = plan?.rows.find(row => row.id === openRow);
  const locked = busy || recovering || !!purchase;
  function choose(row: ShoppingRow, candidate: ShoppingCandidate) {
    update(row.id, { productId: candidate.product.id, count: candidate.packCount, selected: true, changed: true, remember: false,
      substitutionAccepted: candidate.match === 'substitution' });
    setOpenRow(null);
  }
  function renderRow(row: ShoppingRow) {
    const choice = choices[row.id];
    if (!choice) return null;
    const candidate = row.candidates.find(item => item.product.id === choice.productId);
    return <li key={row.id} className={`shopping-row ${choice.selected ? '' : 'shopping-row-unselected'}`}>
      <div className="shopping-ingredient"><input type="checkbox" aria-label={`${row.name} toevoegen`} checked={choice.selected} disabled={locked || !candidate} onChange={event => update(row.id, { selected: event.target.checked })} />
        <div><strong>{row.name}</strong><span className="shopping-source">{sourceText(row)}</span>
          {row.sources.length > 1 && <small>{row.sources.length} bronregels samengeteld</small>}
          {row.demand && <small>Voor {servings} personen: {row.demand.amount} {row.demand.unit === 'piece' ? 'stuks' : row.demand.unit}</small>}
        </div>
      </div>
      <div className="shopping-product">
        <button type="button" className="shopping-product-open" disabled={locked} onClick={() => setOpenRow(row.id)} aria-label={`Product kiezen voor ${row.name}`}>
          <span><strong>{candidate?.product.name ?? (choice.note ?? row.error ?? 'Geen passende match')}</strong><span>{candidate ? `${candidate.product.unitQuantity} · ${candidate.product.displayPriceCents === null ? 'Prijs onbekend' : euro(candidate.product.displayPriceCents)}` : 'Bekijk alternatieven'}</span></span><ChevronDown size={18} />
        </button>
        {candidate && <>
          <div className="shopping-count"><label htmlFor={`count-${row.id}`}>Verpakkingen</label><input id={`count-${row.id}`} aria-label={`Aantal verpakkingen ${row.name}`} type="number" min="1" max={candidate.product.maxCount ?? 10000} value={choice.count ?? ''} placeholder="Aantal" disabled={locked} onChange={event => update(row.id, { count: event.target.value ? Number(event.target.value) : null, countChanged: true })} />
            <strong>{choice.count && candidate.product.displayPriceCents !== null ? euro(choice.count * unitPriceForPacks(candidate.product, choice.count)!) : 'Kies aantal'}</strong></div>
          {candidate.match === 'substitution' && <small className="shopping-warning">Zelf gekozen vervanging · controleer of deze past.</small>}
          {candidate.estimates.length > 0 && <details className="shopping-estimate"><summary>{candidate.estimates.some(note => /schat/i.test(note)) ? 'Aantal op basis van schatting' : 'Berekening bekijken'}</summary>{candidate.estimates.map(note => <p key={note}>{note}</p>)}</details>}
          {row.preferred && !choice.changed && <small>Jouw onthouden keuze</small>}
          {choice.changed && candidate.match === 'suitable' && <label className="shopping-remember"><input type="checkbox" checked={choice.remember} disabled={locked} onChange={event => update(row.id, { remember: event.target.checked })} /> Onthoud mijn keuze voor dit ingrediënt</label>}
        </>}
      </div>
    </li>;
  }
  return <article className="shopping-page" aria-labelledby="shopping-title">
    <Button variant="ghost" onClick={onBack}><ArrowLeft aria-hidden="true" /> Alle recepten</Button>
    <header className="shopping-heading"><p className="eyebrow">Jouw boodschappen</p><h1 id="shopping-title">{recipe.title}</h1>
      <p>Passende producten voor je recept. Vink uit wat je al hebt en pas aan wat je wilt.</p>
      <label className="shopping-servings" htmlFor="shopping-servings">Personen <input id="shopping-servings" type="number" min="1" max="1000" value={servings} disabled={locked} onChange={event => setServings(event.target.value)} /></label>
    </header>
    {error && <p role="alert" className="recipe-error">{error}</p>}
    {!validServings(recipe.baseServings) && <form className="panel form-stack" onSubmit={saveBase}><label htmlFor="shopping-base">Voor hoeveel personen is het oorspronkelijke recept?</label><input id="shopping-base" type="number" min="1" max="1000" required value={baseServings} onChange={event => setBaseServings(event.target.value)} /><Button disabled={busy || !validServings(baseServings)}>Bereken mijn boodschappen</Button></form>}
    {loading && <div className="shopping-loading" role="status"><LoaderCircle className="animate-spin" /> We zoeken passende producten en vergelijken verpakkingen…</div>}
    {!loading && !plan && !purchase && validServings(recipe.baseServings) && <Button variant="outline" disabled={!validServings(servings)} onClick={() => setRefresh(value => value + 1)}>Boodschappen ophalen</Button>}
    {plan && <>
      <div className="shopping-column-labels" aria-hidden="true"><span>Ingrediënt</span><span>Picnic-product</span></div>
      <ul className="shopping-list">{plan.rows.filter(row => !row.pantry).map(renderRow)}</ul>
      {plan.rows.some(row => row.pantry) && <section className="shopping-pantry"><h2>Waarschijnlijk in je keukenkastje</h2><p>Zout, zwarte peper en gewone bakolie staan uit. Vink ze aan als je ze nodig hebt.</p><ul className="shopping-list">{plan.rows.filter(row => row.pantry).map(renderRow)}</ul></section>}
      <div className="shopping-footer">
        {missing.length > 0 && <p className="shopping-warning" role="status">Nog geen passende match: {missing.map(row => row.name).join(', ')}. Deze ingrediënten gaan niet mee.</p>}
        {uncounted.length > 0 && <p className="shopping-warning">Geen aantal gekozen: {uncounted.map(row => row.name).join(', ')}. Deze regels gaan niet mee.</p>}
        <div className="shopping-checkout"><span><strong>{euro(total)}</strong><small>{selected.reduce((sum, item) => sum + item.choice.count!, 0)} verpakkingen · {productCount} {productCount === 1 ? 'product' : 'producten'}</small></span>
          <Button size="lg" disabled={locked || !productCount || loading || !validServings(servings) || plan.servings !== servings} onClick={() => void add()}><ShoppingBasket aria-hidden="true" /> {busy ? 'Toevoegen…' : `Voeg ${productCount} ${productCount === 1 ? 'product' : 'producten'} toe`}</Button></div>
        <p className="subtle">Toevoegen aan je bestaande mandje. Bestellen en betalen doe je in Picnic.</p>
        <Button variant="link" disabled={locked} onClick={() => setRefresh(value => value + 1)}>Producten en prijzen vernieuwen</Button>
      </div>
    </>}
    {purchase && !purchase.actionId && <section className="panel" role="status"><p>{busy ? 'Je selectie wordt gecontroleerd en toegevoegd…' : 'Je bevestiging is bewaard. Hervat dezelfde toevoeging om veilig verder te gaan.'}</p><Button disabled={busy || recovering} onClick={() => void add()}>{busy ? 'Bezig…' : 'Hervat dezelfde toevoeging'}</Button></section>}
    <Dialog open={!!popup} onOpenChange={open => { if (!open) setOpenRow(null); }}><DialogContent className="shopping-dialog"><DialogHeader><DialogTitle>{popup?.name}</DialogTitle><DialogDescription>{popup ? sourceText(popup) : ''}</DialogDescription></DialogHeader>
      {popup?.candidatesTruncated && <p className="subtle">Een deel van de zoekresultaten is bekeken; dit is geen volledig assortiment.</p>}
      {popup && <div className="shopping-alternatives">{(['suitable', 'substitution', 'unresolved'] as const).map(match => <section key={match}><h3>{match === 'suitable' ? 'Passende alternatieven' : match === 'substitution' ? 'Mogelijke vervangingen · zelf beoordelen' : 'Nog onvoldoende informatie'}</h3>
        {!popup.candidates.some(item => item.match === match) && <p>Geen resultaten gevonden.</p>}
        {popup.candidates.filter(item => item.match === match).map(item => <button key={item.product.id} type="button" disabled={match === 'unresolved' || item.product.priceCertainty !== 'known' || item.product.quantity?.kind !== 'exact'} onClick={() => choose(popup, item)}>
          <strong>{item.product.name}</strong>{item.product.brand && <small>{item.product.brand}</small>}<span>{item.product.unitQuantity} · {item.product.displayPriceCents === null ? 'Prijs onbekend' : euro(item.product.displayPriceCents)}</span>
          <span>{item.packCount ? `${item.packCount} verpakkingen · ${euro(item.totalPriceCents ?? 0)}` : 'Kies het aantal na selectie'}</span>{item.assessment && <small>{item.assessment.reason}</small>}<b>{match === 'suitable' ? 'Kies dit product' : match === 'substitution' ? 'Kies deze vervanging' : 'Niet geselecteerd'}</b>
        </button>)}
      </section>)}</div>}
    </DialogContent></Dialog>
  </article>;
}
