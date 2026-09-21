const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').replace(/^import .*;\n/gm, '');
function setup() {
  const elements = new Map();
  const events = {};
  const hiddenInitially = new Set(['installBanner', 'cardView', 'recoveryView', 'consentUpdateModal']);
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(hiddenInitially.has(id) ? ['hidden'] : []);
      elements.set(id, { id, textContent: '', style: {}, checked: false, handlers: {},
        classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c),
          toggle(c, on) { if (on === undefined) on = !classes.has(c); on ? classes.add(c) : classes.delete(c); } },
        addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {}, setAttribute() {}, appendChild() {} });
    }
    return elements.get(id);
  }
  const storage = new Map();
  const ctx = vm.createContext({ console, Date, Uint8Array, URL, setTimeout, clearTimeout,
    location: {href:"https://example.test/vip-card/"}, onMessage: () => () => {},
    requestAnimationFrame: fn => fn(), isSupported: async () => false,
    document: { getElementById: element, createElementNS: () => element('svgRect') },
    window: { addEventListener: (name, fn) => { events[name] = fn; }, matchMedia: () => ({ matches: false }), navigator: {} },
    navigator: { userAgent: 'Test desktop browser' },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}),
    onAuthStateChanged: () => () => {}, signInAnonymously: async () => ({}),
    collection: (_, ...parts) => parts.join('/'), doc: (_, ...parts) => parts.join('/'),
    onSnapshot: (_, next) => { next({docs: []}); return () => {}; }, getDocs: async () => ({ docs: [] }),
    getDoc: async () => ({ exists: () => false }), setDoc: async () => {}, serverTimestamp: () => 'test-time',
    alert() {} });
  vm.runInContext(source, ctx);
  return { ctx, element, events, run: code => vm.runInContext(code, ctx) };
}
const card = { firstName: 'Test', lastName: 'User', cardCode: 'VIP-TEST-0001', privacyConsent: true,
  privacyVersion: '2026-09-v4', regulationConsent: true, regulationVersion: '2026-09-v3' };
test('first visit and install availability never obscure registration', () => {
  const s = setup();
  s.events.load();
  s.events.beforeinstallprompt({ preventDefault() {}, prompt() {} });
  assert.equal(s.element('installBanner').classList.contains('hidden'), true);
  assert.equal(s.element('registrationView').classList.contains('hidden'), false);
});
test('existing card shows optional install; recovery and registration hide it again', async () => {
  const s = setup();
  await s.run(`showCard(${JSON.stringify(card)}, 'RCV-TEST', true)`);
  assert.equal(s.element('installBanner').classList.contains('hidden'), false);
  assert.equal(s.element('installAppBtn').textContent, 'INSTALLA L’APP');
  s.run('showRecovery()');
  assert.equal(s.element('installBanner').classList.contains('hidden'), true);
  s.run('showRegistration()');
  assert.equal(s.element('installBanner').classList.contains('hidden'), true);
});
test('pending document confirmation and installed mode suppress install offer', async () => {
  const s = setup();
  await s.run(`showCard(${JSON.stringify({ ...card, privacyVersion: 'old' })}, 'RCV-TEST')`);
  assert.equal(s.element('consentUpdateModal').classList.contains('hidden'), false);
  assert.equal(s.element('installBanner').classList.contains('hidden'), true);
  s.ctx.window.matchMedia = () => ({ matches: true });
  await s.run(`showCard(${JSON.stringify(card)}, 'RCV-TEST')`);
  assert.equal(s.element('installBanner').classList.contains('hidden'), true);
});
test('HTML puts recovery before form and install after the card, with distinct labels', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.ok(html.indexOf('id="showRecovery"') < html.indexOf('id="registrationForm"'));
  assert.ok(html.indexOf('id="installBanner"') > html.indexOf('id="cardView"'));
  assert.equal(html.includes('SCARICA LA TUA V.I.P. CARD'), false);
  assert.equal(html.includes('AREA V.I.P.'), false);
});
test('server confirmation succeeds even when browser storage is blocked', async () => {
  const s = setup();
  s.run(`currentUser = { uid: 'test-user' }; currentCard = ${JSON.stringify(card)}; currentRecoveryCode = 'RCV-TEST';`);
  s.element('updatePrivacyConsent').checked = true;
  s.element('updateRegulationConsent').checked = true;
  s.element('consentUpdateModal').classList.remove('hidden');
  let writes = 0;
  s.ctx.setDoc = async () => { writes++; };
  s.ctx.localStorage.setItem = () => { throw new Error('Storage blocked'); };
  await s.element('confirmConsentUpdate').handlers.click();
  assert.equal(writes, 1);
  assert.equal(s.element('consentUpdateModal').classList.contains('hidden'), true);
  assert.equal(s.element('consentUpdateError').textContent, '');
  assert.equal(s.element('confirmConsentUpdate').disabled, false);
});
test('a rejected server write keeps confirmation open and does not cache acceptance', async () => {
  const s = setup();
  s.run(`currentUser = { uid: 'test-user' }; currentCard = ${JSON.stringify({ ...card, privacyVersion: 'old' })}; currentRecoveryCode = 'RCV-TEST';`);
  s.element('updatePrivacyConsent').checked = true;
  s.element('updateRegulationConsent').checked = true;
  s.element('consentUpdateModal').classList.remove('hidden');
  let cacheWrites = 0;
  s.ctx.localStorage.setItem = () => { cacheWrites++; };
  s.ctx.setDoc = async () => { throw Object.assign(new Error('Denied'), { code: 'permission-denied' }); };
  await s.element('confirmConsentUpdate').handlers.click();
  assert.equal(cacheWrites, 0);
  assert.equal(s.element('consentUpdateModal').classList.contains('hidden'), false);
  assert.match(s.element('consentUpdateError').textContent, /CONSENSO-01/);
  assert.equal(s.run('currentCard.privacyVersion'), 'old');
  assert.equal(s.element('confirmConsentUpdate').disabled, false);
});

test('personal inbox permission failure does not hide general messages', async () => {
  const s = setup();
  s.run(`currentUser = {uid:'alice'}; currentCard = {...${JSON.stringify(card)}, ownerUid:'alice'};`);
  s.ctx.onSnapshot = (ref, next, fail) => {
    if (ref === 'messages') next({docs:[{id:'general',data:()=>({title:'Orari',body:'Aperti',publishedAt:{toDate:()=>new Date()}})}]});
    else if (ref.endsWith('/messages')) fail({code:'permission-denied'});
    else next({docs:[]});
    return () => {};
  };
  await s.run('loadMessages()');
  assert.match(s.element('messagePreview').innerHTML, /Orari/);
  assert.match(s.element('personalInboxStatus').textContent, /non disponibili/);
});
test('recovered card verifies access before subscribing to its personal inbox', async () => {
  const s = setup();
  s.run(`currentUser = {uid:'device'}; currentCard = {...${JSON.stringify(card)}, ownerUid:'alice'}; currentRecoveryCode='secret';`);
  const writes = [], subscriptions = [];
  s.ctx.setDoc = async (ref, value) => { writes.push({ref, value}); };
  s.ctx.onSnapshot = (ref, next) => { subscriptions.push(ref); next({docs:[]}); return () => {}; };
  await s.run('loadMessages()');
  assert.equal(writes[0].ref, 'cardMessageAccess/device');
  assert.equal(writes[0].value.ownerUid, 'alice');
  assert.equal(writes[0].value.recoveryCode, 'secret');
  assert.ok(subscriptions.includes('personalInboxes/alice/messages'));
  subscriptions.length = 0;
  s.ctx.setDoc = async () => { throw {code:'permission-denied'}; };
  await s.run('loadMessages()');
  assert.deepEqual(subscriptions, ['messages']);
});
test('personal messages are escaped and their read receipts never use the public messageReads collection', async () => {
  const s = setup();
  s.run(`currentUser={uid:'alice'}; currentCard=${JSON.stringify(card)}; currentRecoveryCode='secret';`);
  await s.run(`renderMessages([{id:'p1',ownerUid:'alice',personal:true,title:'<script>bad</script>',body:'<img src=x>',publishedAt:{toDate:()=>new Date()}}])`);
  assert.match(s.element('messagesList').innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(s.element('messagesList').innerHTML, /<script>/);
  const paths = [];
  s.ctx.setDoc = async ref => { paths.push(ref); };
  await s.run(`markMessagesRead([{id:'p1',ownerUid:'alice',personal:true}])`);
  assert.deepEqual(paths, ['personalInboxes/alice/reads/p1']);
});
test('a granted notification permission silently repairs device registration; network errors do not claim permission was revoked', async () => {
  const s = setup();
  s.run(`currentUser={uid:'alice'}; currentCard=${JSON.stringify(card)};`);
  let prompts = 0;
  s.ctx.Notification = {permission:'granted',requestPermission:async()=>{prompts++;return 'granted';}};
  s.ctx.isSupported = async () => true;
  s.ctx.navigator.serviceWorker = {register:async()=>({}),ready:Promise.resolve({})};
  s.ctx.getMessaging = () => ({});
  s.ctx.getToken = async () => 'fresh-token';
  const writes = [];
  s.ctx.setDoc = async (ref,data) => { writes.push({ref,data}); };
  await s.run('refreshNotificationRegistration(false)');
  assert.equal(prompts, 0);
  assert.equal(writes[0].data.token, 'fresh-token');
  assert.equal(writes[0].ref, 'pushSubscriptions/alice');
  assert.match(s.element('enableNotifications').textContent, /ATTIVI/);
  s.ctx.setDoc = async () => {throw new Error('offline');};
  await s.run('refreshNotificationRegistration(false)');
  assert.match(s.element('notificationStatus').textContent, /non significa/);
  assert.equal(s.element('enableNotifications').disabled, false);
});
