import { useState, type ReactNode } from 'react';
import { Check, ChevronRight, Package, Minus, Plus } from 'lucide-react';
import type { PicnicProduct } from '../../../shared/picnic';

import { formatProductPrice, picnicImageUrl } from '@/lib/picnic-display';

export function ProductImage({ product, size = 'compact' }: { product: Pick<PicnicProduct, 'name' | 'imageId'>; size?: 'compact' | 'card' }) {
  const src = picnicImageUrl(product.imageId, size === 'card' ? 'large' : 'medium');
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <span className={`pc-product-image pc-product-image-${size}`}>
    {src && failedSrc !== src ? <img src={src} alt={product.name} width={size === 'card' ? 240 : 88} height={size === 'card' ? 240 : 88} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
      : <span className="pc-image-fallback"><Package aria-hidden="true" /><span>Geen afbeelding</span></span>}
  </span>;
}

export function ProductPrice({ product }: { product: Pick<PicnicProduct, 'displayPriceCents' | 'priceCertainty'> }) {
  return <span className="pc-price">{formatProductPrice(product.displayPriceCents)}{product.priceCertainty === 'conditional' && <small>Afhankelijk van aantal</small>}</span>;
}

export function ProductSummary({ product }: { product: PicnicProduct }) {
  return <span className="pc-product-summary"><ProductImage product={product} /><span className="pc-product-copy"><strong>{product.name}</strong><span>{product.unitQuantity}</span><ProductPrice product={product} /></span></span>;
}

export function MatchBadge({ tone = 'selected', children }: { tone?: 'selected' | 'warning' | 'neutral'; children: ReactNode }) {
  return <span className={`pc-badge pc-badge-${tone}`}>{tone === 'selected' && <Check size={12} aria-hidden="true" />}{children}</span>;
}

export function ProductCard({ product, selected = false, disabled = false, action = 'Kies dit product', note, children, onChoose }: {
  product: PicnicProduct; selected?: boolean; disabled?: boolean; action?: string; note?: string; children?: ReactNode; onChoose?: () => void;
}) {
  return <article className={`pc-product-card ${selected ? 'pc-product-card-selected' : ''}`}>
    <div className="pc-card-visual"><ProductImage product={product} size="card" />{selected && <MatchBadge>Gekozen</MatchBadge>}</div>
    <div className="pc-card-body"><h4>{product.name}</h4><p className="pc-card-unit">{product.unitQuantity}{product.brand ? ` · ${product.brand}` : ''}</p><ProductPrice product={product} />
      {children && <div className="pc-card-detail">{children}</div>}{note && <p className="pc-card-note">{note}</p>}
      {onChoose && <button type="button" className="pc-card-action" disabled={disabled} onClick={onChoose}>{disabled ? 'Niet beschikbaar voor selectie' : selected ? 'Behoud dit product' : action}<ChevronRight size={16} aria-hidden="true" /></button>}
    </div>
  </article>;
}

export function QuantityStepper({ id, label, inputLabel, value, max = 10000, disabled, onChange }: { id: string; label: string; inputLabel?: string; value: number | null; max?: number; disabled?: boolean; onChange: (value: number | null) => void }) {
  return <div className="pc-quantity"><button type="button" aria-label={`Minder ${label}`} disabled={disabled || value === null || value <= 1} onClick={() => onChange(Math.max(1, value! - 1))}><Minus size={16} /></button>
    <input id={id} aria-label={inputLabel ?? `Aantal verpakkingen ${label}`} type="number" min="1" max={max} value={value ?? ''} placeholder="Aantal" disabled={disabled} onChange={event => onChange(event.target.value ? Number(event.target.value) : null)} />
    <button type="button" aria-label={`Meer ${label}`} disabled={disabled || (value !== null && value >= max)} onClick={() => onChange(Math.min(max, (value ?? 0) + 1))}><Plus size={16} /></button></div>;
}

export function ProductRail({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pc-product-rail" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
