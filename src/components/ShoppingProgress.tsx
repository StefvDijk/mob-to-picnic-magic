import { ShoppingLoader } from './ShoppingLoader';
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

type ShoppingStage = 'source' | 'ingredients' | 'products';
const labels = { source: 'Je bron ophalen', ingredients: 'Ingrediënten lezen', products: 'Producten zoeken' };

/** Indeterminate motion; phase and elapsed time come from the actual request. */
export function ShoppingProgress({ stage, startedAt, source, compact = false }: {
  stage: ShoppingStage; startedAt?: number | null; source?: string | null; compact?: boolean;
}) {
  const [mountedAt] = useState(Date.now);
  const start = startedAt ?? mountedAt;
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  const current = ['source', 'ingredients', 'products'].indexOf(stage);
  return <section className={`sp-progress ${compact ? 'sp-progress-compact' : ''}`} aria-busy="true" aria-label="Boodschappen voorbereiden">
    <ShoppingLoader/>
    <div className="sp-progress-copy"><p className="sp-progress-source">{source || 'Jouw boodschappen'}</p><h2 role="status">{labels[stage]}</h2><p>{stage === 'products' ? 'We zoeken passende verpakkingen en berekenen de aantallen.' : stage === 'ingredients' ? 'We halen de ingrediënten en hoeveelheden uit je bron.' : 'We halen je link of foto op en zetten de ingrediënten klaar.'}</p></div>
    <ol className="sp-progress-steps" aria-label="Voortgang">{(['source','ingredients','products'] as const).map((item,index)=><li key={item} data-state={index<current?'done':index===current?'active':'waiting'} aria-current={index===current?'step':undefined}><span aria-hidden="true">{index<current?<Check size={12}/>:index+1}</span>{['Bron','Ingrediënten','Producten'][index]}</li>)}</ol>
    <p className="sp-progress-time"><span>{elapsed} sec verstreken</span><span>{elapsed < 25 ? 'Na 30 sec kun je opnieuw controleren' : 'Het duurt langer. Je bron blijft bewaard.'}</span></p>
  </section>;
}
