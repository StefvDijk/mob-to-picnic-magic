import { Link } from 'react-router-dom';

export default function NotFound() {
  return <main className="auth-layout"><section className="auth-card" aria-labelledby="not-found-title">
    <p className="eyebrow">Pagina niet gevonden</p><h1 id="not-found-title">Deze pagina bestaat niet</h1>
    <p className="subtle">De link is misschien verouderd. Ga terug naar je recepten.</p>
    <Link to="/">Naar mijn recepten</Link>
  </section></main>;
}
