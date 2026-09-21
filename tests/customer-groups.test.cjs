const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync('customer-groups.js','utf8').replaceAll('export ',''),ctx);
const {matchesGroup,recipientSnapshot,deliverGroup}=ctx;
const cards=[{id:'a',adminGender:'female',daneaLinked:false,marketingConsent:true,adminCategories:['Abituali']},{id:'b',adminGender:'female',daneaLinked:true,marketingConsent:false},{id:'c',firstName:'Anna'}];
test('combined filters use recorded fields, including unknown gender and absent Danea association',()=>{
 assert.equal(cards.filter(c=>matchesGroup(c,{gender:'female',danea:'unlinked'})).length,1);
 assert.equal(matchesGroup(cards[2],{gender:'female'}),false);
 assert.equal(matchesGroup(cards[2],{gender:'unknown',danea:'unlinked'}),true);
 assert.equal(matchesGroup(cards[0],{category:'Abituali',consent:'yes'}),true);
 assert.equal(matchesGroup(cards[1],{category:'Abituali'}),false);
});
test('recipient snapshot excludes unselected and marketing opt-outs and stays stable after selection edits',()=>{
 const ids=new Set(['a','b']); const out=recipientSnapshot(cards,ids,'marketing');ids.clear();
 assert.equal(out.length,1); assert.equal(out[0].id,'a');
 assert.equal(recipientSnapshot(cards,new Set(['b']),'service').length,1);
});
test('retry after push failure never saves again or resends to successful recipients',async()=>{
 const job={items:[{customer:{id:'a'},state:'pending'},{customer:{id:'b'},state:'pending'}]};
 const saved=[],pushed=[];let fail=true;
 const deps={save:async i=>{saved.push(i.customer.id);return true;},push:async i=>{pushed.push(i.customer.id);if(i.customer.id==='b'&&fail)throw Error('network');return {accepted:1};}};
 await deliverGroup(job,deps); assert.equal(job.items[1].state,'push-error');fail=false;await deliverGroup(job,deps);
 assert.deepEqual(saved,['a','b']);assert.deepEqual(pushed,['a','b','b']);assert.equal(job.items[1].state,'done');
});
test('withdrawn consent or deleted card does not get saved or notified; one failed recipient does not stop others',async()=>{
 const job={items:[{id:'withdrawn',state:'pending'},{id:'failed',state:'pending'},{id:'ok',state:'pending'}]};const pushed=[];
 await deliverGroup(job,{save:async i=>{if(i.id==='failed')throw Error('write');return i.id!=='withdrawn';},push:async i=>{pushed.push(i.id);return {accepted:1};}});
 assert.deepEqual(pushed,['ok']);assert.equal(job.items[0].state,'skipped');assert.equal(job.items[1].state,'save-error');
});
