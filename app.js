import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getMessaging, getToken, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
const firebaseConfig = {
  apiKey: 'AIzaSyD-q497X-cHUezvOBL_TKc3L8sHmNQOLDs',
  authDomain: 'vip-card-22fbe.firebaseapp.com',
  projectId: 'vip-card-22fbe',
  storageBucket: 'vip-card-22fbe.firebasestorage.app',
  messagingSenderId: '654929991228',
  appId: '1:654929991228:web:f7b91cc0f57c34342e5539'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const RECOVERED_KEY = 'vipRecoveredCardV2';
const GOOGLE_WALLET_WEB_APP = 'https://vip-wallet.vipsigarettaelettronica.workers.dev/';
const VAPID_KEY = 'BLJiZc0yLcFLWPqB8iTUENL3PV2YsOayyMkAilUd-KDtpTfaLDFGe9gvz6E5kOBbVVqv7abpefdKTV7penJWj7g';
const C128 = [
'BaBbBb','BbBaBb','BbBbBa','AbAbBc','AbAcBb','AcAbBb','AbBbAc','AbBcAb','AcBbAb','BbAbAc','BbAcAb','BcAbAb','AaBbCb','AbBaCb','AbBbCa','AaCbBb','AbCaBb','AbCbBa','BbCbAa','BbAaCb','BbAbCa','BaCbAb','BbCaAb','CaBaCa','CaAbBb','CbAaBb','CbAbBa','CaBbAb','CbBaAb','CbBbAa','BaBaBc','BaBcBa','BcBaBa','AaAcBc','AcAaBc','AcAcBa','AaBcAc','AcBaAc','AcBcAa','BaAcAc','BcAaAc','BcAcAa','AaBaCc','AaBcCa','AcBaCa','AaCaBc','AaCcBa','AcCaBa','CaCaBa','BaAcCa','BcAaCa','BaCaAc','BaCcAa','BaCaCa','CaAaBc','CaAcBa','CcAaBa','CaBaAc','CaBcAa','CcBaAa','CaDaAa','BbAdAa','DcAaAa','AaAbBd','AaAdBb','AbAaBd','AbAdBa','AdAaBb','AdAbBa','AaBbAd','AaBdAb','AbBaAd','AbBdAa','AdBaAb','AdBbAa','BdAbAa','BbAaAd','DaCaAa','BdAaAb','AcDaAa','AaAbDb','AbAaDb','AbAbDa','AaDbAb','AbDaAb','AbDbAa','DaAbAb','DbAaAb','DbAbAa','BaBaDa','BaDaBa','DaBaBa','AaAaDc','AaAcDa','AcAaDa','AaDaAc','AaDcAa','DaAaAc','DaAcAa','AaCaDa','AaDaCa','CaAaDa','DaAaCa','BaAdAb','BaAbAd','BaAbCb','BcCaAaB'
];

const $ = id => document.getElementById(id);
const registrationView = $('registrationView');
const recoveryView = $('recoveryView');
const cardView = $('cardView');
const form = $('registrationForm');
let currentUser = null;
let currentCard = null;
let currentRecoveryCode = '';

function sanitizeName(v) { return v.trim().replace(/\s+/g, ' '); }
function calculateAge(isoDate) {
  const birth = new Date(isoDate + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
function randomChars(n) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}
function randomCode() {
  const s = randomChars(8);
  return `VIP-${s.slice(0,4)}-${s.slice(4,8)}`;
}
function randomRecoveryCode() {
  const s = randomChars(16);
  return `RCV-${s.slice(0,4)}-${s.slice(4,8)}-${s.slice(8,12)}-${s.slice(12,16)}`;
}
function normalizeRecoveryCode(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ''); }
function birthMonthDay(iso) { return iso?.length >= 10 ? iso.slice(5,10) : ''; }

function code128Values(text) {
  const values = [104];
  for (const ch of text) {
    const n = ch.charCodeAt(0);
    if (n < 32 || n > 126) throw new Error('Carattere non supportato nel barcode');
    values.push(n - 32);
  }
  let checksum = values[0];
  for (let i = 1; i < values.length; i++) checksum += values[i] * i;
  values.push(checksum % 103, 106);
  return values;
}
function drawBarcode(svg, text, large=false) {
  const values = code128Values(text);
  const quiet = 12;
  let units = quiet * 2;
  for (const v of values) for (const ch of C128[v]) units += 'ABCDabcd'.indexOf(ch) % 4 + 1;
  const h = large ? 190 : 82;
  svg.setAttribute('viewBox', `0 0 ${units} ${h}`);
  svg.innerHTML = '';
  let x = quiet;
  for (const v of values) {
    for (const ch of C128[v]) {
      const idx = 'ABCDabcd'.indexOf(ch);
      const width = idx % 4 + 1;
      if (ch === ch.toUpperCase()) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x); rect.setAttribute('y', 0); rect.setAttribute('width', width); rect.setAttribute('height', h); rect.setAttribute('fill', '#000');
        svg.appendChild(rect);
      }
      x += width;
    }
  }
}
function birthdayCouponStatus(data) {
  const md = data.birthMonthDay || birthMonthDay(data.birthDate);
  if (!md) return { active: false, used: false };
  const [m, d] = md.split('-').map(Number);
  if (!m || !d) return { active: false, used: false };
  const today = new Date(); today.setHours(0,0,0,0);
  const candidates = [today.getFullYear(), today.getFullYear() - 1];
  for (const year of candidates) {
    const start = new Date(year, m - 1, d); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate() + 6);
    if (today >= start && today <= end) {
      return { active: true, used: Number(data.birthdayCouponUsedYear) === year, year, end };
    }
  }
  return { active: false, used: false };
}
function formatShortDate(date) {
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
}

function showRegistration() {
  registrationView.classList.remove('hidden');
  recoveryView.classList.add('hidden');
  cardView.classList.add('hidden');
}
function showRecovery() {
  registrationView.classList.add('hidden');
  recoveryView.classList.remove('hidden');
  cardView.classList.add('hidden');
  $('recoveryError').textContent = '';
  $('recoveryInput').focus();
}
function showCard(data, recoveryCode='', recovered=false) {
  currentCard = data;
  currentRecoveryCode = recoveryCode || data.recoveryKey || '';
  registrationView.classList.add('hidden');
  recoveryView.classList.add('hidden');
  cardView.classList.remove('hidden');
  $('welcomeName').textContent = `Ciao, ${data.firstName}`;
  $('memberName').textContent = `${data.firstName} ${data.lastName}`;
  $('cardCode').textContent = data.cardCode;
  $('cardCodeLarge').textContent = data.cardCode;
  $('recoveryCode').textContent = currentRecoveryCode || '—';
const fullName = `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Cliente V.I.P.';
const walletBtn = $('googleWalletBtn');

walletBtn.href = '#';

walletBtn.onclick = async e => {
  e.preventDefault();

  try {
    const walletApiUrl = new URL(GOOGLE_WALLET_WEB_APP);
    walletApiUrl.searchParams.set('card', data.cardCode);
    walletApiUrl.searchParams.set('name', fullName);

    const response = await fetch(walletApiUrl.toString());

    if (!response.ok) {
      throw new Error('Errore servizio Google Wallet');
    }

    const result = await response.json();

    if (!result.saveUri) {
      throw new Error('Link Google Wallet non disponibile');
    }

    window.location.href = result.saveUri;

  } catch (err) {
    console.error(err);
    alert('Google Wallet non è disponibile. Riprova tra poco.');
  }
};
  drawBarcode($('barcode'), data.cardCode, false);
  drawBarcode($('barcodeLarge'), data.cardCode, true);
  const coupon = birthdayCouponStatus(data);
  const box = $('birthdayBox');
  box.classList.toggle('hidden', !coupon.active);
  if (coupon.active) {
    $('birthdayTitle').textContent = coupon.used ? 'V.I.P. BIRTHDAY GIÀ UTILIZZATO' : 'BUON COMPLEANNO! -15%';
    $('birthdayText').textContent = coupon.used
      ? 'Il coupon compleanno di quest’anno risulta già utilizzato.'
      : `Il tuo V.I.P. Birthday è attivo fino al ${formatShortDate(coupon.end)}. Utilizzabile una volta in negozio. Esclusi i prodotti soggetti a monopolio e gli articoli non promozionabili.`;
    box.classList.toggle('used', coupon.used);
  }
  $('syncStatus').textContent = recovered ? 'Tessera recuperata su questo dispositivo.' : 'Tessera collegata al database V.I.P.';
}

function validateBirthDate() {
  const val = $('birthDate').value;
  const notice = $('ageNotice');
  notice.className = 'notice'; notice.textContent = '';
  if (!val) return null;
  const age = calculateAge(val);
  if (!Number.isFinite(age) || age < 0) { notice.classList.add('bad'); notice.textContent = 'Controlla la data di nascita.'; return false; }
  if (age < 18) { notice.classList.add('bad'); notice.textContent = 'Registrazione non consentita: la V.I.P. Card è riservata ai maggiorenni.'; return false; }
  notice.classList.add('ok'); notice.textContent = `Età verificata: ${age} anni.`; return true;
}

async function createRecoveryRecord(user, data, code) {
  await setDoc(doc(db, 'recoveries', code), {
    ownerUid: user.uid,
    cardCode: data.cardCode,
    firstName: data.firstName,
    lastName: data.lastName,
    birthMonthDay: birthMonthDay(data.birthDate),
    birthdayCouponUsedYear: data.birthdayCouponUsedYear || null,
    createdAt: serverTimestamp()
  });
}
async function ensureRecoveryForOwner(user, data) {
  if (data.recoveryKey) return data.recoveryKey;
  const code = randomRecoveryCode();
  await createRecoveryRecord(user, data, code);
  await updateDoc(doc(db, 'cards', user.uid), { recoveryKey: code, recoveryUpdatedAt: serverTimestamp() });
  data.recoveryKey = code;
  return code;
}
async function loadOwnCard(user) {
  const ref = doc(db, 'cards', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data();
  const recoveryCode = await ensureRecoveryForOwner(user, data);
  showCard(data, recoveryCode, false);
  return true;
}
async function ensureAnonymousSession() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        currentUser = user; unsub();
        try {
          const found = await loadOwnCard(user);
          if (!found) {
            const cached = localStorage.getItem(RECOVERED_KEY);
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                if (parsed?.card?.cardCode && parsed?.recoveryCode) {
                  // Aggiorna i dati minimi della tessera dal record recovery, così
                  // compleanno e stato coupon non restano bloccati nella cache locale.
                  try {
                    const freshSnap = await getDoc(doc(db, 'recoveries', parsed.recoveryCode));
                    if (freshSnap.exists()) {
                      const freshCard = freshSnap.data();
                      localStorage.setItem(RECOVERED_KEY, JSON.stringify({ recoveryCode: parsed.recoveryCode, card: freshCard }));
                      showCard(freshCard, parsed.recoveryCode, true);
                    } else {
                      showCard(parsed.card, parsed.recoveryCode, true);
                    }
                  } catch {
                    showCard(parsed.card, parsed.recoveryCode, true);
                  }
                }
              } catch {}
            }
          }
          resolve(user);
        } catch (err) { reject(err); }
      } else {
        try { await signInAnonymously(auth); } catch (err) { unsub(); reject(err); }
      }
    });
  });
}

$('birthDate').addEventListener('change', validateBirthDate);
$('showRecovery').addEventListener('click', showRecovery);
$('backToRegistration').addEventListener('click', showRegistration);

form.addEventListener('submit', async e => {
  e.preventDefault(); $('formError').textContent = '';
  if (!form.reportValidity()) return;
  if (validateBirthDate() !== true) { $('formError').textContent = 'Non è possibile creare la tessera.'; return; }
  if (!$('privacyConsent').checked) { $('formError').textContent = 'Devi accettare l’informativa privacy.'; return; }
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true; submitBtn.textContent = 'CREAZIONE IN CORSO...';
  try {
    if (!currentUser) await ensureAnonymousSession();
    const cardRef = doc(db, 'cards', currentUser.uid);
    const existing = await getDoc(cardRef);
    if (existing.exists()) {
      const data = existing.data();
      const recoveryCode = await ensureRecoveryForOwner(currentUser, data);
      showCard(data, recoveryCode, false);
      return;
    }
    const recoveryKey = randomRecoveryCode();
    const data = {
      ownerUid: currentUser.uid,
      firstName: sanitizeName($('firstName').value),
      lastName: sanitizeName($('lastName').value),
      phone: $('phone').value.trim(),
      email: $('email').value.trim(),
      birthDate: $('birthDate').value,
      privacyConsent: true,
      marketingConsent: $('marketingConsent').checked,
      consentVersion: '2026-09-v1',
      cardCode: randomCode(),
      recoveryKey,
      createdAt: serverTimestamp()
    };
    await setDoc(cardRef, data);
    await createRecoveryRecord(currentUser, data, recoveryKey);
    showCard({ ...data, createdAt: new Date().toISOString() }, recoveryKey, false);
  } catch (err) {
    console.error(err);
    $('formError').textContent = 'Non riesco a salvare la tessera. Controlla la connessione e riprova.';
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = 'CREA LA MIA V.I.P. CARD';
  }
});

$('recoveryForm').addEventListener('submit', async e => {
  e.preventDefault();
  $('recoveryError').textContent = '';
  const code = normalizeRecoveryCode($('recoveryInput').value);
  if (!code.startsWith('RCV-') || code.length < 15) { $('recoveryError').textContent = 'Controlla il codice di recupero.'; return; }
  const btn = $('recoveryForm').querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'RECUPERO IN CORSO...';
  try {
    const snap = await getDoc(doc(db, 'recoveries', code));
    if (!snap.exists()) { $('recoveryError').textContent = 'Codice non trovato. Controllalo oppure chiedi assistenza in negozio.'; return; }
    const card = snap.data();
    localStorage.removeItem('vipRecoveredCardV1');
    localStorage.setItem(RECOVERED_KEY, JSON.stringify({ recoveryCode: code, card }));
    showCard(card, code, true);
  } catch (err) {
    console.error(err);
    $('recoveryError').textContent = 'Recupero non disponibile. Riprova tra poco.';
  } finally {
    btn.disabled = false; btn.textContent = 'RECUPERA LA TESSERA';
  }
});

$('fullscreenBarcode').addEventListener('click', () => $('barcodeModal').classList.remove('hidden'));
$('closeModal').addEventListener('click', () => $('barcodeModal').classList.add('hidden'));
$('barcodeModal').addEventListener('click', e => { if (e.target === $('barcodeModal')) $('barcodeModal').classList.add('hidden'); });
$('copyCode').addEventListener('click', async () => {
  const code = $('cardCode').textContent;
  try { await navigator.clipboard.writeText(code); $('copyCode').textContent = 'CODICE COPIATO ✓'; setTimeout(() => $('copyCode').textContent = 'COPIA CODICE TESSERA', 1700); }
  catch { alert('Codice tessera: ' + code); }
});
$('copyRecovery').addEventListener('click', async () => {
  if (!currentRecoveryCode) return;
  try { await navigator.clipboard.writeText(currentRecoveryCode); $('copyRecovery').textContent = 'CODICE COPIATO ✓'; setTimeout(() => $('copyRecovery').textContent = 'COPIA CODICE RECUPERO', 1700); }
  catch { alert('Codice recupero: ' + currentRecoveryCode); }
});

ensureAnonymousSession().catch(err => {
  console.error(err);
  $('formError').textContent = 'Connessione al servizio tessere non disponibile. Ricarica la pagina.';
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
