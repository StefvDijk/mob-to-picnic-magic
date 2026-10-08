import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type AdminOverviewDto, type MeDto } from '@/lib/api';
import { AuthPanel } from '@/components/AuthPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface AdminPanelProps { me: MeDto; onRefreshMe: () => Promise<void> }

export function AdminPanel({ me, onRefreshMe }: AdminPanelProps) {
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reverify, setReverify] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setOverview(await api.adminOverview()); }
    catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await onRefreshMe();
      else setError(cause instanceof Error ? cause.message : 'Beheer kon niet worden geladen.');
    }
  }, [onRefreshMe]);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, action: () => Promise<unknown>, success: string): Promise<boolean> {
    setPending(key);
    setError('');
    setMessage('');
    try {
      await action();
      await load();
      setMessage(success);
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await onRefreshMe();
      else if (cause instanceof ApiError && cause.code === 'VERIFICATION_REQUIRED') setReverify(true);
      else setError(cause instanceof Error ? cause.message : 'De handeling is mislukt.');
      return false;
    } finally { setPending(null); }
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    const created = await run('invite', () => api.invite(email.trim().toLowerCase()), 'De uitnodiging is aangemaakt en verzonden.');
    if (created) setEmail('');
  }

  if (reverify) return <AuthPanel reverify initialEmail={me.account.email} onCancel={() => setReverify(false)}
    onAuthenticated={async () => { await onRefreshMe(); setReverify(false); setMessage('E-mailadres bevestigd. Kies de handeling opnieuw.'); }} />;

  const occupied = overview ? overview.accounts.filter(account => ['active', 'blocked', 'deleting'].includes(account.status)).length
    + overview.invitations.filter(invitation => invitation.status === 'pending' && invitation.expiresAt > Date.now()).length : 0;

  return <div className="view-stack">
    <div className="page-heading">
      <p className="eyebrow">Besloten pilot</p>
      <h1>Beheer</h1>
      <p className="subtle">Nodig mensen uit en beheer toegang en stopinstellingen. Recepten van anderen zijn hier niet zichtbaar.</p>
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {message && <p className="notice" role="status">{message}</p>}
    {!overview ? <div className="panel"><p>Beheer laden…</p><Button variant="outline" onClick={() => void load()}>Opnieuw laden</Button></div> : <>
      <section className="panel" aria-labelledby="invite-title">
        <h2 id="invite-title">Uitnodigingen</h2>
        <p className="subtle">{Math.max(0, 10 - occupied)} van 10 plekken vrij. Een open uitnodiging houdt een plek vrij.</p>
        <form className="inline-form" onSubmit={submitInvite}>
          <div className="field-grow"><Label htmlFor="invite-email">E-mailadres</Label><Input id="invite-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={pending !== null} /></div>
          <Button type="submit" disabled={pending !== null || !email.trim()}>{pending === 'invite' ? 'Verzenden…' : 'Uitnodigen'}</Button>
        </form>
        {overview.invitations.length === 0 ? <p className="empty-small">Nog geen uitnodigingen.</p> : <ul className="admin-list">
          {overview.invitations.map(invitation => <li key={invitation.id}>
            <div><strong>{invitation.email}</strong><p className="subtle">{invitation.status === 'pending' ? `Open tot ${new Date(invitation.expiresAt).toLocaleDateString('nl-NL')}` : invitation.status}</p></div>
            {invitation.status === 'pending' && <Button variant="outline" disabled={pending !== null}
              onClick={() => void run(invitation.id, () => api.revokeInvitation(invitation.id), 'Uitnodiging ingetrokken.')}>Intrekken</Button>}
          </li>)}
        </ul>}
      </section>

      <section className="panel" aria-labelledby="accounts-title">
        <h2 id="accounts-title">Accounts</h2>
        <ul className="admin-list">
          {overview.accounts.map(account => <li key={account.id}>
            <div><strong>{account.email}</strong><p className="subtle">{account.role === 'admin' ? 'Beheerder' : 'Gebruiker'} · {account.status === 'active' ? 'actief' : account.status === 'blocked' ? 'geblokkeerd' : account.status}</p></div>
            {account.role !== 'admin' && (account.status === 'active' || account.status === 'blocked') && <Button variant="outline" disabled={pending !== null}
              onClick={() => void run(account.id, () => api.setAccountStatus(account.id, account.status === 'active' ? 'blocked' : 'active'), account.status === 'active' ? 'Account geblokkeerd.' : 'Account opnieuw actief.')}>{account.status === 'active' ? 'Blokkeren' : 'Activeren'}</Button>}
          </li>)}
        </ul>
      </section>

      <section className="panel" aria-labelledby="switches-title">
        <h2 id="switches-title">Stopinstellingen</h2>
        <p className="subtle">Zet nieuwe AI-verwerking of nieuwe toevoegacties los van elkaar stil. Bestaande recepten blijven beschikbaar.</p>
        <div className="switch-row"><div><Label htmlFor="ai-switch">AI-verwerking</Label><p className="subtle">Nieuwe betaalde herkenning toestaan</p></div><Switch id="ai-switch" checked={overview.switches.aiEnabled} disabled={pending !== null}
          onCheckedChange={checked => void run('ai', () => api.setSwitches({ aiEnabled: checked }), 'AI-instelling opgeslagen.')} /></div>
        <div className="switch-row"><div><Label htmlFor="add-switch">Toevoegen aan Picnic</Label><p className="subtle">Nieuwe toevoegacties toestaan</p></div><Switch id="add-switch" checked={overview.switches.addEnabled} disabled={pending !== null}
          onCheckedChange={checked => void run('add', () => api.setSwitches({ addEnabled: checked }), 'Toevoeginstelling opgeslagen.')} /></div>
      </section>

      <section className="panel" aria-labelledby="usage-title"><h2 id="usage-title">Verbruik</h2>
        <p className="subtle">AI-budget {overview.usage.month}: €{(overview.usage.ai.spentCents / 100).toFixed(2).replace('.', ',')} gebruikt van €{(overview.usage.ai.capCents / 100).toFixed(2).replace('.', ',')}.</p>
        {overview.usage.email.map(period => <p className="subtle" key={period.period}>E-mails {period.period}: {period.sentCount} verzonden, {period.reservedCount} gereserveerd van {period.capCount}.</p>)}
        {overview.errors.length > 0 && <p className="subtle">Er zijn {overview.errors.length} gemelde fouten.</p>}
      </section>
    </>}
  </div>;
}
