const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const handlers={},notifications=[],values=new Map();let background;
 const cache={match:async key=>values.has(key)?new Response(values.get(key)):undefined,put:async(key,response)=>values.set(key,await response.text())};
 const ctx=vm.createContext({URL,Response,Promise,Date,console,importScripts(){},
 firebase:{initializeApp(){},messaging:()=>({onBackgroundMessage:fn=>{background=fn;}})},
 caches:{open:async()=>cache},self:{registration:{scope:'https://example.test/vip-card/',showNotification:async(title,options)=>notifications.push({title,options})},
 navigator:{setAppBadge:async()=>{},clearAppBadge:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn,location:{origin:'https://example.test'}},
 clients:{matchAll:async()=>[],openWindow:async url=>url}
 });
 vm.runInContext(fs.readFileSync('sw.js','utf8'),ctx);
 return {background:payload=>background(payload),handlers,notifications};
}
test('background push shows one generic, non-silent notification and ignores repeated event IDs',async()=>{
 const s=setup();const payload={data:{eventId:'first',body:'PRIVATE BODY',url:'https://evil.test/'}};
 await s.background(payload);await s.background(payload);
 assert.equal(s.notifications.length,1);
 assert.equal(s.notifications[0].options.silent,false);
 assert.doesNotMatch(s.notifications[0].options.body,/PRIVATE/);
 assert.equal(s.notifications[0].options.data.url,'https://example.test/vip-card/?messages=1');
});
test('Firebase auto-displayed notification payload is not duplicated',async()=>{
 const s=setup();await s.background({notification:{title:'Existing campaign'},data:{eventId:'other'}});
 assert.equal(s.notifications.length,0);
});
test('foreground push follows the same display and duplicate protection',async()=>{
 const s=setup();let done;
 s.handlers.message({data:{type:'VIP_FOREGROUND_PUSH',payload:{eventId:'foreground'}},waitUntil:p=>{done=p;}});
 await done;await s.background({data:{eventId:'foreground'}});
 assert.equal(s.notifications.length,1);
});
