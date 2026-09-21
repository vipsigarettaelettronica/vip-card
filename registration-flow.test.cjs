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
  const ctx = vm.createContext({ console, Date, Uint8Array, URL,
    document: { getElementById: element, createElementNS: () => element('svgRect') },
    window: { addEventListener: (name, fn) => { events[name] = fn; }, matchMedia: () => ({ matches: false }), navigator: {} },
    navigator: { userAgent: 'Test desktop browser' },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}),
    onAuthStateChanged: () => () => {}, signInAnonymously: async () => ({}),
    collection: () => ({}), doc: () => ({}), getDocs: async () => ({ docs: [] }),
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
