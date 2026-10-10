import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductCard, ProductSummary, ProductRail, MatchBadge, QuantityStepper } from '@/components/picnic/catalog';
import type { PicnicProduct } from '../../shared/picnic';

const example: PicnicProduct = { id: 'design-example', name: 'Picnic water bruisend', imageId: 'ef692984ed21bf2ef145688689fa26c1c08eb4e40eb7c8dbed5e21f027d705d3', unitQuantity: '1.5 liter', quantity: { kind: 'exact', amount: '1500', unit: 'ml', basis: 'net' }, displayPriceCents: 79, priceCertainty: 'known', priceRanges: [], identity: { groupId: 'design-example', variantId: 'design-example' } };
const swatches = [['Merkrood', '#d52b1e'], ['Actiegroen', '#295813'], ['Tekst', '#333333'], ['Secundaire tekst', '#68625e'], ['Achtergrond', '#faf9f6'], ['Selectie', '#eef3e8']];
export default function DesignSystem() {
  const [count, setCount] = useState<number | null>(1);
  const [selected, setSelected] = useState(0);
  const [imageId, setImageId] = useState(example.imageId ?? '');
  const product = { ...example, imageId };
  return <main className="pc-gallery"><Link to="/">← Naar mijn recepten</Link><h1>Picnic componentbibliotheek</h1>
    <p>Onze webvertaling van Picnic. De producten hieronder komen uit een lokale cataloguswaarneming; prijzen zijn demonstratiegegevens, geen live aanbod; er wordt niets aan je mandje toegevoegd.</p>
    <section><h2>Kleur en typografie</h2><p>Inter voor de kookomgeving · 8-punts spacing · ronde, rustige oppervlakken.</p><div className="pc-swatches">{swatches.map(([label,color]) => <div className="pc-swatch" key={label}><i style={{background:color}} /><strong>{label}</strong><code>{color}</code></div>)}</div></section>
    <section><h2>Acties en statussen</h2><div className="pc-gallery-examples"><Button>Primaire actie</Button><Button variant="outline">Secundaire actie</Button><Button disabled>Niet beschikbaar</Button><MatchBadge>Gekozen</MatchBadge><MatchBadge tone="warning">Zelf beoordelen</MatchBadge><MatchBadge tone="neutral">Onvoldoende informatie</MatchBadge></div></section>
    <section><h2>Verpakkingen</h2><div className="pc-gallery-examples"><label htmlFor="demo-count">Aantal verpakkingen</label><QuantityStepper id="demo-count" label="voorbeeldproduct" value={count} max={10} onChange={setCount} /><span>{count ?? 'Geen'} gekozen</span></div></section>
    <section><h2>Productafbeelding en compacte productkeuze</h2><p>Gebruik een imageId uit de Picnic-productdata om de echte verpakking te bekijken. Zonder foto of bij een fout verschijnt een herkenbare lege toestand.</p><label htmlFor="demo-image">Picnic imageId</label><Input id="demo-image" value={imageId} onChange={e => setImageId(e.target.value)} placeholder="Afbeelding-ID uit productdata" /><ProductSummary product={product} /></section>
    <section><h2>Scrollbare alternatieven</h2><p>Scroll horizontaal of gebruik het toetsenbord. Kaarten tonen gekozen, beschikbaar, onbekende prijs en niet-selecteerbare toestanden.</p><ProductRail label="Voorbeeldalternatieven">{[product, {...product, id:'second', name:'Picnic water koolzuurvrij', imageId:'23d56af0a96887b39b9eb1de00c1e9cb1bc4ef7072d19da6331eafe25f4dab9c'}, {...product,id:'unknown',displayPriceCents:null,priceCertainty:'unknown' as const}, {...product,id:'unavailable',name:'Niet-selecteerbaar voorbeeld'}].map((p,i) => <ProductCard key={p.id} product={p} selected={selected === i} disabled={i > 1} onChoose={() => setSelected(i)} note={i===3 ? 'Beschikbaarheid kan niet worden bevestigd.' : undefined} />)}</ProductRail></section>
  </main>;
}
