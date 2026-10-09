import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import type { ShoppingGroup } from '../../shared/shopping';
import { interpretProduct, type ProductKnowledge } from '../catalog/knowledge';
import { assessProduct, purchaseAttribute } from '../domain/shopping';

export function assessProductKnowledge(group: ShoppingGroup, product: PicnicProduct, details?: PicnicProductDetails, storedKnowledge?: ProductKnowledge) {
  let rules = assessProduct(group,product);
  const knowledge = storedKnowledge ?? interpretProduct(product, details);
  const [kind, ...flags] = group.knowledgeKey.split('|');
  if (!rules.hardExclusion) {
    if (knowledge.kind.status === 'conflict' || knowledge.form.status === 'conflict' || knowledge.flavour.status === 'conflict') {
      rules = {...rules,status:'unresolved',reason:'Tegenstrijdig productbewijs; controle nodig.'};
    } else if (kind === 'cinnamon' && knowledge.form.value !== 'powder' && rules.status === 'suitable') {
      rules = {...rules,status:'unresolved',reason:'Poedervorm is niet bewezen.'};
    } else if (rules.status === 'unresolved' && knowledge.kind.value === kind) {
      // Reuse all recipe constraints against evidenced identity/form. The real name
      // stays in the product, commercial checks and packaging calculation.
      const evidence = [...knowledge.kind.evidence, ...knowledge.form.evidence].map(item => item.text).join(' ');
      const enriched = assessProduct(group,{...product,name:`${product.name} ${evidence} ${knowledge.form.value === 'powder' ? 'poeder' : knowledge.form.value === 'fresh' ? 'vers' : ''}`});
      const noExplicitVariant = !flags.length && group.sources.every(source => !source.attributes.brand &&
        !purchaseAttribute(source.attributes.form) && !purchaseAttribute(source.attributes.variant));
      if (kind === 'coconut-yoghurt' && noExplicitVariant && knowledge.form.value === 'fermented' &&
          (!knowledge.flavour.value || knowledge.flavour.value === 'plain')) {
        rules = {...rules,status:'suitable',reason:'Productomschrijving bevestigt gefermenteerde kokosyoghurt.'};
      } else if (enriched.status === 'suitable' && !enriched.hardExclusion &&
          (kind !== 'cinnamon' || knowledge.form.value === 'powder')) {
        rules = {...enriched,reason:'Productomschrijving bevestigt soort en vereiste vorm.'};
      }
    }
  }
  return rules;
}
