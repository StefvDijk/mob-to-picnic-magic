import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ActionDto, ExecutionLineState } from '../../shared/actions';
import { Button } from '@/components/ui/button';

const labels: Record<ExecutionLineState, string> = { unsent: 'Nog niet verstuurd', sending: 'Wordt toegevoegd', added: 'Toegevoegd', not_added: 'Niet toegevoegd', unknown: 'Uitkomst onbekend', skipped: 'Niet verstuurd' };
export function AdditionStatus({ id, onAuthExpired, onNewProposal }: { id: string; onAuthExpired: () => void; onNewProposal: () => void }) {
  const [action, setAction] = useState<ActionDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result = await api.getAction(id);
        if (stopped) return;
        setAction(result.action); setError('');
        if (['queued', 'running'].includes(result.action.state)) timer = setTimeout(load, 1500);
      } catch (cause) {
        if (stopped) return;
        if (cause instanceof ApiError && cause.status === 401) onAuthExpired();
        else setError('De status kon niet worden opgehaald. Verstuur de boodschappen niet opnieuw; controleer eerst de status.');
      }
    };
    void load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, refresh, onAuthExpired]);
  const resolve = async (lineId: string, resolution: 'confirmed_added' | 'confirmed_not_added') => {
    setBusy(true); setError('');
    try { const result = await api.resolveAction(id, lineId, resolution); setAction(result.action); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Bevestigen is niet gelukt.'); }
    finally { setBusy(false); }
  };
  return <section className="panel" aria-labelledby="addition-status-heading">
    <h3 id="addition-status-heading">Naar je Picnic-mand</h3>
    {error && <p role="alert">{error}</p>}
    {!action && !error && <p role="status">Status ophalen…</p>}
    {action && <>
      <p role="status">{action.state === 'succeeded' ? 'De producten zijn toegevoegd aan je Picnic-mand.' : action.state === 'queued' || action.state === 'running' ? 'Je boodschappen worden verwerkt.' : 'Controleer hieronder welke producten zijn toegevoegd.'}</p>
      <ul className="ingredient-list">{action.lines.map(line => <li key={line.id}>
        <strong>{line.count} × {line.name}</strong><span>{labels[line.status]}</span>
        {line.status === 'unknown' && <div className="form-stack">
          <p>Controleer dit product in de Picnic-app. We versturen het niet opnieuw. Bevestig daarna wat je hebt vastgesteld:</p>
          <Button disabled={busy} variant="outline" onClick={() => void resolve(line.id, 'confirmed_added')}>Ik heb gecontroleerd: toegevoegd</Button>
          <Button disabled={busy} variant="outline" onClick={() => void resolve(line.id, 'confirmed_not_added')}>Ik heb gecontroleerd: niet toegevoegd</Button>
        </div>}
      </li>)}</ul>
      <p className="subtle">Er is niets besteld of afgerekend. Je rondt een bestelling zelf af in Picnic.</p>
      {['succeeded', 'resolved', 'partial', 'stopped'].includes(action.state) && <Button variant="outline" onClick={onNewProposal}>Nieuw voorstel voor een volgende aankoop</Button>}
    </>}
    <Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Status vernieuwen</Button>
  </section>;
}
