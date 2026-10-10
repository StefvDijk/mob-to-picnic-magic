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
  onOpenAdmin: () => void;
}

export function AccountPanel({ me, onRefresh, onSignedOut, onOpenAdmin }: AccountPanelProps) {
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
    <div className="view-stack account-compact">
      <section className="account-group" aria-label="Accountgegevens">
        <div className="account-row account-email"><span>E-mailadres</span><strong>{me.account.email}</strong></div>
        <div className="account-row"><span>Sessie</span><Button variant="ghost" disabled={pending} onClick={() => run(async () => { await api.logout(); onSignedOut(); })}>Uitloggen</Button></div>
        <div className="account-row"><span>Alle apparaten</span><Button variant="ghost" disabled={pending} onClick={() => run(async () => { await api.logoutAll(); onSignedOut(); })}>Overal uitloggen</Button></div>
        {me.account.role === 'admin' && <div className="account-row"><span>Beheer</span><Button variant="ghost" onClick={onOpenAdmin}>Openen</Button></div>}
      </section>
      <section className="account-group account-danger" aria-label="Account verwijderen">
        <div className="account-row">
          <span>Account verwijderen</span>
          <AlertDialog onOpenChange={open => { if (!open) setConfirm(''); }}>
            <AlertDialogTrigger asChild><Button variant="ghost" disabled={pending}>Verwijderen</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Account en recepten verwijderen?</AlertDialogTitle>
                <AlertDialogDescription>Je toegang stopt direct. De app start daarna het verwijderen van je recepten en persoonlijke gegevens. Je Picnic-account en boodschappen blijven bestaan.</AlertDialogDescription>
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
        </div>
      </section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
    </div>
  );
}
