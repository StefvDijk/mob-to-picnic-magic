# Picnic webcomponenten

Onderzoek en herkomst: [design system](../../../docs/design/PICNIC-DESIGN-SYSTEM.md).
Interactieve voorbeelden: `/design-system`.

```tsx
import { ProductCard, ProductRail, ProductSummary, QuantityStepper } from '@/components/picnic/catalog';

<ProductSummary product={product} />
<ProductRail label="Alternatieven voor chiazaad">
  {products.map(product => (
    <ProductCard key={product.id} product={product}
      selected={product.id === selectedId}
      disabled={!isSelectable(product)} onChoose={() => choose(product)} />
  ))}
</ProductRail>
<QuantityStepper id="quantity" label={product.name} value={count}
  max={product.maxCount} onChange={setCount} />
```

Importeer tokens.css één keer na index.css. Geef genormaliseerde PicnicProduct-data door;
geen provider-auth, ruwe paginacode of zelf afgeleide fotomapping. ProductCard doet geen
API-aanvragen of mandjemutaties. Geschiktheid, actuele prijscontrole en toevoegen zijn
verantwoordelijkheden van de aanroepende pagina. De statische library-gallery toont
voorbeelden, geen live beschikbaarheid.
