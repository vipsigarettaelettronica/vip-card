const { before, after, beforeEach, test } = require('node:test');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } = require('firebase/firestore');
let env;
const payload = () => ({title: 'Riservato', body: 'Messaggio di prova', active: true, publishedAt: serverTimestamp()});
const message = db => doc(db, 'personalInboxes', 'alice', 'messages', 'first');
before(async () => {
  const rules = readFileSync('firestore.rules', 'utf8');
  env = await initializeTestEnvironment({projectId: 'demo-vip-messages', firestore: {rules}});
});
after(async () => { if (env) await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'cards', 'alice'), {cardCode: 'VIP-ALICE', recoveryKey: 'SECRET-ALICE'});
    await setDoc(doc(db, 'cards', 'bob'), {cardCode: 'VIP-BOB', recoveryKey: 'SECRET-BOB'});
    await setDoc(message(db), payload());
  });
});
test('recipient can list/read own inbox; other customers and unauthenticated visitors cannot', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(message(alice)));
  await assertSucceeds(getDocs(collection(alice, 'personalInboxes', 'alice', 'messages')));
  await assertFails(getDoc(message(bob)));
  await assertFails(getDocs(collection(bob, 'personalInboxes', 'alice', 'messages')));
  await assertFails(getDoc(message(anon)));
});
test('only admin can create/delete messages and cannot send to a nonexistent card', async () => {
  const admin = env.authenticatedContext('admin', {email: 'vipsigarettaelettronica@gmail.com'}).firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(setDoc(message(admin), payload()));
  await assertFails(setDoc(message(bob), payload()));
  await assertFails(setDoc(doc(admin, 'personalInboxes', 'missing', 'messages', 'x'), payload()));
  await assertFails(setDoc(message(admin), {...payload(), body: 'x'.repeat(501)}));
  await assertFails(deleteDoc(message(bob)));
  await assertSucceeds(deleteDoc(message(admin)));
});
test('recovered device needs the exact current recovery secret; fabricated recovery records do not grant access', async () => {
  const device = env.authenticatedContext('recovered-device').firestore();
  const binding = doc(device, 'cardMessageAccess', 'recovered-device');
  await assertFails(setDoc(binding, {ownerUid:'alice', cardCode:'VIP-ALICE', recoveryCode:'GUESS'}));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'recoveries', 'FORGED'), {ownerUid:'alice', cardCode:'VIP-ALICE'}));
  await assertFails(setDoc(binding, {ownerUid:'alice', cardCode:'VIP-ALICE', recoveryCode:'FORGED'}));
  await assertFails(setDoc(doc(device, 'cardMessageAccess', 'someone-else'), {ownerUid:'alice', cardCode:'VIP-ALICE', recoveryCode:'SECRET-ALICE'}));
  await assertSucceeds(setDoc(binding, {ownerUid:'alice', cardCode:'VIP-ALICE', recoveryCode:'SECRET-ALICE'}));
  await assertSucceeds(getDoc(message(device)));
  await assertSucceeds(getDocs(collection(device, 'personalInboxes', 'alice', 'messages')));
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'cards', 'alice'), {cardCode:'VIP-ALICE', recoveryKey:'NEW-SECRET'}));
  await assertFails(getDoc(message(device)));
  await assertFails(setDoc(binding, {ownerUid:'alice', cardCode:'VIP-ALICE', recoveryCode:'SECRET-ALICE'}));
  await assertSucceeds(setDoc(binding, {ownerUid:'alice', cardCode:'VIP-ALICE', recoveryCode:'NEW-SECRET'}));
  await assertSucceeds(getDoc(message(device)));
});
test('read receipts are private, bound to the reader and a real message, with server timestamps', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const read = db => doc(db, 'personalInboxes', 'alice', 'reads', 'first');
  await assertSucceeds(setDoc(read(alice), {viewerUid:'alice', readAt:serverTimestamp()}));
  await assertFails(setDoc(read(bob), {viewerUid:'bob', readAt:serverTimestamp()}));
  await assertFails(setDoc(read(alice), {viewerUid:'bob', readAt:serverTimestamp()}));
  await assertFails(setDoc(read(alice), {viewerUid:'alice', readAt:new Date(0)}));
  await assertFails(setDoc(doc(alice,'personalInboxes','alice','reads','missing'), {viewerUid:'alice',readAt:serverTimestamp()}));
  await assertFails(getDoc(read(bob)));
});
