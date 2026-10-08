import { useId, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AuthPanelProps {
  onAuthenticated: () => void | Promise<void>;
  initialEmail?: string;
  onCancel?: () => void;
  reverify?: boolean;
}

export function AuthPanel({ onAuthenticated, initialEmail = '', onCancel, reverify = false }: AuthPanelProps) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const emailId = useId();
  const codeId = useId();

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      await api.sendCode(email.trim().toLowerCase());
      setStage('code');
      setMessage('Als dit adres toegang heeft, ontvang je een code per e-mail. De code is 10 minuten geldig.');
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'De code kon niet worden aangevraagd.');
    } finally {
      setPending(false);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api.signIn(email.trim().toLowerCase(), code.trim());
      await onAuthenticated();
    } catch (cause) {
      setError(cause instanceof ApiError && [400, 401, 403].includes(cause.status) ? 'Deze code is ongeldig of verlopen. Vraag zo nodig een nieuwe aan.'
        : cause instanceof Error ? cause.message : 'Inloggen is mislukt.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">Besloten pilot</p>
      <h1 id="auth-title">{reverify ? 'Bevestig je e-mailadres' : 'Welkom bij je recepten'}</h1>
      <p className="subtle">{reverify
        ? 'Voor deze handeling vragen we een nieuwe e-mailcode.'
        : 'Log in met het e-mailadres waarop je bent uitgenodigd. Je recepten blijven aan je account gekoppeld.'}</p>
      {stage === 'email' ? (
        <form className="form-stack" onSubmit={sendCode}>
          <Label htmlFor={emailId}>E-mailadres</Label>
          <Input id={emailId} type="email" autoComplete="email" inputMode="email" required
            value={email} onChange={event => setEmail(event.target.value)} readOnly={reverify} disabled={pending} />
          <Button type="submit" disabled={pending || !email.trim()}>{pending ? 'Code aanvragen…' : 'Stuur mij een code'}</Button>
        </form>
      ) : (
        <form className="form-stack" onSubmit={signIn}>
          <p className="subtle">Code aangevraagd voor <strong>{email}</strong>.</p>
          <Label htmlFor={codeId}>Zescijferige e-mailcode</Label>
          <Input ref={codeRef} id={codeId} type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} required value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={pending} />
          <Button type="submit" disabled={pending || code.length !== 6}>{pending ? 'Controleren…' : 'Inloggen'}</Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => { setStage('email'); setCode(''); setMessage(''); setError(''); }}>
            {reverify ? 'Nieuwe code aanvragen' : 'Ander adres of nieuwe code'}
          </Button>
        </form>
      )}
      {message && <p className="notice" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Annuleren</Button>}
    </section>
  );
}
