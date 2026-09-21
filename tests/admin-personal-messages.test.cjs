const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, {value:'',textContent:'',handlers:{},classList:{add(){},remove(){},toggle(){}},
      addEventListener(name,fn){this.handlers[name]=fn;},reset(){this.didReset=true;},querySelectorAll(){return [];}});
    return elements.get(id);
  };
  const writes = [];
  const ctx = vm.createContext({console, Date, Uint8Array, Set, Map,
    document:{getElementById:el},initializeApp:()=>({}),getAuth:()=>({currentUser:{email:'vipsigarettaelettronica@gmail.com'}}),
    getFirestore:()=>({}),GoogleAuthProvider:class {setCustomParameters(){}},onAuthStateChanged(){},
    collection:(_, ...parts)=>parts.join('/'), doc:(base,...parts)=> typeof base==='string' ? base+'/new-id' : parts.join('/'),
    serverTimestamp:()=> 'now',setDoc:async(ref,data)=>writes.push({ref,data}),getDocs:async()=>({docs:[]}),
    confirm:()=>true,alert(){}
  });
  vm.runInContext(fs.readFileSync('admin.js','utf8').replace(/^import .*;\n/gm,''),ctx);
  vm.runInContext("selectedCard={id:'alice',firstName:'Alice',lastName:'Test',cardCode:'VIP-ALICE'}",ctx);
  el('personalMessageTitle').value='Solo Alice'; el('personalMessageBody').value='Messaggio privato';
  return {ctx,el,writes,send:()=>el('personalMessageForm').handlers.submit({preventDefault(){}})};
}
test('personal send writes only the captured recipient inbox, even if selected customer changes during save',async()=>{
  const s=setup();
  let finish;
  s.ctx.setDoc=(ref,data)=>{s.writes.push({ref,data});return new Promise(resolve=>{finish=resolve;});};
  const pending=s.send();
  vm.runInContext("selectedCard={id:'bob',firstName:'Bob'}",s.ctx);
  await s.send(); // ignored while the first send is in progress
  finish();await pending;
  assert.equal(s.writes.length,1);
  assert.equal(s.writes[0].ref,'personalInboxes/alice/messages/new-id');
  assert.equal(s.el('personalMessageForm').didReset,undefined);
});
test('cancelled or failed sends never display a success status',async()=>{
  const s=setup();s.ctx.confirm=()=>false;await s.send();assert.equal(s.writes.length,0);
  s.ctx.confirm=()=>true;s.ctx.setDoc=async()=>{throw new Error('denied');};
  await s.send();assert.match(s.el('personalMessageStatus').textContent,/non riuscito/);
  assert.equal(s.el('personalMessageForm').didReset,undefined);
});
