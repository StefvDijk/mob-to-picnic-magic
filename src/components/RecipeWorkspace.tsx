import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, type MeDto, type RecipeInputDto } from '@/lib/api';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';
import type { Quantity, QuantityUnit } from '../../shared/quantities';
import { parseQuantity, parseRational } from '../../shared/quantities';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type IngredientDraft = {
  originalText: string; normalizedName: string; section: string; kind: Quantity['kind']; amount: string; maximum: string;
  unit: QuantityUnit; basis: 'net' | 'drained' | ''; sourceOrigin: RecipeIngredientDto['sourceOrigin'];
  attributes: Record<string, unknown>; uncertainty: string[];
};
type Draft = { title: string; sourceLabel: string; sourceUrl: string; baseServings: string; steps: string[]; uploads: string[]; ingredients: IngredientDraft[] };
type View = 'list' | 'detail' | 'edit';
const EMPTY_INGREDIENT: IngredientDraft = { originalText: '', normalizedName: '', section: '', kind: 'unknown', amount: '', maximum: '', unit: 'g', basis: '', sourceOrigin: 'user', attributes: {}, uncertainty: [] };
const freshDraft = (): Draft => ({ title: '', sourceLabel: '', sourceUrl: '', baseServings: '', steps: [], uploads: [], ingredients: [{ ...EMPTY_INGREDIENT }] });
const unitNames: Record<QuantityUnit, string> = { g: 'gram', kg: 'kilogram', ml: 'milliliter', l: 'liter', piece: 'stuk' };

function restoredDraft(value: Draft & { stepsText?: string; uploadsText?: string }): Draft {
  return { ...value,
    steps: Array.isArray(value.steps) ? value.steps : typeof value.stepsText === 'string' ? value.stepsText.split(/\n\s*\n/).filter(Boolean) : [],
    uploads: Array.isArray(value.uploads) ? value.uploads : typeof value.uploadsText === 'string' ? value.uploadsText.split(/\n|,/).map(id => id.trim()).filter(Boolean) : [],
  };
}

function fromRecipe(recipe: RecipeDto): Draft {
  return { title: recipe.title, sourceLabel: recipe.sourceLabel ?? '', sourceUrl: recipe.sourceUrl ?? '', baseServings: recipe.baseServings ?? '',
    steps: [...recipe.steps], uploads: recipe.uploads.map(upload => upload.id),
    ingredients: recipe.ingredients.length ? recipe.ingredients.map(item => ({
      originalText: item.originalText, normalizedName: item.normalizedName ?? '', section: item.section ?? '', kind: item.quantity.kind,
      amount: item.quantity.amount ?? '', maximum: item.quantity.maximum ?? '', unit: item.quantity.unit ?? 'g', basis: item.quantity.basis ?? '',
      sourceOrigin: item.sourceOrigin, attributes: item.attributes, uncertainty: item.uncertainty,
    })) : [{ ...EMPTY_INGREDIENT }] };
}
function quantityFor(item: IngredientDraft): Quantity | null {
  const raw: Quantity = item.kind === 'global' || item.kind === 'unknown' ? { kind: item.kind, basis: item.basis || null }
    : { kind: item.kind, amount: item.amount, ...(item.kind === 'range' ? { maximum: item.maximum } : {}), unit: item.unit, basis: item.basis || null };
  return parseQuantity(raw);
}
function inputFromDraft(draft: Draft): RecipeInputDto | null {
  const servings = draft.baseServings.trim();
  if (servings && (!parseRational(servings) || parseRational(servings)!.numerator <= 0)) return null;
  const ingredients = draft.ingredients.filter(item => item.originalText.trim()).map(item => {
    const quantity = quantityFor(item);
    if (!quantity) return null;
    return { originalText: item.originalText.trim(), normalizedName: item.normalizedName.trim() || null,
      section: item.section.trim() || null, quantity, sourceOrigin: item.sourceOrigin,
      attributes: item.attributes, uncertainty: item.uncertainty };
  });
  if (ingredients.some(item => item === null)) return null;
  const uploads = draft.uploads;
  if (new Set(uploads).size !== uploads.length) return null;
  return { title: draft.title.trim(), sourceLabel: draft.sourceLabel.trim() || null, sourceUrl: draft.sourceUrl.trim() || null,
    baseServings: servings || null, steps: draft.steps.map(step => step.trim()).filter(Boolean),
    ingredients: ingredients as RecipeInputDto['ingredients'], uploads };
}
function formatQuantity(quantity: Quantity): string {
  if (quantity.kind === 'global') return 'Naar behoefte';
  if (quantity.kind === 'unknown') return 'Hoeveelheid onbekend';
  const amount = `${quantity.amount} ${unitNames[quantity.unit!]}`;
  return quantity.kind === 'range' ? `${amount} tot ${quantity.maximum} ${unitNames[quantity.unit!]}` : amount;
}

export function RecipeWorkspace({ me, onAuthExpired }: { me: MeDto; onAuthExpired: () => void }) {
  const draftKey = `picnic:recipe-draft:${me.account.id}`;
  const [recipes, setRecipes] = useState<RecipeDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<RecipeDto | null>(null);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<RecipeDto | null>(null);
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);

  const load = useCallback(async (pageCursor?: string | null) => {
    setLoading(true); setError('');
    try {
      const result = await api.listRecipes(pageCursor ?? undefined);
      setRecipes(current => pageCursor ? [...current, ...result.recipes] : result.recipes);
      setCursor(pageCursor ?? null); setNextCursor(result.nextCursor);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { onAuthExpired(); return; }
      setError(cause instanceof Error ? cause.message : 'Recepten laden is niet gelukt.');
    } finally { setLoading(false); }
  }, [onAuthExpired]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) { const parsed = JSON.parse(saved) as { draft?: Draft; recipeId?: string | null; version?: number | null };
        if (parsed.draft) { setDraft(restoredDraft(parsed.draft)); setEditVersion(parsed.version ?? null); setView('edit'); setRestored(true);
          if (parsed.recipeId) { setRestoreTargetId(parsed.recipeId); void api.getRecipe(parsed.recipeId).then(result => { setSelected(result.recipe); setRestoreTargetId(null); }).catch(cause => {
            if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
            else setError('Het recept bij je concept kon niet worden geladen. Je wijzigingen zijn bewaard.');
          }); }
        }
      }
    } catch { sessionStorage.removeItem(draftKey); }
  // Restore once for the account represented by this mounted workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, onAuthExpired]);
  useEffect(() => {
    if (view === 'edit') sessionStorage.setItem(draftKey, JSON.stringify({ draft, recipeId: selected?.id ?? restoreTargetId, version: editVersion }));
  }, [draft, draftKey, selected, restoreTargetId, editVersion, view]);

  const visibleRecipes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('nl');
    return needle ? recipes.filter(recipe => `${recipe.title} ${recipe.sourceLabel ?? ''} ${recipe.ingredients.map(item => item.originalText).join(' ')}`.toLocaleLowerCase('nl').includes(needle)) : recipes;
  }, [recipes, query]);
  const edit = (recipe: RecipeDto | null) => {
    let preserved: { draft: Draft; recipeId: string | null; version: number | null } | null = null;
    try { const saved = sessionStorage.getItem(draftKey); if (saved) preserved = JSON.parse(saved); } catch { /* Ignore corrupt local draft. */ }
    if (preserved?.draft && (preserved.recipeId ?? null) !== (recipe?.id ?? null) &&
        !window.confirm('Je hebt nog een onafgemaakt concept. Als je nu een ander recept opent, wordt dat concept vervangen. Doorgaan?')) return;
    setSelected(recipe); setRestoreTargetId(null);
    if (preserved?.draft && (preserved.recipeId ?? null) === (recipe?.id ?? null)) {
      setDraft(restoredDraft(preserved.draft)); setEditVersion(preserved.version); setRestored(true);
    } else {
      setDraft(recipe ? fromRecipe(recipe) : freshDraft()); setEditVersion(recipe?.version ?? null); setRestored(false);
    }
    setConflict(false); setLatest(null); setError(''); setNotice(''); setView('edit');
  };
  const openRecipe = async (recipe: RecipeDto) => {
    setPending(true); setError('');
    try { const result = await api.getRecipe(recipe.id); setSelected(result.recipe); setView('detail'); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onAuthExpired(); else setError(cause instanceof Error ? cause.message : 'Recept laden is niet gelukt.'); }
    finally { setPending(false); }
  };
  const updateIngredient = (index: number, patch: Partial<IngredientDraft>) => setDraft(current => ({ ...current, ingredients: current.ingredients.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setNotice('');
    const payload = inputFromDraft(draft);
    if (!payload) { setError('Controleer de porties en hoeveelheden. Gebruik bijvoorbeeld 1/3 of vul alle velden van een hoeveelheid in.'); return; }
    if (!payload.title) { setError('Vul een titel in.'); return; }
    if (restoreTargetId) { setError('Het oorspronkelijke recept kon niet worden geladen. Je kunt dit concept als nieuw recept bewaren.'); return; }
    if (conflict) { setError('Dit concept botst met een nieuwere versie. Vergelijk de versies of bewaar je concept als nieuw recept.'); return; }
    if (selected && editVersion === null) { setError('De bewerkversie ontbreekt. Je concept is bewaard; open het recept opnieuw.'); return; }
    setPending(true);
    try {
      const result = selected ? await api.updateRecipe(selected.id, editVersion!, payload) : await api.createRecipe(payload);
      sessionStorage.removeItem(draftKey); setRestored(false); setSelected(result.recipe); setView('detail'); setNotice('Recept opgeslagen.'); await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) { sessionStorage.setItem(draftKey, JSON.stringify({ draft, recipeId: selected?.id ?? null, version: editVersion })); onAuthExpired(); }
      else if (cause instanceof ApiError && cause.status === 409) { setConflict(true); setError('Dit recept is intussen gewijzigd. Je concept is bewaard. Vergelijk de nieuwste versie of bewaar je wijzigingen als nieuw recept.'); }
      else setError(cause instanceof Error ? cause.message : 'Opslaan is niet gelukt. Je concept blijft bewaard.');
    } finally { setPending(false); }
  };
  const reloadLatest = async () => {
    if (!selected) return; setPending(true); setError('');
    try { const result = await api.getRecipe(selected.id); setLatest(result.recipe); setNotice('De nieuwste versie staat hieronder ter vergelijking. Je concept is behouden.'); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onAuthExpired(); else setError(cause instanceof Error ? cause.message : 'De nieuwste versie kon niet worden geladen.'); }
    finally { setPending(false); }
  };
  const saveAsNew = async () => {
    const payload = inputFromDraft(draft);
    if (!payload || !payload.title) { setError('Controleer het concept voordat je het als nieuw recept bewaart.'); return; }
    setPending(true); setError('');
    try {
      const result = await api.createRecipe(payload);
      sessionStorage.removeItem(draftKey); setSelected(result.recipe); setEditVersion(null); setConflict(false); setLatest(null);
      setView('detail'); setNotice('Je concept is als nieuw recept bewaard.'); await load();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setError(cause instanceof Error ? cause.message : 'Opslaan is niet gelukt. Je concept blijft bewaard.');
    } finally { setPending(false); }
  };
  const remove = async () => {
    if (!selected) return; setPending(true); setError('');
    try { await api.deleteRecipe(selected.id); setDeleteOpen(false); setSelected(null); setView('list'); sessionStorage.removeItem(draftKey); await load(); setNotice('Recept verwijderd.'); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 401) onAuthExpired(); else setError(cause instanceof Error ? cause.message : 'Verwijderen is niet gelukt.'); }
    finally { setPending(false); }
  };

  return <section className="recipe-workspace" aria-labelledby="recipes-title">
    <div className="recipe-heading"><div><p className="eyebrow">Jouw kookboek</p><h1 id="recipes-title">Mijn recepten</h1><p className="subtle">Bewaar je recepten en pas ze aan wanneer je wilt.</p></div>
      <Button type="button" onClick={() => edit(null)}>＋ Nieuw recept</Button></div>
    {notice && <p className="recipe-notice" role="status">{notice}</p>}
    {restored && view === 'edit' && <p className="recipe-notice" role="status">Je onafgemaakte concept is teruggezet.</p>}
    {error && <p className="recipe-error" role="alert">{error}</p>}
    {restoreTargetId && view === 'edit' && <div className="panel" role="status"><p>Het oorspronkelijke recept is nog niet beschikbaar. Je concept blijft bewaard.</p><Button type="button" variant="outline" disabled={pending} onClick={() => void saveAsNew()}>Bewaar concept als nieuw recept</Button></div>}
    {conflict && selected && view === 'edit' && <div className="panel" role="status">
      <h2>Er is een nieuwere versie</h2><p>Je concept blijft op dit apparaat bewaard. Bekijk de actuele inhoud voordat je kiest wat je wilt houden.</p>
      <div className="action-row"><Button type="button" variant="outline" disabled={pending} onClick={() => void reloadLatest()}>Bekijk nieuwste versie</Button>
        <Button type="button" disabled={pending} onClick={() => void saveAsNew()}>Bewaar concept als nieuw recept</Button></div>
      {latest && <div className="conflict-preview"><h3>Actuele versie: {latest.title}</h3><p>Versie {latest.version} · {latest.ingredients.length} {latest.ingredients.length === 1 ? 'ingrediënt' : 'ingrediënten'} · {latest.steps.length} {latest.steps.length === 1 ? 'stap' : 'stappen'}</p>
        <ul>{latest.ingredients.map(item => <li key={item.id}>{formatQuantity(item.quantity)} — {item.originalText}</li>)}</ul>
        <ol>{latest.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <p>Je concept wordt niet over de actuele versie heen geschreven.</p>
      </div>}
    </div>}
    {view === 'list' && <>
      <div className="recipe-search"><label htmlFor="recipe-search">Zoek in geladen recepten</label><input id="recipe-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Titel, ingrediënt of bron" />{nextCursor && <small>Er zijn meer recepten. Laad ze hieronder om ook daarin te zoeken.</small>}</div>
      {loading && recipes.length === 0 ? <p className="recipe-state" role="status">Recepten laden…</p> : error && recipes.length === 0 ? <div className="recipe-state"><p>Je recepten zijn niet geladen.</p><Button variant="outline" onClick={() => void load()}>Opnieuw proberen</Button></div> : visibleRecipes.length === 0 ? <div className="recipe-empty"><span aria-hidden="true">✳</span><h2>{query ? 'Geen recepten gevonden' : 'Je kookboek is nog leeg'}</h2><p>{query ? 'Probeer een andere zoekterm.' : 'Voeg je eerste recept toe om het hier te bewaren.'}</p>{!query && <Button onClick={() => edit(null)}>Nieuw recept</Button>}</div> : <div className="recipe-list" aria-label="Recepten">
        {visibleRecipes.map(recipe => <article className="recipe-list-card" key={recipe.id}><button className="recipe-open" type="button" onClick={() => void openRecipe(recipe)} disabled={pending}>
          <span className="recipe-card-kicker">{recipe.sourceLabel || 'Eigen recept'}</span><strong>{recipe.title}</strong><span>{recipe.ingredients.length} {recipe.ingredients.length === 1 ? 'ingrediënt' : 'ingrediënten'}{recipe.baseServings ? ` · ${recipe.baseServings} porties` : ''}</span>
        </button><Button variant="outline" onClick={() => { setSelected(recipe); edit(recipe); }}>Bewerk</Button></article>)}
      </div>}
      {nextCursor && <div className="recipe-more"><Button variant="outline" disabled={loading} onClick={() => void load(nextCursor)}>{loading ? 'Laden…' : 'Meer recepten laden'}</Button></div>}
    </>}
    {view === 'detail' && selected && <article className="recipe-detail">
      <div className="recipe-detail-top"><Button variant="ghost" onClick={() => { setView('list'); setSelected(null); }}>← Alle recepten</Button><div className="recipe-actions"><Button variant="outline" onClick={() => edit(selected)}>Bewerk recept</Button><Button variant="outline" onClick={() => setDeleteOpen(true)}>Verwijder</Button></div></div>
      <p className="eyebrow">{selected.sourceLabel || 'Eigen recept'}</p><h2>{selected.title}</h2>
      {selected.sourceUrl && <p><a href={selected.sourceUrl} target="_blank" rel="noreferrer">Bekijk de bron ↗</a></p>}
      <p className="recipe-meta">{selected.baseServings ? `${selected.baseServings} porties` : 'Porties niet opgegeven'} · versie {selected.version}</p>
      {selected.uploads.length > 0 && <p className="recipe-meta">{selected.uploads.length} bronafbeelding(en) gekoppeld</p>}
      <div className="recipe-detail-columns"><section><h3>Ingrediënten</h3>{selected.ingredients.length ? <ul className="ingredient-list">{selected.ingredients.map(item => <li key={item.id}><span>{formatQuantity(item.quantity)}</span><strong>{item.originalText}</strong>{item.uncertainty.length > 0 && <small>{item.uncertainty.join(' · ')}</small>}</li>)}</ul> : <p className="subtle">Nog geen ingrediënten toegevoegd.</p>}</section>
        <section><h3>Bereiding</h3>{selected.steps.length ? <ol className="step-list">{selected.steps.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p className="subtle">Nog geen bereidingsstappen toegevoegd.</p>}</section></div>
      <div className="recipe-integrations"><h3>Verder met dit recept</h3><p>Je kunt Picnic koppelen via Account. Receptimport, productvoorstellen en boodschappen toevoegen volgen nog.</p></div>
    </article>}
    {view === 'edit' && <form className="recipe-editor" onSubmit={save}>
      <div className="recipe-detail-top"><Button type="button" variant="ghost" onClick={() => setView(selected ? 'detail' : 'list')}>← Concept bewaren en terug</Button><p className="subtle">{selected ? 'Bewerk je recept' : 'Nieuw handmatig recept'}</p></div>
      <div className="editor-section"><h2>{selected ? 'Recept aanpassen' : 'Nieuw recept'}</h2><label>Titel<input required maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <div className="editor-two"><label>Bronnaam (optioneel)<input maxLength={200} value={draft.sourceLabel} onChange={event => setDraft({ ...draft, sourceLabel: event.target.value })} placeholder="Bijvoorbeeld: familieboek" /></label><label>Bronlink (optioneel)<input type="url" value={draft.sourceUrl} onChange={event => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…" /></label></div>
        <label>Basisporties (optioneel)<input inputMode="decimal" value={draft.baseServings} onChange={event => setDraft({ ...draft, baseServings: event.target.value })} placeholder="Bijvoorbeeld 4 of 1/2" /><small>Exacte getallen blijven behouden; laat leeg als je het niet weet.</small></label>
      </div>
      <div className="editor-section"><div className="editor-section-heading"><div><h2>Ingrediënten</h2><p>Laat onbekende hoeveelheden expliciet onbekend.</p></div><Button type="button" variant="outline" onClick={() => setDraft({ ...draft, ingredients: [...draft.ingredients, { ...EMPTY_INGREDIENT }] })}>＋ Ingrediënt</Button></div>
        {draft.ingredients.map((item, index) => <fieldset className="ingredient-editor" key={index}><legend>Ingrediënt {index + 1}</legend>
          <label>Omschrijving<input value={item.originalText} onChange={event => updateIngredient(index, { originalText: event.target.value })} placeholder="Bijvoorbeeld: rijpe tomaten" /></label>
          <div className="editor-two"><label>Hoeveelheid<select value={item.kind} onChange={event => updateIngredient(index, { kind: event.target.value as Quantity['kind'] })}><option value="unknown">Onbekend</option><option value="global">Naar behoefte</option><option value="exact">Exact</option><option value="range">Bereik</option></select></label><label>Sectie (optioneel)<input value={item.section} onChange={event => updateIngredient(index, { section: event.target.value })} placeholder="Bijvoorbeeld: saus" /></label></div>
          {(item.kind === 'exact' || item.kind === 'range') && <div className="editor-quantity"><label>{item.kind === 'range' ? 'Vanaf' : 'Hoeveelheid'}<input inputMode="decimal" value={item.amount} onChange={event => updateIngredient(index, { amount: event.target.value })} placeholder="1/3" /></label>{item.kind === 'range' && <label>Tot<input inputMode="decimal" value={item.maximum} onChange={event => updateIngredient(index, { maximum: event.target.value })} placeholder="2/3" /></label>}<label>Eenheid<select value={item.unit} onChange={event => updateIngredient(index, { unit: event.target.value as QuantityUnit })}><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="l">l</option><option value="piece">stuk</option></select></label></div>}
          {(['g', 'kg', 'ml', 'l'].includes(item.unit) && ['exact', 'range'].includes(item.kind)) && <label>Hoeveelheidstype<select value={item.basis} onChange={event => updateIngredient(index, { basis: event.target.value as IngredientDraft['basis'] })}><option value="">Niet opgegeven</option><option value="net">Netto</option><option value="drained">Uitgelekt</option></select></label>}
          {item.uncertainty.length > 0 && <p className="subtle">Aandachtspunt: {item.uncertainty.join(' · ')}</p>}
          {draft.ingredients.length > 1 && <Button type="button" variant="ghost" onClick={() => setDraft({ ...draft, ingredients: draft.ingredients.filter((_, i) => i !== index) })}>Verwijder ingrediënt</Button>}
        </fieldset>)}
      </div>
      <div className="editor-section"><div className="editor-section-heading"><h2>Bereiding</h2><Button type="button" variant="outline" onClick={() => setDraft(current => ({ ...current, steps: [...current.steps, ''] }))}>＋ Stap</Button></div>
        {draft.steps.length === 0 && <p className="subtle">Je kunt bereidingsstappen later toevoegen.</p>}
        {draft.steps.map((step, index) => <div className="step-editor" key={index}><label>Stap {index + 1}<textarea rows={4} value={step} onChange={event => setDraft(current => ({ ...current, steps: current.steps.map((value, i) => i === index ? event.target.value : value) }))} /></label><Button type="button" variant="ghost" onClick={() => setDraft(current => ({ ...current, steps: current.steps.filter((_, i) => i !== index) }))}>Verwijder stap {index + 1}</Button></div>)}
      </div>
      {draft.uploads.length > 0 && <div className="editor-section"><h2>Bronafbeeldingen</h2><p>{draft.uploads.length} bronafbeelding(en) blijven aan dit recept gekoppeld. Afbeeldingen beheren volgt in een volgende bouwstap.</p></div>}
      <div className="editor-footer"><Button type="submit" disabled={pending}>{pending ? 'Opslaan…' : 'Recept opslaan'}</Button><p className="subtle">Importeren en Picnic-boodschappen toevoegen zijn nog niet beschikbaar.</p></div>
    </form>}
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Recept verwijderen?</AlertDialogTitle><AlertDialogDescription>“{selected?.title}” en de gekoppelde receptgegevens worden verwijderd. Dit kan niet ongedaan worden gemaakt.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={event => { event.preventDefault(); void remove(); }}>{pending ? 'Verwijderen…' : 'Ja, verwijder recept'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
