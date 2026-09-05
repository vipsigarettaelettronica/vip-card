import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, deleteDoc, doc, getDocs, getFirestore, serverTimestamp, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD-q497X-cHUezvOBL_TKc3L8sHmNQOLDs',
  authDomain: 'vip-card-22fbe.firebaseapp.com',
  projectId: 'vip-card-22fbe',
  storageBucket: 'vip-card-22fbe.firebasestorage.app',
  messagingSenderId: '654929991228',
  appId: '1:654929991228:web:f7b91cc0f57c34342e5539'
};

const ADMIN_EMAIL = 'vipsigarettaelettronica@gmail.com';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const $ = id => document.getElementById(id);
let allCards = [];
let selectedCard = null;

function clean(v) { return String(v ?? '').trim(); }
function escapeHtml(v) { return clean(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatDate(iso) { if (!iso) return '—'; const [y,m,d] = iso.split('-'); return y && m && d ? `${d}/${m}/${y}` : iso; }
function formatTimestamp(ts) { try { return ts?.toDate ? ts.toDate().toLocaleString('it-IT') : '—'; } catch { return '—'; } }
function nextBirthdayDays(iso) {
  if (!iso) return 9999;
  const [y,m,d] = iso.split('-').map(Number);
  if (!m || !d) return 9999;
  const now = new Date(); now.setHours(0,0,0,0);
  let next = new Date(now.getFullYear(), m-1, d); next.setHours(0,0,0,0);
  if (next < now) next = new Date(now.getFullYear()+1, m-1, d);
  return Math.round((next-now)/86400000);
}
function fullName(c) { return `${clean(c.firstName)} ${clean(c.lastName)}`.trim(); }
function isAdmin(user) { return !!user && clean(user.email).toLowerCase() === ADMIN_EMAIL; }
function randomChars(n) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(n); crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
function randomRecoveryCode() {
  const s = randomChars(16);
  return `RCV-${s.slice(0,4)}-${s.slice(4,8)}-${s.slice(8,12)}-${s.slice(12,16)}`;
}
function birthMonthDay(iso) { return iso?.length >= 10 ? iso.slice(5,10) : ''; }
function birthdayCouponStatus(c) {
  const md = birthMonthDay(c.birthDate);
  if (!md) return { active:false, used:false };
  const [m,d] = md.split('-').map(Number);
  const today = new Date(); today.setHours(0,0,0,0);
  for (const year of [today.getFullYear(), today.getFullYear()-1]) {
    const start = new Date(year,m-1,d); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+6);
    if (today >= start && today <= end) return { active:true, used:Number(c.birthdayCouponUsedYear)===year, year, end };
  }
  return { active:false, used:false };
}
function couponLabel(c) {
  const x=birthdayCouponStatus(c);
  if (!x.active) return '';
  return x.used ? '<span class="badge ok">BIRTHDAY USATO</span>' : '<span class="badge birthday">-15% BIRTHDAY ATTIVO</span>';
}

async function login() {
  $('loginError').textContent = '';
  try {
    const result = await signInWithPopup(auth, provider);
    if (!isAdmin(result.user)) { await signOut(auth); $('loginError').textContent = 'Questo account Google non è autorizzato.'; }
  } catch (err) { console.error(err); $('loginError').textContent = 'Accesso non riuscito. Riprova.'; }
}

async function loadCards() {
  $('adminError').textContent = '';
  try {
    const snap = await getDocs(collection(db, 'cards'));
    allCards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allCards.sort((a,b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    render();
  } catch (err) { console.error(err); $('adminError').textContent = 'Non riesco a leggere le tessere. Controlla le regole Firestore.'; }
}

function updateStats() {
  $('statTotal').textContent = allCards.length;
  $('statMarketing').textContent = allCards.filter(c => c.marketingConsent === true).length;
  $('statBirthdays').textContent = allCards.filter(c => nextBirthdayDays(c.birthDate) <= 30).length;
  $('statDanea').textContent = allCards.filter(c => c.daneaLinked !== true).length;
}
function filteredCards() {
  const q = clean($('searchInput').value).toLowerCase();
  const birthdays = $('birthdayFilter').checked;
  const onlyDanea = $('daneaFilter').checked;
  return allCards.filter(c => {
    const haystack = [fullName(c), c.phone, c.email, c.cardCode].map(clean).join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (birthdays && nextBirthdayDays(c.birthDate) > 30) return false;
    if (onlyDanea && c.daneaLinked === true) return false;
    return true;
  });
}
function birthdayLabel(c) {
  const days = nextBirthdayDays(c.birthDate);
  if (days === 0) return '<span class="badge birthday">COMPLEANNO OGGI</span>';
  if (days <= 30) return `<span class="badge birthday">COMPLEANNO TRA ${days} GG</span>`;
  return '';
}
function render() {
  updateStats();
  const cards = filteredCards();
  $('resultCount').textContent = `${cards.length} ${cards.length === 1 ? 'tessera trovata' : 'tessere trovate'}`;
  const list = $('customerList');
  if (!cards.length) { list.innerHTML = '<div class="panel empty-state">Nessun cliente corrisponde ai filtri.</div>'; return; }
  list.innerHTML = cards.map(c => `
    <article class="customer-card" data-id="${escapeHtml(c.id)}">
      <div class="customer-main">
        <div class="customer-title-row"><h3>${escapeHtml(fullName(c) || 'Cliente')}</h3>${birthdayLabel(c)}${couponLabel(c)}</div>
        <div class="customer-code">${escapeHtml(c.cardCode || '—')}</div>
        <div class="customer-meta"><span>${escapeHtml(c.phone || 'Telefono non indicato')}</span><span>${escapeHtml(c.email || 'E-mail non indicata')}</span></div>
      </div>
      <div class="customer-status">
        <span class="badge ${c.daneaLinked === true ? 'ok' : 'warn'}">${c.daneaLinked === true ? 'DANEA ASSOCIATA' : 'DA ASSOCIARE A DANEA'}</span>
        <button class="secondary compact open-customer" data-id="${escapeHtml(c.id)}" type="button">APRI</button>
      </div>
    </article>`).join('');
  list.querySelectorAll('.open-customer').forEach(btn => btn.addEventListener('click', () => openDetail(btn.dataset.id)));
}

function openDetail(id) {
  const c = allCards.find(x => x.id === id); if (!c) return;
  selectedCard = c;
  $('detailName').textContent = fullName(c) || 'Cliente';
  $('detailCardCode').textContent = c.cardCode || '—';
  $('detailPhone').textContent = c.phone || '—';
  $('detailEmail').textContent = c.email || '—';
  $('detailBirthDate').textContent = formatDate(c.birthDate);
  $('detailPrivacy').textContent = c.privacyConsent === true ? 'Accettata' : 'No';
  $('detailMarketing').textContent = c.marketingConsent === true ? 'Acconsente' : 'Non acconsente';
  $('detailCreated').textContent = formatTimestamp(c.createdAt);
  $('detailDanea').textContent = c.daneaLinked === true ? 'Associata' : 'Da associare';
  $('detailRecovery').textContent = c.recoveryKey ? 'Attivo' : 'Non ancora generato';
  const coupon = birthdayCouponStatus(c);
  $('detailBirthdayCoupon').textContent = coupon.active ? (coupon.used ? 'Già utilizzato' : '-15% ATTIVO') : 'Non attivo oggi';
  $('redeemBirthday').classList.toggle('hidden', !coupon.active || coupon.used);
  $('toggleDanea').textContent = c.daneaLinked === true ? 'SEGNA COME NON ASSOCIATA' : 'SEGNA ASSOCIATA A DANEA';
  $('customerModal').classList.remove('hidden');
}

async function toggleDanea() {
  if (!selectedCard) return;
  const next = selectedCard.daneaLinked !== true;
  const btn = $('toggleDanea'); btn.disabled = true;
  try {
    await updateDoc(doc(db, 'cards', selectedCard.id), { daneaLinked: next, daneaUpdatedAt: serverTimestamp() });
    selectedCard.daneaLinked = next; $('customerModal').classList.add('hidden'); render();
  } catch (err) { console.error(err); alert('Non riesco ad aggiornare lo stato Danea.'); }
  finally { btn.disabled = false; }
}

async function resetRecovery() {
  if (!selectedCard) return;
  const btn = $('resetRecovery'); btn.disabled = true;
  try {
    const old = selectedCard.recoveryKey;
    const code = randomRecoveryCode();
    await setDoc(doc(db, 'recoveries', code), {
      ownerUid: selectedCard.ownerUid || selectedCard.id,
      cardCode: selectedCard.cardCode,
      firstName: selectedCard.firstName,
      lastName: selectedCard.lastName,
      birthMonthDay: birthMonthDay(selectedCard.birthDate),
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'cards', selectedCard.id), { recoveryKey: code, recoveryUpdatedAt: serverTimestamp() });
    if (old) { try { await deleteDoc(doc(db, 'recoveries', old)); } catch {} }
    selectedCard.recoveryKey = code;
    $('detailRecovery').textContent = 'Attivo';
    try { await navigator.clipboard.writeText(code); alert(`Nuovo codice recupero:\n${code}\n\nÈ già stato copiato negli appunti.`); }
    catch { alert(`Nuovo codice recupero:\n${code}`); }
  } catch (err) { console.error(err); alert('Non riesco a generare il nuovo codice recupero.'); }
  finally { btn.disabled = false; }
}

async function redeemBirthdayCoupon() {
  if (!selectedCard) return;
  const coupon = birthdayCouponStatus(selectedCard);
  if (!coupon.active || coupon.used) return;
  if (!confirm(`Confermi l'utilizzo del coupon V.I.P. Birthday -15% per ${fullName(selectedCard)}?`)) return;
  const btn = $('redeemBirthday'); btn.disabled = true;
  try {
    await updateDoc(doc(db, 'cards', selectedCard.id), { birthdayCouponUsedYear: coupon.year, birthdayCouponUsedAt: serverTimestamp() });
    if (selectedCard.recoveryKey) {
      try { await updateDoc(doc(db, 'recoveries', selectedCard.recoveryKey), { birthdayCouponUsedYear: coupon.year }); } catch (e) { console.warn(e); }
    }
    selectedCard.birthdayCouponUsedYear = coupon.year;
    const idx = allCards.findIndex(x => x.id === selectedCard.id); if (idx >= 0) allCards[idx].birthdayCouponUsedYear = coupon.year;
    $('detailBirthdayCoupon').textContent = 'Già utilizzato';
    btn.classList.add('hidden');
    render();
    alert('Coupon compleanno registrato come utilizzato.');
  } catch (err) { console.error(err); alert('Non riesco a registrare il coupon.'); }
  finally { btn.disabled = false; }
}

$('redeemBirthday').addEventListener('click', redeemBirthdayCoupon);
$('googleLogin').addEventListener('click', login);
$('logoutBtn').addEventListener('click', () => signOut(auth));
$('searchInput').addEventListener('input', render);
$('birthdayFilter').addEventListener('change', render);
$('daneaFilter').addEventListener('change', render);
$('closeCustomerModal').addEventListener('click', () => $('customerModal').classList.add('hidden'));
$('customerModal').addEventListener('click', e => { if (e.target === $('customerModal')) $('customerModal').classList.add('hidden'); });
$('toggleDanea').addEventListener('click', toggleDanea);
$('resetRecovery').addEventListener('click', resetRecovery);
$('copyDetailCode').addEventListener('click', async () => {
  if (!selectedCard?.cardCode) return;
  try { await navigator.clipboard.writeText(selectedCard.cardCode); $('copyDetailCode').textContent = 'CODICE COPIATO ✓'; setTimeout(() => $('copyDetailCode').textContent = 'COPIA CODICE TESSERA', 1500); }
  catch { alert('Codice tessera: ' + selectedCard.cardCode); }
});

onAuthStateChanged(auth, async user => {
  if (!user || user.isAnonymous) {
    if (user?.isAnonymous) await signOut(auth);
    $('loginPanel').classList.remove('hidden');
    $('adminPanel').classList.add('hidden');
    $('loginError').textContent = '';
    return;
  }
  if (!isAdmin(user)) {
    await signOut(auth);
    $('loginPanel').classList.remove('hidden');
    $('adminPanel').classList.add('hidden');
    $('loginError').textContent = 'Questo account Google non è autorizzato.';
    return;
  }
  $('loginPanel').classList.add('hidden');
  $('adminPanel').classList.remove('hidden');
  $('adminIdentity').textContent = user.email;
  $('loginError').textContent = '';
  await loadCards();
});
