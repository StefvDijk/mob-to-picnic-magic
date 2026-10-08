import { useState } from 'react';
import { api, ApiError, type MeDto } from '@/lib/api';
import { AuthPanel } from '@/components/AuthPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface AccountPanelProps {
  me: MeDto;
  onRefresh: () => Promise<void>;
  onSignedOut: () => void;
}

export function AccountPanel({ me, onRefresh, onSignedOut }: AccountPanelProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reverify, setReverify] = useState(false);

  async function run(action: () => Promise<unknown>, success?: string) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await action();
      if (success) setMessage(success);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await onRefresh();
      } else if (cause instanceof ApiError && cause.code === 'VERIFICATION_REQUIRED') {
        setReverify(true);
      } else {
        setError(cause instanceof Error ? cause.message : 'De handeling is mislukt.');
      }
    } finally {
      setPending(false);
    }
  }

  if (reverify) return <AuthPanel reverify initialEmail={me.account.email} onCancel={() => setReverify(false)}
    onAuthenticated={async () => { await onRefresh(); setReverify(false); setMessage('E-mailadres bevestigd. Kies de handeling opnieuw.'); }} />;

  return (
    <div className="view-stack">
      <div className="page-heading">
        <p className="eyebrow">Jouw gegevens</p>
        <h1>Account</h1>
        <p className="subtle">Je recepten horen bij <strong>{me.account.email}</strong>.</p>
      </div>

      <section className="panel" aria-labelledby="session-title">
        <h2 id="session-title">Ingelogde apparaten</h2>
        <p className="subtle">Je sessie verloopt uiterlijk op {new Date(me.session.expiresAt).toLocaleDateString('nl-NL')}.</p>
        <div className="action-row">
          <Button variant="outline" disabled={pending} onClick={() => run(async () => { await api.logout(); onSignedOut(); })}>Uitloggen op dit apparaat</Button>
          <Button variant="outline" disabled={pending} onClick={() => run(async () => { await api.logoutAll(); onSignedOut(); })}>Uitloggen op alle apparaten</Button>
        </div>
      </section>

      <section className="panel" aria-labelledby="picnic-title">
        <h2 id="picnic-title">Picnic-koppeling</h2>
        <p className="subtle">Status: {me.picnic.status === 'connected' ? 'verbonden' : 'niet verbonden'}.</p>
        <p className="subtle">Koppelen en boodschappen toevoegen worden in een volgende bouwstap beschikbaar. Je kunt nu al recepten bewaren.</p>
      </section>

      <section className="panel danger-panel" aria-labelledby="delete-title">
        <h2 id="delete-title">Account verwijderen</h2>
        <p>Je toegang stopt direct. De app start daarna het verwijderen van je recepten en persoonlijke gegevens. Dit verwijdert je Picnic-account of bestaande boodschappen niet.</p>
        <AlertDialog onOpenChange={open => { if (!open) setConfirm(''); }}>
          <AlertDialogTrigger asChild><Button variant="destructive" disabled={pending}>Account verwijderen</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Account en recepten verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>Je toegang stopt direct. Het verwijderen van je gegevens wordt daarna uitgevoerd. Je Picnic-account en boodschappen blijven bestaan.</AlertDialogDescription>
            </AlertDialogHeader>
            <Label htmlFor="delete-confirm">Typ VERWIJDER ACCOUNT om te bevestigen</Label>
            <Input id="delete-confirm" autoComplete="off" value={confirm} onChange={event => setConfirm(event.target.value)} />
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction disabled={confirm !== 'VERWIJDER ACCOUNT' || pending}
                onClick={() => { void run(async () => { await api.deleteAccount(); onSignedOut(); }); }}>
                {pending ? 'Verwijderen…' : 'Verwijderen starten'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
    </div>
  );
}
