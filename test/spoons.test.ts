import {expect,it} from 'vitest';
import {sourceSpoon} from '../shared/spoons';
it.each([
 ['½ tbsp Vanilla Bean Paste',1,2,'tbsp'],['¼ tsp Salt',1,4,'tsp'],
 ['1 ½ tablespoons honey',3,2,'tbsp'],['1½ el honing',3,2,'tbsp'],
 ['1/3 theelepel zout',1,3,'tsp'],['1,5 eetlepels olie',15,10,'tbsp'],
])('reads source spoons without density assumptions: %s',(line,n,d,unit)=>{
 const result=sourceSpoon(String(line));if (!result) throw new Error('Expected an exact spoon measure');expect(result.amount.numerator/result.amount.denominator).toBe(Number(n)/Number(d));expect(result.unit).toBe(unit);
});
it.each(['1-2 tbsp honey','0 tbsp honey','1/0 tsp salt','1 2 tbsp honey','naar smaak honing','⅓ g honey'])('does not invent a measure for %s',line=>expect(sourceSpoon(line)).toBeNull());
