import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { unstable_splitSqlQuery as split } from 'wrangler';
const files=fs.readdirSync(new URL('../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort();
function source(name){return fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');}
test('all fresh migrations execute both as complete SQL and Wrangler-split statements',()=>{
 const complete=new DatabaseSync(':memory:'),statements=new DatabaseSync(':memory:');
 try{
  for(const name of files){complete.exec(source(name));for(const sql of split(source(name)))statements.exec(sql);}
  const objects=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  assert.deepEqual(objects(statements),objects(complete));for(const name of ['app_accounts','match_attempts','product_relations'])assert.ok(objects(complete).some(object=>object.type==='table'&&object.name===name));
 }finally{complete.close();statements.close();}
});
test('trigger CASE expressions are parenthesized for the remote D1 query splitter',()=>{
 for(const name of files){const sql=source(name);assert.ok(!sql.includes('\r'),name+' must use LF');
  for(const statement of split(sql).filter(text=>/CREATE\s+TRIGGER/i.test(text))){
   const tokens=[...statement.matchAll(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\bCASE\b|\bEND\b/gi)];let depth=0;
   for(const token of tokens){if(/^case$/i.test(token[0])){assert.equal(statement.slice(0,token.index).trimEnd().at(-1),'(',name+': CASE needs parentheses');depth++;}else if(/^end$/i.test(token[0])&&depth){assert.equal(statement.slice(token.index+token[0].length).trimStart()[0],')',name+': CASE END needs parentheses');depth--;}}
   assert.equal(depth,0,name);assert.match(statement,/\bBEGIN\b/);assert.match(statement,/\bEND\s*$/);
  }
 }
});
test('parenthesized guards still reject extra active accounts and unsafe budget reservations',()=>{
 const db=new DatabaseSync(':memory:');try{
  for(const name of files)db.exec(source(name));
  db.exec("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('owner','Owner','owner@example.invalid',1,0,0); INSERT INTO app_accounts(id,email,role,status,created_at,updated_at) VALUES('owner','owner@example.invalid','admin','active',0,0)");
  db.exec("INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES('other','Other','other@example.invalid',1,0,0)");
  assert.throws(()=>db.exec("INSERT INTO app_accounts(id,email,role,status,created_at,updated_at) VALUES('other','other@example.invalid','member','active',0,0)"),/account_requires_invitation/);
  db.exec("INSERT INTO app_budget_months(month,cap_cents,spent_cents) VALUES('2026-10',1500,1500); INSERT INTO user_budget_months(owner_id,month,cap_cents) VALUES('owner','2026-10',500)");
  assert.throws(()=>db.exec("INSERT INTO budget_reservations(id,owner_id,import_id,month,attempt_id,cap_cents,state,created_at) VALUES('r','owner','missing','2026-10','a',1,'reserved',0)"),/budget_exceeded/);
  assert.equal(db.prepare("SELECT reserved_cents FROM app_budget_months WHERE month='2026-10'").get().reserved_cents,0);
 }finally{db.close();}
});
