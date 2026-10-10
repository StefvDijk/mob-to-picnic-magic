import { Check } from 'lucide-react';

const steps = ['Recept', 'Controleren', 'Boodschappen', 'Picnic'];
export function RecipeFlow({ current }: { current: 1 | 2 | 3 | 4 }) {
  return <ol className="recipe-flow" aria-label="Van recept naar Picnic">{steps.map((label, index) =>
    <li key={label} aria-current={index + 1 === current ? 'step' : undefined} data-complete={index + 1 < current || undefined}>
      <span aria-hidden="true">{index + 1 < current ? <Check size={14} /> : index + 1}</span>{label}
    </li>)}</ol>;
}
