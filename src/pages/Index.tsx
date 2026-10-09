import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenText, Settings2, UserRound, ShoppingBasket, ChefHat, ArrowRight, Check } from 'lucide-react';
import { api, ApiError, type MeDto } from '@/lib/api';
import { AuthPanel } from '@/components/AuthPanel';
import { AccountPanel } from '@/components/AccountPanel';
import { AdminPanel } from '@/components/AdminPanel';
import { PicnicPanel } from '@/components/PicnicPanel';
import { RecipeWorkspace } from '@/components/RecipeWorkspace';

type Section = 'recipes' | 'picnic' | 'account' | 'admin';

function clearOwnerDrafts(ownerId: string) {
  sessionStorage.removeItem(`picnic:recipe-draft:${ownerId}`);
  sessionStorage.removeItem(`picnic:pending-import:${ownerId}`);
}

export default function Index() {
  const [me, setMe] = useState<MeDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('recipes');
  const lastOwner = useRef<string | null>(null);

  const refreshMe = useCallback(async () => {
    setError('');
    try {
      const next = await api.me();
      if (lastOwner.current && lastOwner.current !== next.account.id) {
        clearOwnerDrafts(lastOwner.current);
      }
      lastOwner.current = next.account.id;
      setMe(next);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setMe(null);
      } else {
        setError(cause instanceof Error ? cause.message : 'De app kon niet worden geladen.');
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/invite') {
      // Invitation tokens are only entry links; the server binds access to the email code.
      window.history.replaceState(null, '', '/');
    }
    void refreshMe();
  }, [refreshMe]);

  function signedOut() {
    if (lastOwner.current) clearOwnerDrafts(lastOwner.current);
    lastOwner.current = null;
    setMe(null);
    setError('');
    setSection('recipes');
  }

  if (loading) return <main className="loading-screen" aria-live="polite"><p>Je recepten laden…</p></main>;

  if (error && !me && !lastOwner.current) return <main className="auth-layout"><div className="auth-card" role="alert"><h1>Verbinding mislukt</h1><p>{error}</p><button className="text-button" onClick={() => void refreshMe()}>Opnieuw proberen</button></div></main>;

  if (!me) return <main className="welcome-layout">
      <section className="welcome-story"><div className="brand"><span className="brand-mark"><ChefHat aria-hidden="true" /></span>Mijn recepten</div><div><p className="eyebrow">Van kookidee naar boodschappen</p><h1>Wat eten<br />we vandaag?</h1><p>Al je favoriete recepten op één plek. Kies je porties, bekijk je boodschappen en zet ze klaar in Picnic.</p><ol className="welcome-steps"><li><BookOpenText aria-hidden="true" />Bewaar je favoriete recepten</li><li><Check aria-hidden="true" />Kies wat bij jou past</li><li><ShoppingBasket aria-hidden="true" />Vul je Picnic-mandje</li></ol></div><p className="welcome-note">Jouw receptenapp, gekoppeld aan Picnic.</p></section>
      <div className="welcome-login">{error && <p className="notice" role="status">{error}</p>}<AuthPanel onAuthenticated={refreshMe} /></div></main>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ga naar inhoud</a>
    <header className="site-header"><div className="site-header-inner">
      <button className="brand" type="button" onClick={() => setSection('recipes')} aria-label="Naar mijn recepten"><span className="brand-mark"><ChefHat aria-hidden="true" /></span><span>Mijn recepten</span></button>
      <nav className="app-nav" aria-label="Hoofdnavigatie">
        <button type="button" aria-current={section === 'recipes' ? 'page' : undefined} onClick={() => setSection('recipes')}><BookOpenText aria-hidden="true" />Recepten</button>
        <button type="button" aria-current={section === 'picnic' ? 'page' : undefined} onClick={() => setSection('picnic')}><ShoppingBasket aria-hidden="true" />Picnic</button>
        <button type="button" aria-current={section === 'account' ? 'page' : undefined} onClick={() => setSection('account')}><UserRound aria-hidden="true" />Account</button>
        {me.account.role === 'admin' && <button type="button" aria-current={section === 'admin' ? 'page' : undefined} onClick={() => setSection('admin')}><Settings2 aria-hidden="true" />Beheer</button>}
      </nav>
      <button className="connection-chip" onClick={() => setSection('picnic')}><span className={me.picnic.status === 'connected' ? 'status-dot connected' : 'status-dot'} />{me.picnic.status === 'connected' ? 'Picnic verbonden' : 'Koppel Picnic'}<ArrowRight size={15} aria-hidden="true" /></button>
    </div></header>
    <div className="app-grid">
      <main id="main-content" className="main-content" tabIndex={-1}>
        {error && <p className="error-message" role="alert">{error}</p>}
        {section === 'recipes' && <RecipeWorkspace key={me.account.id} me={me} onAuthExpired={() => { setMe(null); setError('Je sessie is verlopen. Log opnieuw in om verder te gaan. Je concept blijft op dit apparaat bewaard.'); }} />}
        {section === 'picnic' && <div className="view-stack"><header className="page-heading"><p className="eyebrow">Van recept naar mandje</p><h1>Jouw Picnic</h1><p className="subtle">Verbind je account, zoek producten en bekijk wat er in je mandje zit.</p></header><PicnicPanel me={me} onRefresh={refreshMe} /><p className="app-footnote">Mijn recepten is een onafhankelijke testapp. Bestellen en afrekenen doe je in de Picnic-app.</p></div>}
        {section === 'account'  && <AccountPanel me={me} onRefresh={refreshMe} onSignedOut={signedOut} />}
        {section === 'admin' && me.account.role === 'admin' && <AdminPanel me={me} onRefreshMe={refreshMe} />}
      </main>
    </div>
  </div>;
}
