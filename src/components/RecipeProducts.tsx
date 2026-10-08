import { useEffect, useMemo, useRef, useState } from 'react';
import type { PicnicProduct } from '../../shared/picnic';
import type { ProposalDto } from '../../shared/proposals';
import type { RecipeDto, RecipeIngredientDto } from '../../shared/recipes';
import { formatRational, parseRational } from '../../shared/quantities';
import { api, ApiError } from '@/lib/api';
import { planIngredientProducts } from '@/lib/product-plan';
import { Button } from '@/components/ui/button';
import { AdditionStatus } from '@/components/AdditionStatus';

function euro(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
function packageText(product: PicnicProduct): string {
  const quantity = product.quantity;
  if (!quantity || quantity.kind === 'unknown' || quantity.kind === 'global') return product.unitQuantity || 'Hoeveelheid onbekend';
  const amount = quantity.kind === 'range' ? `${quantity.amount}–${quantity.maximum}` : quantity.amount;
  const basis = quantity.basis === 'net' ? ' netto' : quantity.basis === 'drained' ? ' uitgelekt' : '';
  return `${amount} ${quantity.unit ?? ''}${basis}`.trim();
}
function unitPriceText(product: PicnicProduct): string | null {
  const quantity = product.quantity;
  const amount = quantity?.kind === 'exact' ? parseRational(quantity.amount) : null;
  if (!amount || amount.numerator <= 0 || product.displayPriceCents === null || !quantity?.unit) return null;
  const factor = quantity.unit === 'g' || quantity.unit === 'ml' ? 1000 : 1;
  const perBaseUnitCents = product.displayPriceCents * factor * amount.denominator / amount.numerator;
  const unit = quantity.unit === 'g' || quantity.unit === 'kg' ? 'kg' : quantity.unit === 'ml' || quantity.unit === 'l' ? 'l' : 'stuk';
  return `${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(perBaseUnitCents / 100)}/${unit}`;
}
function candidateProblem(product: PicnicProduct, ingredient: RecipeIngredientDto): string | null {
  const need = ingredient.quantity;
  if (product.priceCertainty !== 'known' || product.displayPriceCents === null) return 'Prijs is onzeker of onbekend';
  if (product.quantity?.kind !== 'exact' || !product.quantity.unit) return 'Verpakkingshoeveelheid is onbekend of niet exact';
  const unit = product.quantity.unit;
  const compatible = (need.unit === 'g' || need.unit === 'kg') && (unit === 'g' || unit === 'kg') ||
    (need.unit === 'ml' || need.unit === 'l') && (unit === 'ml' || unit === 'l') || need.unit === 'piece' && unit === 'piece';
  if (!compatible) return 'Eenheid past niet bij de recepthoeveelheid';
  if (need.unit !== 'piece' && !need.basis) return 'Kies eerst netto of uitgelekt in het recept';
  if (product.quantity.basis && need.basis && product.quantity.basis !== need.basis) return 'Basis verschilt van het recept';
  return null;
}

export function RecipeProducts({ recipe, onBack, onEdit, onAuthExpired }: {
  recipe: RecipeDto;
  onBack: () => void;
  onEdit: () => void;
  onAuthExpired: () => void;
}) {
  const [servings, setServings] = useState(recipe.baseServings ?? '2');
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, PicnicProduct[]>>({});
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [suitable, setSuitable] = useState<Set<string>>(() => new Set());
  const [basisConfirmed, setBasisConfirmed] = useState<Set<string>>(() => new Set());
  const [searchedQueries, setSearchedQueries] = useState<Record<string, string>>({});
  const [proposal, setProposal] = useState<ProposalDto | null>(null);
  const [proposalPending, setProposalPending] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [recovering, setRecovering] = useState(true);
  const [approvalStarted, setApprovalStarted] = useState(() => !!sessionStorage.getItem(`picnic:approved-proposal:${recipe.id}`));
  const recoveryKey = `picnic:approved-proposal:${recipe.id}`;
  useEffect(() => {
    let cancelled = false;
    const saved = sessionStorage.getItem(recoveryKey);
    if (!saved) { setRecovering(false); return; }
    void api.getProposalAction(saved).then(result => {
      if (!cancelled) setActionId(result.action.id);
    }).catch(async cause => {
      if (cancelled) return;
      if (cause instanceof ApiError && cause.status === 404) {
        try {
          const previous = await api.getProposal(saved);
          if (!cancelled) setProposal(previous.proposal);
        } catch (error) {
          if (!cancelled) {
            if (error instanceof ApiError && [404, 409].includes(error.status)) {
              sessionStorage.removeItem(recoveryKey); setApprovalStarted(false);
            } else setProposalError('De vorige goedkeuring kon niet worden gecontroleerd. Herlaad de pagina voordat je opnieuw toevoegt.');
          }
        }
      } else setProposalError('Een eerdere toevoeging kon niet worden opgehaald. Herlaad de pagina om de status te controleren voordat je opnieuw toevoegt.');
    }).finally(() => { if (!cancelled) setRecovering(false); });
    return () => { cancelled = true; };
  }, [recoveryKey]);
  const requestVersions = useRef(new Map<string, number>());
  const nextRequestVersion = useRef(0);

  useEffect(() => {
    setSuitable(new Set());
    setBasisConfirmed(new Set());
    setResults({});
    setErrors({});
    setSearchedQueries({});
    setProposal(null);
    setProposalError('');
    requestVersions.current.clear();
    setLoading(new Set());
  }, [servings, recipe.id]);
  useEffect(() => () => { requestVersions.current.clear(); }, []);

  const search = async (ingredient: RecipeIngredientDto) => {
    const query = (queries[ingredient.id] ?? ingredient.normalizedName ?? ingredient.originalText).trim();
    if (!query) { setErrors(current => ({ ...current, [ingredient.id]: 'Vul een zoekterm in.' })); return; }
    const version = ++nextRequestVersion.current;
    requestVersions.current.set(ingredient.id, version);
    setLoading(current => new Set(current).add(ingredient.id));
    setErrors(current => ({ ...current, [ingredient.id]: '' }));
    try {
      const response = await api.searchPicnicProducts(query);
      if (requestVersions.current.get(ingredient.id) !== version) return;
      setResults(current => ({ ...current, [ingredient.id]: response.products }));
      setSearchedQueries(current => ({ ...current, [ingredient.id]: query }));
      setSuitable(current => { const next = new Set(current); response.products.forEach(product => next.delete(choiceKey(ingredient.id, product.id))); return next; });
      setBasisConfirmed(current => { const next = new Set(current); response.products.forEach(product => next.delete(choiceKey(ingredient.id, product.id))); return next; });
    } catch (cause) {
      if (requestVersions.current.get(ingredient.id) !== version) return;
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setErrors(current => ({ ...current, [ingredient.id]: cause instanceof Error ? cause.message : 'Producten zoeken is niet gelukt.' }));
    } finally {
      if (requestVersions.current.get(ingredient.id) === version) setLoading(current => { const next = new Set(current); next.delete(ingredient.id); return next; });
    }
  };

  const toggleSuitable = (productKey: string, checked: boolean) => {
    setSuitable(current => { const next = new Set(current); checked ? next.add(productKey) : next.delete(productKey); return next; });
    if (!checked) setBasisConfirmed(current => { const next = new Set(current); next.delete(productKey); return next; });
  };

  const choices = useMemo(() => recipe.ingredients.map(ingredient => ({
    ingredientId: ingredient.id,
    ...planIngredientProducts({ ingredient, baseServings: recipe.baseServings, requestedServings: servings,
      products: results[ingredient.id] ?? [],
      suitableProductIds: new Set((results[ingredient.id] ?? []).filter(product => suitable.has(choiceKey(ingredient.id, product.id))).map(product => product.id)),
      confirmedProductBasisIds: new Set((results[ingredient.id] ?? []).filter(product => basisConfirmed.has(choiceKey(ingredient.id, product.id))).map(product => product.id)) }),
  })), [recipe, servings, results, suitable, basisConfirmed]);

  const proposalChoices = choices.flatMap(choice => {
    if (choice.status !== 'selected' || choice.selection.status !== 'selected' || !choice.selection.selected) return [];
    const packageChoice = choice.selection.selected.packageCounts[0];
    const query = searchedQueries[choice.ingredientId];
    return packageChoice && query ? [{ ingredientId: choice.ingredientId, productId: packageChoice.productId, query, basis: choice.basis }] : [];
  });
  const choiceSignature = JSON.stringify([recipe.id, recipe.version, servings, proposalChoices]);
  const currentSignature = useRef(choiceSignature);
  currentSignature.current = choiceSignature;
  useEffect(() => { setProposal(null); }, [choiceSignature]);
  const canCreateProposal = !approvalStarted && !recovering && !proposalPending && recipe.ingredients.length > 0 && proposalChoices.length === recipe.ingredients.length &&
    choices.every(choice => choice.status === 'selected' && choice.selection.status === 'selected' && choice.selection.selected?.packageCounts.length === 1);

  const createProposal = async () => {
    if (!canCreateProposal) return;
    setProposalPending(true);
    setProposalError('');
    setProposal(null);
    try {
      const result = await api.createProposal({ recipeId: recipe.id, recipeVersion: recipe.version, servings: servings.trim(), choices: proposalChoices });
      if (currentSignature.current === choiceSignature) setProposal(result.proposal);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setProposalError(cause instanceof Error ? cause.message : 'Het voorstel kon niet worden gecontroleerd.');
    } finally { setProposalPending(false); }
  };

  const approve = async () => {
    if (!proposal || approving || actionId || recovering) return;
    setApproving(true); setApprovalStarted(true); setProposalError('');
    sessionStorage.setItem(recoveryKey, proposal.id);
    try {
      const result = await api.approveProposal(proposal.id, proposal.version);
      setActionId(result.action.id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else setProposalError(cause instanceof Error ? cause.message : 'De toevoeging kon niet worden bevestigd. Probeer dezelfde goedkeuring opnieuw; die maakt geen dubbele actie.');
    } finally { setApproving(false); }
  };

  if (actionId) return <><Button variant="ghost" onClick={onBack}>← Terug naar recept</Button><AdditionStatus id={actionId} onAuthExpired={onAuthExpired} onNewProposal={() => {
    sessionStorage.removeItem(recoveryKey); setActionId(null); setProposal(null); setApprovalStarted(false);
    setSuitable(new Set()); setBasisConfirmed(new Set()); setResults({});
  }} /></>;

  return <article className="recipe-detail" aria-labelledby="product-choice-title">
    <div className="recipe-detail-top"><Button type="button" variant="ghost" onClick={onBack}>← Terug naar recept</Button></div>
    <p className="eyebrow">Producten kiezen</p>
    <h2 id="product-choice-title">{recipe.title}</h2>
    <p className="subtle">Zoek per ingrediënt en markeer zelf welke Picnic-producten geschikt zijn. Alleen bevestigde producten met een bekende prijs tellen mee.</p>
    <fieldset disabled={approvalStarted || recovering || proposalPending} className="min-w-0">
    <div className="panel form-stack">
      <label htmlFor="target-servings">Porties</label>
      <input id="target-servings" inputMode="decimal" value={servings} disabled={proposalPending} onChange={event => setServings(event.target.value)} placeholder="Bijvoorbeeld 2 of 1/2" aria-describedby="servings-help" />
      <small id="servings-help">Hoeveelheden worden exact geschaald vanaf {recipe.baseServings || 'onbekend aantal'} basisporties. Vul porties in het recept aan als dat nodig is.</small>
    </div>
    {recipe.ingredients.map((ingredient, index) => {
      const query = queries[ingredient.id] ?? ingredient.normalizedName ?? ingredient.originalText;
      const products = results[ingredient.id] ?? [];
      const choice = choices[index];
      const need = ingredient.quantity;
      const basisLabel = need.basis === 'drained' ? 'uitgelekt' : 'netto';
      return <section className="panel" key={ingredient.id} aria-labelledby={`ingredient-${ingredient.id}`}>
        <h3 id={`ingredient-${ingredient.id}`}>{ingredient.originalText}</h3>
        {choice.status === 'unresolved' ? <p role="alert">{choice.reason} <Button type="button" variant="link" onClick={onEdit}>Recept bewerken</Button></p>
          : <p>Benodigd: {formatRational(parseChoiceNeeded(choice.needed))} {choice.unit}{choice.basis ? ` (${choice.basis === 'drained' ? 'uitgelekt' : 'netto'})` : ''}</p>}
        <div className="form-stack">
          <label htmlFor={`search-${ingredient.id}`}>Zoekproduct voor {ingredient.originalText}</label>
          <input id={`search-${ingredient.id}`} type="search" value={query} onChange={event => setQueries(current => ({ ...current, [ingredient.id]: event.target.value }))} />
          <Button type="button" variant="outline" disabled={proposalPending || loading.has(ingredient.id)} onClick={() => void search(ingredient)}>{loading.has(ingredient.id) ? 'Zoeken…' : 'Zoek producten'}</Button>
        </div>
        {errors[ingredient.id] && <p role="alert" className="recipe-error">{errors[ingredient.id]}</p>}
        {products.length > 0 && <ul className="ingredient-list" aria-label={`Zoekresultaten voor ${ingredient.originalText}`}>
          {products.map(product => {
            const problem = candidateProblem(product, ingredient);
            const requiresBasis = need.unit !== 'piece' && product.quantity?.basis == null;
            const id = choiceKey(ingredient.id, product.id);
            const checked = suitable.has(id);
            return <li key={product.id}>
              <strong>{product.name}</strong> · {packageText(product)} · {product.displayPriceCents === null ? 'Prijs onbekend' : euro(product.displayPriceCents)}{unitPriceText(product) ? ` (${unitPriceText(product)})` : ''}
              {requiresBasis && !problem && <label className="product-basis-confirmation">
                <input type="checkbox" disabled={proposalPending} checked={basisConfirmed.has(id)} onChange={event => setBasisConfirmed(current => {
                  const next = new Set(current); event.target.checked ? next.add(id) : next.delete(id); return next;
                })} />
                Ik bevestig dat deze verpakking {basisLabel} is
              </label>}
              <label className="product-suitable-choice">
                <input type="checkbox" checked={checked} disabled={proposalPending || !!problem || requiresBasis && !basisConfirmed.has(id)} onChange={event => toggleSuitable(id, event.target.checked)} />
                Geschikt voor dit recept
              </label>
              {problem && <small>{problem}</small>}
            </li>;
          })}
        </ul>}
        {choice.status === 'selected' && choice.selection.status === 'selected' && choice.selection.selected && <p role="status">Gekozen: {choice.selection.selected.packageCounts.reduce((sum, item) => sum + item.count, 0)} {choice.selection.selected.packageCounts.reduce((sum, item) => sum + item.count, 0) === 1 ? 'verpakking' : 'verpakkingen'} · totaal {euro(choice.selection.selected.totalCents)} · overschot {choice.selection.selected.overshoot} {choice.selection.selected.unit}</p>}
        {products.length > 0 && choice.status === 'selected' && choice.selection.status === 'unresolved' && <p role="status">{choice.selection.reason === 'incompatible_units' || choice.selection.reason === 'missing_basis'
          ? 'Geen geschikt product met dezelfde eenheid en basis. Bewerk de hoeveelheid in het recept of kies andere producten.'
          : 'Met deze producten kan geen voldoende verpakking worden samengesteld. Kies meer geschikte resultaten.'}</p>}
      </section>;
    })}
    </fieldset>
    <section className="panel" aria-labelledby="proposal-review-heading">
      <h3 id="proposal-review-heading">Voorstel controleren</h3>
      <p>Controleer alle productkeuzes. We halen de actuele prijzen op en rekenen uit hoeveel verpakkingen nodig zijn.</p>
      {proposalError && <p role="alert" className="recipe-error">{proposalError}</p>}
      <Button type="button" disabled={!canCreateProposal} onClick={() => void createProposal()}>{proposalPending ? 'Voorstel controleren…' : 'Voorstel controleren'}</Button>
      {!canCreateProposal && !proposalPending && <p className="subtle">Zoek producten en markeer voor elk ingrediënt een geschikte keuze met bekende prijs.</p>}
      {proposal && <div role="status" aria-live="polite"><h4>Voorstel gecontroleerd</h4>
        <p>{proposal.servings} porties · totaal {euro(proposal.totalPriceCents)}</p>
        <ul>{proposal.needs.map(need => <li key={need.id}>{need.name}: {need.product.packCount} × {need.product.name} · {euro(need.product.priceCents * need.product.packCount)} · overschot {need.product.overshoot} {need.product.suppliedUnit}</li>)}</ul>
        <p>Voeg deze producten toe aan je Picnic-mand. Je bestelt en betaalt pas in Picnic.</p>
        <Button disabled={approving || recovering} onClick={() => void approve()}>{approving ? 'Goedkeuring verwerken…' : `Akkoord, voeg toe voor ${euro(proposal.totalPriceCents)}`}</Button>
      </div>}
    </section>
  </article>;
}

function parseChoiceNeeded(value: string) {
  const [numerator, denominator = '1'] = value.split('/');
  return { numerator: Number(numerator), denominator: Number(denominator) };
}

function choiceKey(ingredientId: string, productId: string): string { return `${ingredientId}\u0000${productId}`; }
