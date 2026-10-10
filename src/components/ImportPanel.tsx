import { INTERACTIVE_DEADLINE_MS } from '../../shared/workflow';
import { validServings } from '../../worker/domain/shopping';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ImportDto } from '../../shared/imports';
import { api, ApiError } from '@/lib/api';
import { importErrorText } from '@/lib/import-draft';
import { ShoppingProgress } from '@/components/ShoppingProgress';
import { RecipeFlow } from '@/components/RecipeFlow';
import { QuantityStepper } from '@/components/picnic/catalog';
import { Button } from '@/components/ui/button';
import { Link2, Camera } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prepareImportPhoto } from '@/lib/import-photo';
import { recognitionFallbackText } from '@/lib/import-draft';
import { isImportKnownTerminal, isImportStillProcessing } from '@/lib/import-state';

interface ImportPanelProps {
  shoppingOnly?: boolean;
  ownerId: string;
  onAuthExpired: () => void;
  onUseCandidate: (source: ImportDto, candidateIndex: number, servings: string, baseServings?: string, clientDeadlineAt?: number) => Promise<void>;
  onClose: () => void;
}

export function ImportPanel({ ownerId, onAuthExpired, onUseCandidate, onClose, shoppingOnly = false }: ImportPanelProps) {
  const storageKey = `picnic:pending-import:${ownerId}`;
  const [sourceType, setSourceType] = useState<'photo' | 'url'>('url');
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const [importId, setImportId] = useState<string | null>(() => sessionStorage.getItem(storageKey));
  const [current, setCurrent] = useState<ImportDto | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(Boolean(importId));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [servings, setServings] = useState(() => sessionStorage.getItem(`${storageKey}:servings`) ?? '2');
  const [baseServings, setBaseServings] = useState('');
  const [baseConfirmed, setBaseConfirmed] = useState(false);
  const [clientDeadlineAt,setClientDeadlineAt] = useState<number | null>(() => { const value = Number(sessionStorage.getItem(`${storageKey}:deadline`)); return value > 0 ? value : null; });
  const [timedOut,setTimedOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const recovery = useRef(false);
  const currentRef = useRef<ImportDto | null>(current);
  currentRef.current = current;
  const autoOpened = useRef<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const photoId = useId();
  const urlId = useId();
  const labelId = useId();

  useEffect(() => {
    if (clientDeadlineAt === null) return;
    const expire = () => {
      const latest = currentRef.current;
      if (latest && isImportKnownTerminal(latest.status, latest.expiresAt)) {
        setTimedOut(false); setLoading(false); setMessage('');
        return;
      }
      setTimedOut(true); setLoading(false); setMessage('');
    };
    if (clientDeadlineAt <= Date.now()) { expire(); return; }
    const timer = setTimeout(expire,clientDeadlineAt-Date.now());
    return () => clearTimeout(timer);
  },[clientDeadlineAt]);

  useEffect(() => {
    if (!importId || timedOut) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let failures = 0;
    async function refresh() {
      setLoading(true);
      try {
        const result = await api.getImport(importId!,clientDeadlineAt === null ? 30_000 : Math.max(1,clientDeadlineAt-Date.now()));
        if (!active) return;
        setCurrent(recovery.current ? {...result.import,deadlineAt:null} : result.import);
        setError('');
        setLoading(false);
        failures = 0;
        if (isImportStillProcessing(result.import.status, result.import.recognition?.state, result.import.expiresAt === null || result.import.expiresAt > Date.now()) && polls++ < 60) {
          timer = setTimeout(refresh, 500);
        }
      } catch (cause) {
        if (!active) return;
        setLoading(false);
        if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
        else if (cause instanceof ApiError && cause.status === 404) {
          sessionStorage.removeItem(storageKey);
          setImportId(null); setCurrent(null);
          setError('Dit importconcept is niet meer beschikbaar. Je kunt een nieuwe bron kiezen.');
        } else {
          setError(cause instanceof Error ? cause.message : 'De importstatus kon niet worden opgehaald.');
          if (polls++ < 60) timer = setTimeout(refresh, Math.min(30_000, 3000 * 2 ** Math.min(failures++, 3)));
        }
      }
    }
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [importId, onAuthExpired, storageKey, refreshNonce, timedOut, clientDeadlineAt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validServings(servings) || pending) return;
    sessionStorage.setItem(`${storageKey}:servings`, servings);
    recovery.current=false;
    setStartedAt(Date.now());
    const deadline = Date.now()+INTERACTIVE_DEADLINE_MS;
    sessionStorage.setItem(`${storageKey}:deadline`,String(deadline));
    setClientDeadlineAt(deadline); setTimedOut(false);
    const remaining = () => { const ms = deadline-Date.now(); if (ms <= 0) throw new ApiError(504,'WORKFLOW_TIMEOUT','De verwerking duurde langer dan 30 seconden. Je opgeslagen bron blijft behouden.'); return ms; };
    setPending(true); setError(''); setMessage('');
    try {
      let ids = [...uploadedIds];
      if (sourceType === 'photo') {
        for (let index = ids.length; index < photos.length; index++) {
          remaining();
          const prepared = await prepareImportPhoto(photos[index]);
          remaining();
          const uploaded = await api.uploadPhoto(prepared,remaining());
          ids = [...ids, uploaded.upload.id];
          setUploadedIds(ids);
        }
      }
      const result = sourceType === 'photo' ? await api.importPhotos(ids, remaining()) : await api.importUrl(url.trim(), sourceLabel.trim() || undefined, remaining());
      sessionStorage.setItem(storageKey, result.import.id);
      setCurrent(recovery.current ? {...result.import,deadlineAt:null} : result.import); setImportId(result.import.id); setSelectedIndex(null);
      setMessage('We lezen de ingrediënten en bereidingsstappen van je recept.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') setError('De uitkomst van het verzenden is onbekend. Je bron blijft hier staan; controleer je verbinding voordat je opnieuw probeert.');
      else setError(cause instanceof Error ? cause.message : 'De bron kon niet worden verstuurd.');
    } finally { setPending(false); }
  }

  function chooseOtherSource() {
    if (!shoppingOnly && !window.confirm('Wil je een andere bron kiezen? Het huidige importconcept blijft nog op de server bestaan, maar verdwijnt uit dit scherm.')) return;
    autoOpened.current = null; setStartedAt(null); setBaseConfirmed(false); setBaseServings('');
    setSourceType('url'); setUrl(''); setSourceLabel(''); setPhotos([]); setUploadedIds([]);
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(`${storageKey}:deadline`);
    setClientDeadlineAt(null); setTimedOut(false);
    setImportId(null); setCurrent(null); setSelectedIndex(null); setError(''); setMessage('');
  }

  const expiresAt = current && 'expiresAt' in current && typeof current.expiresAt === 'number' ? current.expiresAt : null;
  const sourceAvailable = expiresAt === null || expiresAt > Date.now();
  const recognizing = !!current?.recognition && ['pending', 'counting', 'reserved', 'sending'].includes(current.recognition.state);
  const terminalCurrent = !!current && isImportKnownTerminal(current.status, expiresAt);
  const showTimeout = timedOut && !terminalCurrent;
  const canChooseRecipe = current && current.candidates.length > 0 && current.recognition?.state === 'ready' && sourceAvailable && ['needs_review', 'saved'].includes(current.status);
  const candidateIndex = current?.candidates.length === 1 ? 0 : selectedIndex;
  const candidate = candidateIndex === null ? null : current?.candidates[candidateIndex];
  const needsBase = !!candidate && !validServings(candidate.baseServings);
  useEffect(() => {
    if (!canChooseRecipe) return;
    sessionStorage.removeItem(`${storageKey}:deadline`);
    setClientDeadlineAt(null); setTimedOut(false); setMessage('');
  }, [canChooseRecipe, storageKey]);

  async function reviewRecipe() {
    if (!current || candidateIndex === null || saving || (needsBase && !baseConfirmed)) return;
    const deadlineAt = clientDeadlineAt !== null && clientDeadlineAt > Date.now() ? clientDeadlineAt : undefined;
    setStartedAt(Date.now()); setSaving(true); setError('');
    try { await onUseCandidate(current, candidateIndex, servings, needsBase ? baseServings : undefined, deadlineAt); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Je recept kon niet worden geopend.'); }
    finally { setSaving(false); }
  }

  useEffect(() => {
    if (!shoppingOnly || !current || !canChooseRecipe || candidateIndex === null || !candidate || (needsBase && !baseConfirmed) || timedOut || error) return;
    const attempt = `${current.id}:${candidateIndex}`;
    if (autoOpened.current === attempt) return;
    autoOpened.current = attempt;
    const deadlineAt = clientDeadlineAt !== null && clientDeadlineAt > Date.now() ? clientDeadlineAt : undefined;
    setStartedAt(Date.now()); setSaving(true);
    void onUseCandidate(current, candidateIndex, servings, needsBase ? baseServings : undefined, deadlineAt)
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Je boodschappen konden niet worden geopend.'))
      .finally(() => setSaving(false));
  }, [shoppingOnly,current,canChooseRecipe,candidateIndex,candidate,needsBase,baseConfirmed,timedOut,error,onUseCandidate,servings,baseServings,clientDeadlineAt]);
  const currentProcessing = !!current && isImportStillProcessing(current.status, current.recognition?.state, sourceAvailable);
  const inProgress = !showTimeout && !terminalCurrent && !error && (pending || saving || !current && !!importId && loading || currentProcessing);
  const sourceName = current?.sourceUrl || url ? (()=>{try{return new URL(current?.sourceUrl || url).hostname.replace(/^www\./,'');}catch{return 'Je receptlink';}})() : 'Je foto';

  return <section className={`import-panel ${shoppingOnly ? 'sp-import' : ''}`} aria-labelledby="import-title">
    <div className="recipe-detail-top"><Button type="button" variant="ghost" onClick={onClose}>← Mijn recepten</Button>{current && <Button type="button" variant="outline" onClick={chooseOtherSource}>Andere bron kiezen</Button>}</div>
    {!shoppingOnly && <RecipeFlow current={1} />}<div className="page-heading"><h1 id="import-title">{shoppingOnly ? 'Wat wil je toevoegen?' : 'Recept toevoegen'}</h1><p className="subtle">{shoppingOnly ? 'Ieder recept snel in je Picnic-mandje.' : 'Plak een link of kies een foto. Je controleert het recept voordat je boodschappen kiest.'}</p></div>

    {error && <p className="error-message" role="alert">{error}</p>}
    {showTimeout && <div className="panel" role="alert"><p>Het recept is na 30 seconden nog niet klaar. Je bron blijft bewaard.</p>{importId && <Button type="button" variant="outline" onClick={() => { recovery.current=true; setStartedAt(Date.now()); const deadline=Date.now()+INTERACTIVE_DEADLINE_MS; sessionStorage.setItem(`${storageKey}:deadline`,String(deadline)); setClientDeadlineAt(deadline); setTimedOut(false); setCurrent(null); setRefreshNonce(value=>value+1); }}>Bekijk bestaand resultaat</Button>}</div>}
    {!shoppingOnly && message && !showTimeout && <p className="notice" role="status">{message}</p>}
    {!importId && !(shoppingOnly && pending) && <form className="import-form panel" onSubmit={submit}>
      <fieldset disabled={pending}><legend>Kies een bron</legend><div className="import-source-options">
        <label><input type="radio" name="import-source" checked={sourceType === 'photo'} onChange={() => setSourceType('photo')} /> {shoppingOnly && <Camera size={17}/>}Foto</label>
        <label><input type="radio" name="import-source" checked={sourceType === 'url'} onChange={() => setSourceType('url')} /> {shoppingOnly && <Link2 size={17}/>}Link</label>
      </div></fieldset>
      {sourceType === 'photo' ? <div className="import-field"><Label htmlFor={photoId}>Foto’s van je recept</Label><Input id={photoId} type="file" accept="image/jpeg,image/png,image/webp" multiple required disabled={pending} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        setUploadedIds([]);
        if (files.length > 3) { setError('Kies maximaal 3 foto’s van hetzelfde recept.'); setPhotos([]); event.target.value = ''; return; }
        setError(''); setPhotos(files);
      }} /><small>Maximaal 3 foto’s, 8 MB en 12 megapixels per foto. JPG, PNG of WebP.</small>{photos.length > 0 && <p>{photos.length} foto{photos.length > 1 ? '’s' : ''} geselecteerd</p>}</div>
        : <><div className="import-field"><Label htmlFor={urlId}>Link naar het recept</Label><Input id={urlId} type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://voorbeeld.nl/recept" aria-describedby="import-url-help" disabled={pending} /><small id="import-url-help">Plak een link naar een recept. Sommige websites blokkeren automatisch ophalen; dan kun je een foto of screenshot gebruiken.</small></div>
          <details className="import-source-label"><summary>Bronnaam toevoegen (optioneel)</summary><Label htmlFor={labelId}>Bronnaam</Label><Input id={labelId} maxLength={200} value={sourceLabel} disabled={pending} onChange={event => setSourceLabel(event.target.value)} /></details></>}
      <div className="import-field"><Label htmlFor="import-servings">{shoppingOnly ? 'Personen' : 'Voor hoeveel personen kook je?'}</Label><QuantityStepper id="import-servings" label="personen" inputLabel={shoppingOnly ? 'Personen' : 'Voor hoeveel personen kook je?'} value={servings ? Number(servings) : null} max={1000} onChange={value => setServings(value === null ? '' : String(value))} disabled={pending} /></div>
      <Button type="submit" disabled={pending || !validServings(servings) || (sourceType === 'photo' ? photos.length === 0 : !url.trim())}>{pending ? 'Recept versturen…' : shoppingOnly ? 'Zoek boodschappen' : 'Lees het recept'}</Button>
    </form>}
    {!shoppingOnly && importId && !current && loading && <p className="panel" role="status">Importconcept laden…</p>}
    {importId && !current && !loading && <Button type="button" variant="outline" onClick={() => setRefreshNonce(value => value + 1)}>Opnieuw proberen</Button>}
    {shoppingOnly && inProgress && <ShoppingProgress stage={saving ? 'products' : pending ? 'source' : 'ingredients'} startedAt={startedAt ?? current?.createdAt} source={sourceName}/>}
    {shoppingOnly && current && !inProgress && !showTimeout && <div className="sp-import-result">
      {canChooseRecipe && current.candidates.length > 1 && candidateIndex === null && <><h2>Welke boodschappen wil je toevoegen?</h2><div className="sp-import-choices">{current.candidates.map((item,index)=><Button key={index} variant="outline" onClick={()=>{setSelectedIndex(index);setBaseConfirmed(false);}}>{item.title || `Recept ${index+1}`}</Button>)}</div></>}
      {canChooseRecipe && needsBase && !baseConfirmed && <form className="sp-source-servings" onSubmit={event=>{event.preventDefault();if(validServings(baseServings))setBaseConfirmed(true);}}><p className="sp-progress-source">{sourceName}</p><h2>{candidate?.title}</h2><p>Voor hoeveel personen zijn de hoeveelheden in de bron? Zo rekenen we jouw boodschappen goed om.</p>{current.sourceUrl && <a className="sp-source-link" href={current.sourceUrl} target="_blank" rel="noreferrer">Bekijk het oorspronkelijke recept ↗</a>}<label htmlFor="source-servings">Personen in de bron</label><QuantityStepper id="source-servings" label="personen in de bron" inputLabel="Personen in de bron" value={baseServings ? Number(baseServings) : null} max={1000} onChange={value=>setBaseServings(value===null?'':String(value))}/><Button type="submit" disabled={!validServings(baseServings)}>Zoek producten voor {servings} personen</Button></form>}
      {error && canChooseRecipe && (!needsBase || baseConfirmed) && <Button onClick={()=>void reviewRecipe()} disabled={saving}>Boodschappen opnieuw openen</Button>}
      {!canChooseRecipe && <><h2>We konden de ingrediënten nog niet lezen</h2><p>{current.status==='failed'?importErrorText(current.errorCode):!sourceAvailable?'Deze bron is verlopen. Kies je link of foto opnieuw.':recognitionFallbackText(current.recognition?.reasonCode ?? null)}</p></>}
    </div>}
    {shoppingOnly && (current || pending) && !saving && <button type="button" className="sp-import-reset" onClick={chooseOtherSource} disabled={pending}>Andere bron kiezen</button>}
    {!shoppingOnly && current && <div className="import-review">
      <div className="panel"><p role="status">{saving ? 'Recept openen…' : !sourceAvailable || current.status === 'expired' ? 'Deze import is verlopen.' : current.status === 'failed' ? importErrorText(current.errorCode) : current.status === 'queued' ? 'Je bron staat in de wachtrij.' : current.status === 'running' || recognizing ? 'We lezen je recept en de hoeveelheden…' : canChooseRecipe ? (needsBase ? 'Het aantal personen ontbreekt in de bron.' : 'Je recept is herkend.') : 'Automatische herkenning is nog niet gelukt.'}</p>
        {currentProcessing && <Button type="button" variant="outline" disabled={loading} onClick={() => setRefreshNonce(value => value + 1)}>Status vernieuwen</Button>}
      </div>
      {canChooseRecipe && current.candidates.length > 1 && !saving && <section className="panel"><h2>Welk recept wil je maken?</h2><div className="import-candidates">
        {current.candidates.map((item, index) => <Button key={index} variant="outline" onClick={() => { setSelectedIndex(index); setBaseConfirmed(false); }}>{item.title || `Recept ${index + 1}`}</Button>)}
      </div></section>}
      {canChooseRecipe && needsBase && !baseConfirmed && <form className="panel form-stack" onSubmit={event => { event.preventDefault(); if (validServings(baseServings)) setBaseConfirmed(true); }}>
        <label htmlFor="source-servings">Voor hoeveel personen is het oorspronkelijke recept “{candidate?.title}”?</label>
        <Input id="source-servings" type="number" min="1" max="1000" required value={baseServings} onChange={event => setBaseServings(event.target.value)} />
        <Button type="submit" disabled={!validServings(baseServings)}>Bevestig personen</Button>
      </form>}
      {canChooseRecipe && candidate && (!needsBase || baseConfirmed) && <section className="panel import-found"><h2>{candidate.title || 'Je gevonden recept'}</h2><p className="subtle">{candidate.ingredients.length} ingrediënten{!shoppingOnly && ` · ${candidate.steps.length} stappen`}</p><p>{shoppingOnly ? 'We zoeken producten en rekenen de verpakkingen voor je uit.' : 'Controleer de ingrediënten en pas aan wat nodig is.'}</p><Button disabled={saving} onClick={() => void reviewRecipe()}>{saving ? 'Openen…' : shoppingOnly ? 'Controleer boodschappen' : 'Controleer recept'}</Button></section>}
      {current.recognition && ['manual', 'unknown'].includes(current.recognition.state) && <p className="notice" role="status">{recognitionFallbackText(current.recognition.reasonCode)}</p>}
    </div>}
  </section>;
}
