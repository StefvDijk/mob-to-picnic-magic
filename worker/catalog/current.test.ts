import { describe, expect, it, vi } from 'vitest';
import { checkCurrentProduct } from './current';
import type { PicnicProvider } from '../adapters/picnic';
import type { PicnicProduct } from '../../shared/picnic';
const product: PicnicProduct = {id:'outside-40',name:'Gele uien',unitQuantity:'3 stuks',quantity:{kind:'exact',amount:'3',unit:'piece'},displayPriceCents:80,priceCertainty:'known',isAvailable:true,maxCount:50,priceRanges:[],identity:{groupId:'outside-40',variantId:'outside-40'}};
function provider(): PicnicProvider {return {login:vi.fn(),requestSms:vi.fn(),verifySms:vi.fn(),cart:vi.fn(),search:vi.fn(async()=>[])};}
describe('current sale-ID evidence',()=>{
 it('checks a product outside truncated search without another search',async()=>{
  const api=provider();api.productDetails=vi.fn(async()=>({product,description:null,infoSections:[],allergens:{contains:[],mayContain:[],original:[]},parserVersion:'test',currentCheckUsable:true}));
  expect(await checkCurrentProduct(api,'fixture',product.id,'uien')).toMatchObject({product,source:'product-detail'});expect(api.search).not.toHaveBeenCalled();
 });
 it('keeps negative detail evidence authoritative when other fields are missing',async()=>{
  const api=provider();api.search=vi.fn(async()=>[product]);
  api.productDetails=vi.fn(async()=>({product:{...product,isAvailable:false,displayPriceCents:null,quantity:null},description:null,infoSections:[],allergens:{contains:[],mayContain:[],original:[]},parserVersion:'test',currentCheckUsable:false}));
  expect(await checkCurrentProduct(api,'fixture',product.id,'uien')).toMatchObject({product:{isAvailable:false,displayPriceCents:null},source:'product-detail'});
  expect(api.search).not.toHaveBeenCalled();
 });
 it('does not claim absence from a search means removed',async()=>{
  await expect(checkCurrentProduct(provider(),'fixture',product.id,'uien')).rejects.toThrow('PRODUCT_CHECK_INCOMPLETE');
 });
 it('rejects a wrong sale ID and a failed detail read',async()=>{
  const api=provider();api.productDetails=vi.fn(async()=>({product:{...product,id:'wrong'},description:null,infoSections:[],allergens:{contains:[],mayContain:[],original:[]},parserVersion:'test',currentCheckUsable:true}));
  await expect(checkCurrentProduct(api,'fixture',product.id,'uien')).rejects.toThrow('PRODUCT_ID_MISMATCH');expect(api.search).not.toHaveBeenCalled();
 });
});
