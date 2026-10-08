import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { api, ApiError, type MeDto } from '@/lib/api';
import type { PicnicCart, PicnicProduct } from '../../shared/picnic';
import { AuthPanel } from '@/components/AuthPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface PicnicPanelProps { me: MeDto; onRefresh: () => Promise<void> }
type Flow = 'credentials' | 'sms' | 'reauth';

function euro(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatQuantity(product: PicnicProduct): string {
  const quantity = product.quantity;
  if (!quantity || quantity.kind === 'unknown') return 'Hoeveelheid onbekend';
  if (quantity.kind === 'global') return 'Hoeveelheid niet gespecificeerd';
  const basis = quantity.basis === 'drained' ? ' uitgelekt' : quantity.basis === 'net' ? ' netto' : '';
  const amount = quantity.kind === 'range' ? `${quantity.amount}–${quantity.maximum}` : quantity.amount;
  return `${amount} ${quantity.unit ?? product.unitQuantity}${basis}`;
}

export function PicnicPanel({ me, onRefresh }: PicnicPanelProps) {
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<Flow>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [deliveryUncertain, setDeliveryUncertain] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<PicnicProduct[] | null>(null);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [cart, setCart] = useState<PicnicCart | null>(null);
  const [cartPending, setCartPending] = useState(false);
  const [cartError, setCartError] = useState('');
  const readGeneration = useRef(0);
  const cartRequest = useRef(0);
  const searchRequest = useRef(0);
  const dialogOpener = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const usernameId = useId();
  const passwordId = useId();
  const codeId = useId();
  const queryId = useId();
  const connected = me.picnic.status === 'connected';

  function resetFlow() {
    setUsername('');
    setPassword('');
    setCode('');
    setDeliveryUncertain(false);
    setFlow('credentials');
    setError('');
    setMessage('');
  }

  function invalidateReadData() {
    readGeneration.current += 1;
    setProducts(null);
    setCart(null);
    setSearchError('');
    setCartError('');
    setSearchPending(false);
    setCartPending(false);
  }

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    setOpen(nextOpen);
    if (!nextOpen) resetFlow();
  }

  async function handleReadError(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 401) {
      await onRefresh();
      return;
    }
    if (cause instanceof ApiError && cause.status === 409) {
      invalidateReadData();
      await onRefresh();
      return;
    }
  }

  async function loadCart() {
    if (!connected) return;
    const generation = readGeneration.current;
    const requestId = ++cartRequest.current;
    setCartPending(true);
    setCartError('');
    try {
      const result = await api.picnicCart();
      if (generation === readGeneration.current && requestId === cartRequest.current) setCart(result.cart);
    } catch (cause) {
      if (generation !== readGeneration.current || requestId !== cartRequest.current) return;
      await handleReadError(cause);
      if (cause instanceof ApiError && cause.status === 409) setCartError('De Picnic-koppeling is gewijzigd. Ververs het mandje.');
      else if (!(cause instanceof ApiError && cause.status === 401)) {
        setCartError(cause instanceof Error ? cause.message : 'Het mandje kon niet worden geladen.');
      }
    } finally {
      if (generation === readGeneration.current && requestId === cartRequest.current) setCartPending(false);
    }
  }

  useEffect(() => {
    invalidateReadData();
    if (connected) void loadCart();
    // `loadCart` intentionally follows connection status; refresh is an explicit button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await api.connectPicnic(username.trim(), password);
      setUsername('');
      setPassword('');
      if (result.verificationRequired) {
        setFlow('sms');
        setDeliveryUncertain(Boolean(result.deliveryUncertain));
        await onRefresh();
      } else {
        invalidateReadData();
        resetFlow();
        setOpen(false);
        setMessage('Je Picnic-account is gekoppeld.');
        await onRefresh();
        void loadCart();
      }
    } catch (cause) {
      setUsername('');
      setPassword('');
      if (cause instanceof ApiError && cause.status === 401) {
        await onRefresh();
      } else if (cause instanceof ApiError && cause.code === 'VERIFICATION_REQUIRED') {
        setFlow('reauth');
      } else {
        setError(cause instanceof Error ? cause.message : 'Picnic koppelen is mislukt.');
      }
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api.verifyPicnic(code.trim());
      invalidateReadData();
      resetFlow();
      setOpen(false);
      setMessage('De Picnic-verificatie is gelukt.');
      await onRefresh();
      void loadCart();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await onRefresh();
      else if (cause instanceof ApiError && cause.code === 'VERIFICATION_REQUIRED') {
        setCode(''); setUsername(''); setPassword(''); setFlow('reauth');
      } else if (cause instanceof ApiError && ['PICNIC_VERIFY_UNCERTAIN', 'PICNIC_VERIFICATION_EXPIRED', 'PICNIC_CONNECT_STALE', 'PICNIC_KEY_UNAVAILABLE'].includes(cause.code)) {
        invalidateReadData(); resetFlow(); setOpen(false); setError(cause.message); await onRefresh();
      } else setError(cause instanceof Error ? cause.message : 'De code kon niet worden gecontroleerd.');
    } finally {
      setPending(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    const generation = readGeneration.current;
    const requestId = ++searchRequest.current;
    setSearchPending(true);
    setSearchError('');
    try {
      const result = await api.searchPicnicProducts(term);
      if (generation === readGeneration.current && requestId === searchRequest.current) setProducts(result.products);
    } catch (cause) {
      if (generation !== readGeneration.current || requestId !== searchRequest.current) return;
      await handleReadError(cause);
      if (cause instanceof ApiError && cause.status === 409) setSearchError('De Picnic-koppeling is gewijzigd. Zoek opnieuw.');
      else if (!(cause instanceof ApiError && cause.status === 401)) {
        setSearchError(cause instanceof Error ? cause.message : 'Zoeken is mislukt.');
      }
    } finally {
      if (generation === readGeneration.current && requestId === searchRequest.current) setSearchPending(false);
    }
  }

  async function disconnect() {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await api.disconnectPicnic();
      invalidateReadData();
      setQuery('');
      setMessage('De Picnic-koppeling is verwijderd.');
      await onRefresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) await onRefresh();
      else setError(cause instanceof Error ? cause.message : 'Ontkoppelen is mislukt.');
    } finally {
      setPending(false);
    }
  }

  const openSms = (event: MouseEvent<HTMLButtonElement>) => {
    dialogOpener.current = event.currentTarget;
    setError('');
    setCode('');
    setFlow('sms');
    setDeliveryUncertain(false);
    setOpen(true);
  };

  return (
    <section className="panel picnic-panel" aria-labelledby="picnic-title">
      <div className="picnic-panel-heading">
        <div>
          <h2 id="picnic-title" ref={headingRef} tabIndex={-1}>Picnic-koppeling</h2>
          <p className="subtle">Status: {connected ? 'verbonden' : me.picnic.verificationRequired ? 'sms-code nodig' : me.picnic.status === 'invalid' ? 'opnieuw koppelen nodig' : 'niet verbonden'}.</p>
        </div>
        <div className="action-row">
          {!me.picnic.verificationRequired && <Button type="button" disabled={pending} onClick={event => { dialogOpener.current = event.currentTarget; resetFlow(); setOpen(true); }}>
            {connected ? 'Koppeling vervangen' : 'Picnic koppelen'}
          </Button>}
          {me.picnic.status !== 'disconnected' && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={pending}>Picnic ontkoppelen</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Picnic ontkoppelen?</AlertDialogTitle>
                <AlertDialogDescription>De app verwijdert de opgeslagen Picnic-koppelsleutel. Je externe Picnic-account en de inhoud van je Picnic-mandje blijven onaangetast.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Annuleren</AlertDialogCancel>
                <AlertDialogAction disabled={pending} onClick={event => { event.preventDefault(); void disconnect(); }}>
                  {pending ? 'Ontkoppelen…' : 'Koppeling verwijderen'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="picnic-dialog" onCloseAutoFocus={event => {
          event.preventDefault();
          if (dialogOpener.current?.isConnected) dialogOpener.current.focus();
          else headingRef.current?.focus();
        }}>
          <DialogHeader>
            <DialogTitle>{flow === 'sms' ? 'Bevestig je Picnic-account' : flow === 'reauth' ? 'Bevestig je e-mailadres' : 'Koppel je Picnic-account'}</DialogTitle>
            <DialogDescription>{flow === 'sms'
              ? 'Vul de code in die Picnic per sms heeft gestuurd. De code is 4 tot 8 cijfers. Er wordt geen nieuwe sms aangevraagd.'
              : flow === 'reauth'
                ? 'Voor het vervangen van een bestaande koppeling moet je je e-mailadres opnieuw bevestigen.'
                : 'Je Picnic-inloggegevens worden alleen gebruikt om de koppeling te maken.'}</DialogDescription>
          </DialogHeader>
          {flow === 'reauth' ? (
            <AuthPanel reverify initialEmail={me.account.email} onCancel={() => closeDialog(false)}
              onAuthenticated={async () => {
                await onRefresh();
                const current = await api.me();
                setPassword(''); setUsername(''); setCode('');
                setFlow(current.picnic.verificationRequired ? 'sms' : 'credentials');
                setMessage(current.picnic.verificationRequired
                  ? 'E-mailadres bevestigd. Vul de eerder aangevraagde Picnic-sms-code in.'
                  : 'E-mailadres bevestigd. Vul je Picnic-inloggegevens opnieuw in om de koppeling te vervangen.');
              }} />
          ) : flow === 'sms' ? (
            <form className="form-stack" onSubmit={verify}>
              {deliveryUncertain && <p className="picnic-warning" role="status">De sms-aanvraag is niet bevestigd. De sms kan al zijn aangekomen; controleer je berichten. Er wordt niet automatisch een nieuwe sms aangevraagd.</p>}
              <Label htmlFor={codeId}>Sms-code</Label>
              <Input id={codeId} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4,8}" maxLength={8}
                required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))} disabled={pending} />
              <Button type="submit" disabled={pending || code.length < 4}>{pending ? 'Controleren…' : 'Code controleren'}</Button>
            </form>
          ) : (
            <form className="form-stack" onSubmit={connect}>
              <Label htmlFor={usernameId}>E-mailadres of telefoonnummer van Picnic</Label>
              <Input id={usernameId} type="text" autoComplete="username" required maxLength={254}
                value={username} onChange={event => setUsername(event.target.value)} disabled={pending} />
              <Label htmlFor={passwordId}>Picnic-wachtwoord</Label>
              <Input id={passwordId} type="password" autoComplete="current-password" required maxLength={1024}
                value={password} onChange={event => setPassword(event.target.value)} disabled={pending} />
              <Button type="submit" disabled={pending || !username.trim() || !password}>{pending ? 'Koppelen…' : 'Picnic koppelen'}</Button>
            </form>
          )}
          {message && <p className="notice" role="status">{message}</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
        </DialogContent>
      </Dialog>

      {me.picnic.verificationRequired && <div className="picnic-resume">
        <p>{connected ? 'Voor de lopende vervanging is nog een Picnic-sms-code nodig. Je bestaande koppeling blijft actief.' : 'Er staat een Picnic-sms-verificatie klaar om te hervatten.'} De sms kan al zijn verstuurd; er wordt geen nieuwe aangevraagd.</p>
        <Button type="button" variant="outline" onClick={openSms}>Verder met sms-code</Button>
      </div>}

      {connected && <div className="picnic-readonly">
        <div className="picnic-section-heading"><div><h3>Producten zoeken</h3><p className="subtle">Alleen bekijken; zoeken verandert je Picnic-mandje niet.</p></div></div>
        <form className="picnic-search" onSubmit={search}>
          <Label htmlFor={queryId}>Productnaam</Label>
          <Input id={queryId} value={query} onChange={event => { setQuery(event.target.value); setProducts(null); setSearchError(''); setSearchPending(false); searchRequest.current += 1; }} maxLength={100} required />
          <Button type="submit" disabled={searchPending || !query.trim()}>{searchPending ? 'Zoeken…' : 'Zoeken'}</Button>
        </form>
        {searchError && <p className="error-message" role="alert">{searchError}</p>}
        {products && (products.length ? <ul className="picnic-product-list">{products.map(product => <li key={product.id}>
          <strong>{product.name}</strong><span>{formatQuantity(product)}{product.unitQuantity ? ` · Picnic-verpakking: ${product.unitQuantity}` : ''}</span>
          <span>{product.priceCertainty === 'conditional'
            ? `Prijs afhankelijk van aantal${product.displayPriceCents != null ? ` · getoonde prijs ${euro(product.displayPriceCents)}` : ' · bedrag onbekend'}`
            : product.priceCertainty === 'unknown' || product.displayPriceCents == null ? 'Prijs onbekend' : euro(product.displayPriceCents)}</span>
        </li>)}</ul> : <p className="empty-small" role="status">Geen producten gevonden.</p>)}

        <div className="picnic-section-heading picnic-cart-heading"><div><h3>Picnic-mandje</h3><p className="subtle">Alleen bekijken; er worden geen producten toegevoegd of gewijzigd.</p></div><Button type="button" variant="outline" onClick={() => void loadCart()} disabled={cartPending}>{cartPending ? 'Verversen…' : 'Verversen'}</Button></div>
        {cartError && <p className="error-message" role="alert">{cartError}</p>}
        {cartPending && !cart && <p className="subtle" role="status">Mandje laden…</p>}
        {cart && <>
          {cart.lines.length ? <ul className="picnic-product-list">{cart.lines.map((line, index) => <li key={`${line.productId}-${index}`}>
            <strong>{line.name}</strong><span>{line.quantity == null ? 'Aantal onbekend' : `Aantal: ${line.quantity}`}{line.unitQuantity ? ` · Picnic-verpakking: ${line.unitQuantity}` : ''}</span>
            <span>{line.unitPriceCents == null ? 'Prijs per verpakking onbekend' : `Prijs per verpakking: ${euro(line.unitPriceCents)}`}{line.isAvailable === false ? ' · niet beschikbaar' : line.isAvailable == null ? ' · beschikbaarheid onbekend' : ''}</span>
          </li>)}</ul> : <p className="empty-small">Er zijn geen mandjeregels gevonden.</p>}
          <p className="subtle picnic-cart-count">Aantal mandjeregels: {cart.lines.length}. Totaalbedrag wordt niet weergegeven.</p>
        </>}
      </div>}
      {error && !open && <p className="error-message" role="alert">{error}</p>}
      {message && !open && <p className="notice" role="status">{message}</p>}
    </section>
  );
}
