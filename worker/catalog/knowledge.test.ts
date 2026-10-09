import { expect, it } from 'vitest';
import type { PicnicProduct, PicnicProductDetails } from '../../shared/picnic';
import { interpretProduct } from './knowledge';
const product: PicnicProduct = {id:'arbitrary',name:'Coco start naturel',unitQuantity:'350 g',quantity:{kind:'exact',amount:'350',unit:'g',basis:null},displayPriceCents:100,priceCertainty:'known',priceRanges:[],identity:{groupId:'arbitrary',variantId:'arbitrary'}};
function details(name: string, content: string): PicnicProductDetails {
 return {product:{...product,name},description:null,infoSections:[{title:'Extra informatie',content}],allergens:{contains:[],mayContain:[],original:[]},parserVersion:'test',currentCheckUsable:true};
}
it('extracts Markdown product identity with field evidence, independent of SKU or brand',()=>{
 const d=details(product.name,'**Productomschrijving**\nGEFERMENTEERD KOKOSMELKPRODUCT\n**Land van herkomst**\nNederland');
 const k=interpretProduct(product,d);
 expect(k.kind).toMatchObject({status:'known',value:'coconut-yoghurt'});
 expect(k.kind.evidence[0]).toMatchObject({path:'details.infoSections[0].content',text:'GEFERMENTEERD KOKOSMELKPRODUCT'});
 expect(k.searchText).toContain('kokosyoghurt');
});
it('does not turn composition or serving suggestions into product identity',()=>{
 const d=details('Dessert','Ingrediënten: gefermenteerd kokosmelkproduct');
 d.description='Lekker met verse oregano of mango.';
 d.infoSections.push({title:'Ingrediënten',content:'gemalen kaneel, mango'});
 expect(interpretProduct(d.product,d).kind.status).toBe('unknown');
});
it('distinguishes documented powder, fresh herbs, extracts, fruit drinks and uncertain forms',()=>{
 const d=details('Verstegen kaneel','**Productomschrijving**\nKANEEL GEMALEN');
 expect(interpretProduct(d.product,d).form.value).toBe('powder');
 expect(interpretProduct({...product,name:'Kaneel'}).form.status).toBe('unknown');
 expect(interpretProduct({...product,name:'Vanille-extract'}).kind.value).toBe('vanilla-extract');
 expect(interpretProduct({...product,name:'Mangonectar'}).kind.value).not.toBe('mango');
 expect(interpretProduct({...product,name:'Mangonectar'}).form.value).toBe('juice');
 const herb=details('Oregano','**Productomschrijving**\nOREGANO');
 herb.description='Verse oregano heeft een karakteristieke, ietwat zoete smaak. Minder sterk dan de gedroogde variant.';
 expect(interpretProduct(herb.product,herb).form.value).toBe('fresh');
});
it('preserves conflicts and typed packaging without density guesses',()=>{
 const d=details('Verse oregano','**Productomschrijving**\nGedroogde oregano');
 expect(interpretProduct(d.product,d).form.status).toBe('conflict');
 expect(interpretProduct(product).packaging.quantity?.unit).toBe('g');
});
