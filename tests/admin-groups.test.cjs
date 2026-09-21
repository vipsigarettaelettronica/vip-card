const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(){
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,textContent:'',innerHTML:'',handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(n,f){this.handlers[n]=f},querySelectorAll(){return []},reset(){}});return elements.get(id)};
 const persisted=new Map(),pushes=[];let serial=0;
 const fresh=new Map([['a',{marketingConsent:true}],['b',{marketingConsent:false}]]);
 const ctx=vm.createContext({console,Set,Map,Date,Uint8Array,document:{getElementById:el},initializeApp:()=>({}),getAuth:()=>({currentUser:{email:'vipsigarettaelettronica@gmail.com'}}),getFirestore:()=>({}),GoogleAuthProvider:class{setCustomParameters(){}},onAuthStateChanged(){},confirm:()=>true,collection:(_, ...p)=>p.join('/'),doc:(base,...p)=>typeof base==='string'?{path:base+'/'+(++serial),id:String(serial)}:{path:p.join('/'),id:p.at(-1)},serverTimestamp:()=> 'now',sendMessageNotification:async(_,m)=>{pushes.push(m);return {accepted:1}},runTransaction:async(_,fn)=>fn({get:async ref=>{const data=ref.path.startsWith('cards/')?fresh.get(ref.id):persisted.get(ref.path);return {exists:()=>!!data,data:()=>data}},set:(ref,data)=>persisted.set(ref.path,data)})});
 vm.runInContext(fs.readFileSync('customer-groups.js','utf8').replaceAll('export ','')+'\n'+fs.readFileSync('admin.js','utf8').replace(/^import .*;\n/gm,''),ctx);
 vm.runInContext("allCards=[{id:'a',firstName:'Alice',adminGender:'female',marketingConsent:true},{id:'b',firstName:'Bea',adminGender:'female',marketingConsent:true}]; selectedCustomers.add('a');selectedCustomers.add('b');",ctx);
 el('groupKind').value='marketing';el('groupTitle').value='Offerta';el('groupBody').value='Test';
 return {el,ctx,persisted,pushes,fresh,send:()=>el('groupMessageForm').handlers.submit({preventDefault(){}})};
}
test('actual admin handler checks fresh consent, writes private inboxes, and blocks a repeated submit',async()=>{
 const s=setup();await s.send();await s.send();assert.equal(s.persisted.size,1);assert.equal(s.pushes.length,1);assert.equal(s.pushes[0].ownerUid,'a');assert.ok([...s.persisted.keys()][0].startsWith('personalInboxes/a/messages/'));assert.match(s.el('groupStatus').textContent,/Destinatari esclusi al controllo: 1/);
});
test('uncertain transaction commit can be retried with the same document ID, without creating another message',async()=>{
 const s=setup();const original=s.ctx.runTransaction;let first=true;s.ctx.runTransaction=async(...args)=>{const result=await original(...args);if(first){first=false;throw Error('commit acknowledged late')}return result;};
 await s.send();assert.equal(s.persisted.size,1);assert.equal(s.pushes.length,0);
 await vm.runInContext('runGroupJob(groupJob)',s.ctx);assert.equal(s.persisted.size,1);assert.equal(s.pushes.length,1);
});
test('changing selection and message fields during sending does not change captured recipients or content',async()=>{
 const s=setup();s.el('groupKind').value='service';const original=s.ctx.runTransaction;let release;s.ctx.runTransaction=async(...args)=>{await new Promise(r=>release=r);return original(...args)};
 const pending=s.send();vm.runInContext("selectedCustomers.clear();",s.ctx);s.el('groupBody').value='Changed';
 release();await new Promise(r=>setImmediate(r));release();await pending;
 assert.equal(s.persisted.size,2);assert.ok([...s.persisted.values()].every(x=>x.body==='Test'));assert.deepEqual(s.pushes.map(x=>x.ownerUid),['a','b']);
});
