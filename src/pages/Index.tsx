import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpenText, Settings2, UserRound } from 'lucide-react';
import { api, ApiError, type MeDto } from '@/lib/api';
import { AuthPanel } from '@/components/AuthPanel';
import { AccountPanel } from '@/components/AccountPanel';
import { AdminPanel } from '@/components/AdminPanel';
import { RecipeWorkspace } from '@/components/RecipeWorkspace';

type Section = 'recipes' | 'account' | 'admin';

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

  if (!me) return <main className="auth-layout">{error && <p className="notice" role="status">{error}</p>}<AuthPanel onAuthenticated={refreshMe} /></main>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Ga naar inhoud</a>
    <header className="site-header">
      <div className="site-header-inner"><div className="brand"><span className="brand-mark" aria-hidden="true">●</span><span>Mijn recepten</span></div>
        <span className="pilot-pill">{me.environment === 'production' ? 'Pilot' : me.environment === 'test' ? 'Testomgeving' : 'Ontwikkeling'}</span></div>
    </header>
    <div className="app-grid">
      <nav className="app-nav" aria-label="Hoofdnavigatie">
        <button type="button" aria-current={section === 'recipes' ? 'page' : undefined} onClick={() => setSection('recipes')}><BookOpenText aria-hidden="true" />Mijn recepten</button>
        <button type="button" aria-current={section === 'account' ? 'page' : undefined} onClick={() => setSection('account')}><UserRound aria-hidden="true" />Account</button>
        {me.account.role === 'admin' && <button type="button" aria-current={section === 'admin' ? 'page' : undefined} onClick={() => setSection('admin')}><Settings2 aria-hidden="true" />Beheer</button>}
      </nav>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {error && <p className="error-message" role="alert">{error}</p>}
        {section === 'recipes' && <RecipeWorkspace key={me.account.id} me={me} onAuthExpired={() => { setMe(null); setError('Je sessie is verlopen. Log opnieuw in om verder te gaan. Je concept blijft op dit apparaat bewaard.'); }} />}
        {section === 'account' && <AccountPanel me={me} onRefresh={refreshMe} onSignedOut={signedOut} />}
        {section === 'admin' && me.account.role === 'admin' && <AdminPanel me={me} onRefreshMe={refreshMe} />}
      </main>
    </div>
  </div>;
}
