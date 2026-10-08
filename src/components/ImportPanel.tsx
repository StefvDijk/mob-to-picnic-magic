import { useEffect, useId, useState, type FormEvent } from 'react';
import type { ImportDto } from '../../shared/imports';
import { api, ApiError } from '@/lib/api';
import { importErrorText, importIssueText } from '@/lib/import-draft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ImportPanelProps {
  ownerId: string;
  onAuthExpired: () => void;
  onUseCandidate: (source: ImportDto, candidateIndex: number | null) => void;
  onClose: () => void;
}

export function ImportPanel({ ownerId, onAuthExpired, onUseCandidate, onClose }: ImportPanelProps) {
  const storageKey = `picnic:pending-import:${ownerId}`;
  const [sourceType, setSourceType] = useState<'text' | 'url'>('text');
  const [text, setText] = useState('');
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
  const textId = useId();
  const urlId = useId();
  const labelId = useId();

  useEffect(() => {
    if (!importId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let failures = 0;
    async function refresh() {
      setLoading(true);
      try {
        const result = await api.getImport(importId!);
        if (!active) return;
        setCurrent(result.import);
        setError('');
        setLoading(false);
        failures = 0;
        if ((result.import.status === 'queued' || result.import.status === 'running') && polls++ < 20) {
          timer = setTimeout(refresh, 3000);
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
          if (polls++ < 20) timer = setTimeout(refresh, Math.min(30_000, 3000 * 2 ** Math.min(failures++, 3)));
        }
      }
    }
    void refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [importId, onAuthExpired, storageKey, refreshNonce]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true); setError(''); setMessage('');
    try {
      const result = sourceType === 'text' ? await api.importText(text) : await api.importUrl(url.trim(), sourceLabel.trim() || undefined);
      sessionStorage.setItem(storageKey, result.import.id);
      setCurrent(result.import); setImportId(result.import.id); setSelectedIndex(null);
      setMessage('Je bron is ontvangen en wordt verwerkt. Je kunt later terugkomen.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
      else if (cause instanceof ApiError && cause.code === 'NETWORK_ERROR') setError('De uitkomst van het verzenden is onbekend. Je tekst blijft hier staan; controleer je verbinding voordat je opnieuw probeert.');
      else setError(cause instanceof Error ? cause.message : 'De bron kon niet worden verstuurd.');
    } finally { setPending(false); }
  }

  function chooseOtherSource() {
    if (!window.confirm('Wil je een andere bron kiezen? Het huidige importconcept blijft nog op de server bestaan, maar verdwijnt uit dit scherm.')) return;
    sessionStorage.removeItem(storageKey);
    setImportId(null); setCurrent(null); setSelectedIndex(null); setError(''); setMessage('');
  }

  const expiresAt = current && 'expiresAt' in current && typeof current.expiresAt === 'number' ? current.expiresAt : null;
  const sourceAvailable = expiresAt === null || expiresAt > Date.now();
  const canChooseRecipe = current && sourceAvailable && (current.status === 'needs_review' || (current.status === 'saved' && current.candidates.length > 1));
  const issues = current ? [...new Set([...current.uncertainties, ...(selectedIndex !== null ? current.candidates[selectedIndex]?.uncertainty ?? [] : [])])] : [];

  return <section className="import-panel" aria-labelledby="import-title">
    <div className="recipe-detail-top"><Button type="button" variant="ghost" onClick={onClose}>← Mijn recepten</Button>{current && <Button type="button" variant="outline" onClick={chooseOtherSource}>Andere bron kiezen</Button>}</div>
    <div className="page-heading"><p className="eyebrow">Recept toevoegen</p><h1 id="import-title">Importeren en controleren</h1>
      <p className="subtle">Bekijk de bron, kies zo nodig één recept en controleer de gegevens voordat je bewaart.</p></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {!importId && <form className="import-form panel" onSubmit={submit}>
      <fieldset><legend>Kies een bron</legend><div className="import-source-options">
        <label><input type="radio" name="import-source" checked={sourceType === 'text'} onChange={() => setSourceType('text')} /> Tekst plakken</label>
        <label><input type="radio" name="import-source" checked={sourceType === 'url'} onChange={() => setSourceType('url')} /> Receptlink</label>
      </div></fieldset>
      {sourceType === 'text' ? <div className="import-field"><Label htmlFor={textId}>Recepttekst</Label><Textarea id={textId} rows={12} maxLength={50000} required value={text} onChange={event => setText(event.target.value)} placeholder="Plak hier je recept, inclusief ingrediënten en stappen." /><small>{text.length} van 50.000 tekens</small></div>
        : <><div className="import-field"><Label htmlFor={urlId}>HTTPS-link van Culy of MOB</Label><Input id={urlId} type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://www.culy.nl/…" /></div>
          <div className="import-field"><Label htmlFor={labelId}>Bronnaam (optioneel)</Label><Input id={labelId} maxLength={200} value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} /></div></>}
      <Button type="submit" disabled={pending || (sourceType === 'text' ? !text.trim() : !url.trim())}>{pending ? 'Versturen…' : 'Bron importeren'}</Button>
    </form>}
    {importId && !current && loading && <p className="panel" role="status">Importconcept laden…</p>}
    {importId && !current && !loading && <Button type="button" variant="outline" onClick={() => setRefreshNonce(value => value + 1)}>Opnieuw proberen</Button>}
    {current && <div className="import-review">
      <div className="panel"><h2>Verwerking</h2><p role="status">{!sourceAvailable || current.status === 'expired' ? 'Dit importconcept is verlopen.' : current.status === 'queued' ? 'Je bron staat in de wachtrij.' : current.status === 'running' ? 'Je bron wordt verwerkt.' : current.status === 'needs_review' ? 'Je bron is klaar om te controleren.' : current.status === 'failed' ? importErrorText(current.errorCode) : current.candidates.length > 1 ? 'Er is een recept bewaard. Je kunt nog een ander gevonden recept controleren.' : 'Dit recept is al bewaard.'}</p>
        {expiresAt && <p className="subtle">Concept beschikbaar tot {new Date(expiresAt).toLocaleString('nl-NL')}.</p>}
        {(current.status === 'queued' || current.status === 'running') && <Button type="button" variant="outline" disabled={loading} onClick={() => setRefreshNonce(value => value + 1)}>{loading ? 'Verversen…' : 'Status verversen'}</Button>}
      </div>
      {(current.sourceText || current.sourceUrl) && <section className="panel import-source" aria-labelledby="source-title"><h2 id="source-title">Oorspronkelijke bron</h2>
        {current.sourceText ? <pre>{current.sourceText}</pre> : current.sourceUrl && <a href={current.sourceUrl} target="_blank" rel="noreferrer">Open de bronpagina ↗</a>}
      </section>}
      {issues.length > 0 && <section className="panel" aria-labelledby="review-points"><h2 id="review-points">Controlepunten</h2><ul>{issues.map(issue => <li key={issue}>{importIssueText(issue)}</li>)}</ul></section>}
      {canChooseRecipe && <section className="panel" aria-labelledby="candidates-title"><h2 id="candidates-title">Receptgegevens</h2>
        {current.candidates.length > 0 ? <><p>Kies het recept dat je wilt controleren. De oorspronkelijke ingrediëntregels blijven behouden.</p><fieldset className="import-candidates"><legend>Gevonden recepten</legend>
          {current.candidates.map((candidate, index) => <label key={index}><input type="radio" name="candidate" checked={selectedIndex === index} onChange={() => setSelectedIndex(index)} /> <strong>{candidate.title || `Recept ${index + 1}`}</strong><span>{candidate.ingredients.length} ingrediënten · {candidate.steps.length} stappen{candidate.baseServings ? ` · ${candidate.baseServings} porties` : ''}</span></label>)}
        </fieldset><Button type="button" disabled={selectedIndex === null} onClick={() => onUseCandidate(current, selectedIndex)}>Gekozen recept controleren</Button></>
          : <><p>Vul het recept aan met de bron naast je. Ontbrekende hoeveelheden blijven onbekend totdat je ze zelf controleert.</p><Button type="button" onClick={() => onUseCandidate(current, null)}>Recept handmatig invullen</Button></>}
      </section>}
      {current.status === 'failed' && sourceAvailable && <Button type="button" variant="outline" onClick={() => onUseCandidate(current, null)}>Recept handmatig invullen</Button>}
    </div>}
  </section>;
}
