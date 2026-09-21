import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker, {validateRequest,verifiedOwner,eligible,notificationPayload,claimAndSend} from './worker.mjs';
const input={scope:'personal',ownerUid:'alice',messageId:'message1',kind:'service'};
test('rejects malformed paths, audience and cursor',()=>{
 for(const bad of [{...input,ownerUid:'../bob'},{...input,messageId:'a/b'},{...input,scope:'all'},{...input,kind:'unknown'},{...input,cursor:-1}])assert.throws(()=>validateRequest(bad));
 assert.equal(validateRequest(input).cursor,0);
});
test('device recipient is resolved from authoritative card or current recovery proof, never cardCode alone',()=>{
 const cards=new Map([['alice',{cardCode:'A',recoveryKey:'secret',marketingConsent:false}],['bob',{cardCode:'B'}]]);
 const sub={enabled:true,ownerUid:'device',cardCode:'A',token:'token'};
 assert.equal(verifiedOwner(sub,'device',cards,new Map()),null);
 assert.equal(verifiedOwner(sub,'other-id',cards,new Map()),null);
 const access=new Map([['device',{ownerUid:'alice',cardCode:'A',recoveryCode:'secret'}]]);
 assert.equal(verifiedOwner(sub,'device',cards,access),'alice');
 cards.get('alice').recoveryKey='rotated';
 assert.equal(verifiedOwner(sub,'device',cards,access),null);
 assert.equal(eligible(sub,'bob',cards.get('bob'),input),false);
 assert.equal(eligible(sub,'alice',cards.get('alice'),{...input,kind:'marketing'}),false);
 assert.equal(eligible(sub,'alice',cards.get('alice'),input),true);
});
test('payload has no private message text and no notification payload that would produce two displays',()=>{
 const p=notificationPayload('token','job','https://example.test/app/');
 assert.equal(p.message.notification,undefined);
 assert.equal(p.message.data.body,'Hai un nuovo messaggio da V.I.P. Apri l’app per leggerlo.');
 assert.equal(p.message.data.url,'https://example.test/app/?messages=1');
});
test('successful, repeated and ambiguous requests do not send the same notification again',async()=>{
 const jobs=new Map();let sends=0;
 const deps={claim:async id=>{if(jobs.has(id))return jobs.get(id);jobs.set(id,{status:'claimed'});return null;},finish:async(id,status)=>jobs.set(id,{status}),send:async()=>{sends++;return {ok:true};}};
 assert.equal(await claimAndSend(deps,'job','token','https://example.test/'),'accepted');
 assert.equal(await claimAndSend(deps,'job','token','https://example.test/'),'alreadyAccepted');
 assert.equal(sends,1);
 deps.send=async()=>{sends++;throw new Error('network');};
 assert.equal(await claimAndSend(deps,'unclear','token','https://example.test/'),'uncertain');
 assert.equal(await claimAndSend(deps,'unclear','token','https://example.test/'),'uncertain');
 assert.equal(sends,2);
});
test('invalid tokens and FCM rejection are not reported as accepted',async()=>{
 const deps={claim:async()=>null,finish:async()=>{},send:async()=>({ok:false,error:{details:[{errorCode:'UNREGISTERED'}]}})};
 assert.equal(await claimAndSend(deps,'job','token','https://example.test/'),'expired');
});
test('unknown origins and unauthenticated requests cannot trigger delivery',async()=>{
 const env={ALLOWED_ORIGIN:'https://allowed.test',FIREBASE_PROJECT_ID:'demo'};
 let r=await worker.fetch(new Request('https://worker.test/send',{method:'POST',headers:{Origin:'https://evil.test'},body:JSON.stringify(input)}),env);
 assert.equal(r.status,403);
 r=await worker.fetch(new Request('https://worker.test/send',{method:'POST',headers:{Origin:'https://allowed.test'},body:JSON.stringify(input)}),env);
 assert.equal(r.status,401);
});
