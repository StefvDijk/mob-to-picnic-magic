import { INTERACTIVE_DEADLINE_MS } from '../../shared/workflow';
import { validServings } from '../../worker/domain/shopping';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ImportDto } from '../../shared/imports';
import { api, ApiError } from '@/lib/api';
import { importErrorText } from '@/lib/import-draft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prepareImportPhoto } from '@/lib/import-photo';
import { recognitionFallbackText } from '@/lib/import-draft';

interface ImportPanelProps {
  ownerId: string;
  onAuthExpired: () => void;
  onUseCandidate: (source: ImportDto, candidateIndex: number, servings: string, baseServings?: string, clientDeadlineAt?: number) => Promise<void>;
  onClose: () => void;
}

export function ImportPanel({ ownerId, onAuthExpired, onUseCandidate, onClose }: ImportPanelProps) {
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
  const attempted = useRef<string | null>(null);
  const recovery = useRef(false);
  const photoId = useId();
  const urlId = useId();
  const labelId = useId();

  useEffect(() => {
    if (clientDeadlineAt === null) return;
    const expire = () => { setTimedOut(true); setLoading(false); setMessage(''); };
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
        if ((result.import.status === 'queued' || result.import.status === 'running' || ['pending', 'counting', 'reserved', 'sending'].includes(result.import.recognition?.state ?? '')) && polls++ < 60) {
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
  }, [importId, onAuthExpired, storageKey, refreshNonce, timedOut]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validServings(servings) || pending) return;
    sessionStorage.setItem(`${storageKey}:servings`, servings);
    recovery.current=false;
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
      setMessage('We lezen je recept en zoeken daarna automatisch je boodschappen.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') setError('De uitkomst van het verzenden is onbekend. Je bron blijft hier staan; controleer je verbinding voordat je opnieuw probeert.');
      else setError(cause instanceof Error ? cause.message : 'De bron kon niet worden verstuurd.');
    } finally { setPending(false); }
  }

  function chooseOtherSource() {
    if (!window.confirm('Wil je een andere bron kiezen? Het huidige importconcept blijft nog op de server bestaan, maar verdwijnt uit dit scherm.')) return;
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(`${storageKey}:deadline`);
    setClientDeadlineAt(null); setTimedOut(false);
    setImportId(null); setCurrent(null); setSelectedIndex(null); setError(''); setMessage('');
  }

  const expiresAt = current && 'expiresAt' in current && typeof current.expiresAt === 'number' ? current.expiresAt : null;
  const sourceAvailable = expiresAt === null || expiresAt > Date.now();
  const recognizing = !!current?.recognition && ['pending', 'counting', 'reserved', 'sending'].includes(current.recognition.state);
  const canChooseRecipe = current && current.candidates.length > 0 && current.recognition?.state === 'ready' && sourceAvailable && ['needs_review', 'saved'].includes(current.status);
  const candidateIndex = current?.candidates.length === 1 ? 0 : selectedIndex;
  const candidate = candidateIndex === null ? null : current?.candidates[candidateIndex];
  const needsBase = !!candidate && !validServings(candidate.baseServings);
  useEffect(() => {
    if (timedOut || (clientDeadlineAt !== null && clientDeadlineAt <= Date.now()) || !canChooseRecipe || !candidate || candidateIndex === null || !current || !validServings(servings) || (needsBase && !baseConfirmed)) return;
    const key = `${current.id}:${candidateIndex}`;
    if (attempted.current === key) return;
    attempted.current = key; setSaving(true); setError('');
    void onUseCandidate(current, candidateIndex, servings, needsBase ? baseServings : undefined, clientDeadlineAt ?? undefined)
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Je recept kon niet worden bewaard.'))
      .finally(() => setSaving(false));
  }, [canChooseRecipe, candidate, candidateIndex, current, servings, needsBase, baseConfirmed, baseServings, onUseCandidate, refreshNonce, timedOut, clientDeadlineAt]);

  return <section className="import-panel" aria-labelledby="import-title">
    <div className="recipe-detail-top"><Button type="button" variant="ghost" onClick={onClose}>← Mijn recepten</Button>{current && <Button type="button" variant="outline" onClick={chooseOtherSource}>Andere bron kiezen</Button>}</div>
    <div className="page-heading"><p className="eyebrow">Recept toevoegen</p><h1 id="import-title">Van recept naar boodschappen</h1>
      <p className="subtle">Kies je recept en het aantal personen. Wij zoeken passende Picnic-producten en rekenen de aantallen uit.</p></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {timedOut && <div className="panel" role="alert"><p>Er is nog geen volledig voorstel binnen 30 seconden. Je bron blijft bewaard.</p>{importId && <Button type="button" variant="outline" onClick={() => { recovery.current=true; const deadline=Date.now()+INTERACTIVE_DEADLINE_MS; sessionStorage.setItem(`${storageKey}:deadline`,String(deadline)); setClientDeadlineAt(deadline); setTimedOut(false); setCurrent(null); attempted.current=null; setRefreshNonce(value=>value+1); }}>Bekijk bestaand resultaat</Button>}</div>}
    {message && !timedOut && <p className="notice" role="status">{message}</p>}
    {!importId && <form className="import-form panel" onSubmit={submit}>
      <fieldset disabled={pending}><legend>Kies een bron</legend><div className="import-source-options">
        <label><input type="radio" name="import-source" checked={sourceType === 'photo'} onChange={() => setSourceType('photo')} /> Foto of screenshot</label>
        <label><input type="radio" name="import-source" checked={sourceType === 'url'} onChange={() => setSourceType('url')} /> Receptlink</label>
      </div></fieldset>
      {sourceType === 'photo' ? <div className="import-field"><Label htmlFor={photoId}>Foto’s van je recept</Label><Input id={photoId} type="file" accept="image/jpeg,image/png,image/webp" multiple required disabled={pending} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        setUploadedIds([]);
        if (files.length > 3) { setError('Kies maximaal 3 foto’s van hetzelfde recept.'); setPhotos([]); event.target.value = ''; return; }
        setError(''); setPhotos(files);
      }} /><small>Maximaal 3 foto’s, 8 MB en 12 megapixels per foto. JPG, PNG of WebP.</small>{photos.length > 0 && <p>{photos.length} foto{photos.length > 1 ? '’s' : ''} geselecteerd</p>}</div>
        : <><div className="import-field"><Label htmlFor={urlId}>HTTPS-link van Culy of MOB</Label><Input id={urlId} type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.culy.nl/…" /></div>
          <div className="import-field"><Label htmlFor={labelId}>Bronnaam (optioneel)</Label><Input id={labelId} maxLength={200} value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} /></div></>}
      <div className="import-field"><Label htmlFor="import-servings">Voor hoeveel personen kook je?</Label><Input id="import-servings" type="number" min="1" max="1000" required value={servings} onChange={event => setServings(event.target.value)} disabled={pending} /></div>
      <Button type="submit" disabled={pending || !validServings(servings) || (sourceType === 'photo' ? photos.length === 0 : !url.trim())}>{pending ? 'Recept versturen…' : 'Zoek mijn boodschappen'}</Button>
    </form>}
    {importId && !current && loading && <p className="panel" role="status">Importconcept laden…</p>}
    {importId && !current && !loading && <Button type="button" variant="outline" onClick={() => setRefreshNonce(value => value + 1)}>Opnieuw proberen</Button>}
    {current && <div className="import-review">
      <div className="panel"><p role="status">{saving ? 'Recept bewaren en boodschappen ophalen…' : !sourceAvailable || current.status === 'expired' ? 'Deze import is verlopen.' : current.status === 'queued' ? 'Je bron staat in de wachtrij.' : current.status === 'running' || recognizing ? 'We lezen je recept en de hoeveelheden…' : current.status === 'failed' ? importErrorText(current.errorCode) : canChooseRecipe ? (needsBase ? 'Het aantal personen ontbreekt in de bron.' : 'Je recept is herkend.') : 'Automatische herkenning is nog niet gelukt.'}</p>
        {(current.status === 'queued' || current.status === 'running' || recognizing) && <Button type="button" variant="outline" disabled={loading} onClick={() => setRefreshNonce(value => value + 1)}>Status vernieuwen</Button>}
      </div>
      {canChooseRecipe && current.candidates.length > 1 && !saving && <section className="panel"><h2>Welk recept wil je maken?</h2><div className="import-candidates">
        {current.candidates.map((item, index) => <Button key={index} variant="outline" onClick={() => { setSelectedIndex(index); setBaseConfirmed(false); }}>{item.title || `Recept ${index + 1}`}</Button>)}
      </div></section>}
      {canChooseRecipe && needsBase && !baseConfirmed && <form className="panel form-stack" onSubmit={event => { event.preventDefault(); if (validServings(baseServings)) setBaseConfirmed(true); }}>
        <label htmlFor="source-servings">Voor hoeveel personen is het oorspronkelijke recept “{candidate?.title}”?</label>
        <Input id="source-servings" type="number" min="1" max="1000" required value={baseServings} onChange={event => setBaseServings(event.target.value)} />
        <Button type="submit" disabled={!validServings(baseServings)}>Bereken voor {servings} personen</Button>
      </form>}
      {error && canChooseRecipe && !saving && <Button onClick={() => { attempted.current = null; setRefreshNonce(value => value + 1); }}>Bewaren opnieuw proberen</Button>}
      {current.recognition && ['manual', 'unknown'].includes(current.recognition.state) && <p className="notice" role="status">{recognitionFallbackText(current.recognition.reasonCode)}</p>}
    </div>}
  </section>;
}
