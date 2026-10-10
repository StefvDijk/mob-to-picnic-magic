import { useState } from 'react';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';
import { parseQuantity, type Quantity, type QuantityUnit } from '../../shared/quantities';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { quantityLabel } from '@/lib/recipe-presentation';

export function ShoppingIngredientEditor({ recipe, sources, onClose, onSaved, onAuthExpired }: {
  recipe: RecipeDto; sources: RecipeIngredientDto[]; onClose: () => void; onSaved: (recipe: RecipeDto) => void; onAuthExpired: () => void;
}) {
  const [activeId, setActiveId] = useState(sources[0]?.id);
  const source = sources.find(item => item.id === activeId)!;
  const [name, setName] = useState(source.normalizedName ?? source.originalText);
  const [kind, setKind] = useState<Quantity['kind']>(source.quantity.kind);
  const [amount, setAmount] = useState(source.quantity.amount ?? '');
  const [maximum, setMaximum] = useState(source.quantity.maximum ?? '');
  const [unit, setUnit] = useState<QuantityUnit>(source.quantity.unit ?? 'g');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function selectSource(item: RecipeIngredientDto) {
    setActiveId(item.id); setName(item.normalizedName ?? item.originalText); setKind(item.quantity.kind);
    setAmount(item.quantity.amount ?? ''); setMaximum(item.quantity.maximum ?? ''); setUnit(item.quantity.unit ?? 'g'); setError('');
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    const quantity = parseQuantity(kind === 'unknown' || kind === 'global' ? {kind} : {kind, amount, ...(kind === 'range' ? {maximum} : {}), unit, basis: source.quantity.unit === unit ? source.quantity.basis : null});
    if (!name.trim() || !quantity) { setError('Vul een ingrediënt en een geldige hoeveelheid in, bijvoorbeeld 200 of 1/2.'); return; }
    setBusy(true); setError('');
    try {
      const { recipe: updated } = await api.updateRecipe(recipe.id, recipe.version, {
        title: recipe.title, sourceLabel: recipe.sourceLabel, sourceUrl: recipe.sourceUrl, baseServings: recipe.baseServings,
        steps: recipe.steps, uploads: recipe.uploads.map(item => item.id),
        ingredients: recipe.ingredients.map(item => item.id === activeId ? {...item, normalizedName:name.trim(), quantity, sourceOrigin:'user',
          uncertainty: item.uncertainty} : item),
      });
      onSaved(updated); onClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setError(cause instanceof Error ? cause.message : 'Aanpassen is niet gelukt. Je wijzigingen staan nog hier.');
    } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="sp-sheet sp-ingredient-sheet" onCloseAutoFocus={event => {event.preventDefault();requestAnimationFrame(()=>document.getElementById(`edit-${sources[0].id}`)?.focus());}} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>Ingrediënt aanpassen</DialogTitle><DialogDescription>De boodschappen worden daarna opnieuw berekend.</DialogDescription></DialogHeader>
    {sources.length > 1 && <div className="sp-source-picker">{sources.map(item => <button type="button" key={item.id} aria-pressed={item.id===activeId} onClick={() => selectSource(item)} disabled={busy}>{item.originalText}</button>)}</div>}
    <form onSubmit={save} className="sp-edit-form"><label>Ingrediënt<input value={name} onChange={event => setName(event.target.value)} required disabled={busy} /></label>
      <div className="sp-original"><span>Uit de bron</span><p>{source.originalText}</p></div>
      <label>Hoeveelheid<select value={kind} onChange={event => setKind(event.target.value as Quantity['kind'])} disabled={busy}><option value="exact">Exacte hoeveelheid</option><option value="range">Vanaf / tot</option><option value="global">Naar smaak</option><option value="unknown">Bronmaat gebruiken</option></select></label>
      {kind === 'unknown' && <p className="sp-field-note">{quantityLabel(source.quantity,source.originalText)}. Lepels en handjes blijven als bronmaat behouden.</p>}
      {(kind==='exact'||kind==='range') && <div className="sp-amount-fields"><label>{kind==='range'?'Vanaf':'Aantal'}<input inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} required disabled={busy}/></label>{kind==='range'&&<label>Tot<input inputMode="decimal" value={maximum} onChange={event=>setMaximum(event.target.value)} required disabled={busy}/></label>}<label>Eenheid<select value={unit} onChange={event=>setUnit(event.target.value as QuantityUnit)} disabled={busy}>{(['g','kg','ml','l','piece'] as QuantityUnit[]).map(value=><option key={value} value={value}>{value==='piece'?'stuks':value}</option>)}</select></label></div>}
      {error&&<p className="sp-error" role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>{busy?'Aanpassen…':'Pas boodschappen aan'}</Button>
    </form>
  </DialogContent></Dialog>;
}
