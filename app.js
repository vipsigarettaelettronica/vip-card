import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD-q497X-cHUevz0BL_TKc3L8sHmNQ0LDs',
  authDomain: 'vip-card-22fbe.firebaseapp.com',
  projectId: 'vip-card-22fbe',
  storageBucket: 'vip-card-22fbe.firebasestorage.app',
  messagingSenderId: '654929991228',
  appId: '1:654929991228:web:f7b91cc0f57c34342e5539'
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// Code 128 patterns. Uppercase = bar, lowercase = space. A-D = width 1-4.
const C128 = [
'BaBbBb','BbBaBb','BbBbBa','AbAbBc','AbAcBb','AcAbBb','AbBbAc','AbBcAb','AcBbAb','BbAbAc','BbAcAb','BcAbAb','AaBbCb','AbBaCb','AbBbCa','AaCbBb','AbCaBb','AbCbBa','BbCbAa','BbAaCb','BbAbCa','BaCbAb','BbCaAb','CaBaCa','CaAbBb','CbAaBb','CbAbBa','CaBbAb','CbBaAb','CbBbAa','BaBaBc','BaBcBa','BcBaBa','AaAcBc','AcAaBc','AcAcBa','AaBcAc','AcBaAc','AcBcAa','BaAcAc','BcAaAc','BcAcAa','AaBaCc','AaBcCa','AcBaCa','AaCaBc','AaCcBa','AcCaBa','CaCaBa','BaAcCa','BcAaCa','BaCaAc','BaCcAa','BaCaCa','CaAaBc','CaAcBa','CcAaBa','CaBaAc','CaBcAa','CcBaAa','CaDaAa','BbAdAa','DcAaAa','AaAbBd','AaAdBb','AbAaBd','AbAdBa','AdAaBb','AdAbBa','AaBbAd','AaBdAb','AbBaAd','AbBdAa','AdBaAb','AdBbAa','BdAbAa','BbAaAd','DaCaAa','BdAaAb','AcDaAa','AaAbDb','AbAaDb','AbAbDa','AaDbAb','AbDaAb','AbDbAa','DaAbAb','DbAaAb','DbAbAa','BaBaDa','BaDaBa','DaBaBa','AaAaDc','AaAcDa','AcAaDa','AaDaAc','AaDcAa','DaAaAc','DaAcAa','AaCaDa','AaDaCa','CaAaDa','DaAaCa','BaAdAb','BaAbAd','BaAbCb','BcCaAaB'
];

const $ = id => document.getElementById(id);
const registrationView = $('registrationView');
const cardView = $('cardView');
const form = $('registrationForm');
let currentUser = null;
let currentCard = null;

function sanitizeName(v) {
  return v.trim().replace(/\s+/g, ' ');
}

function calculateAge(isoDate) {
  const birth = new Date(isoDate + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = '';
  for (const b of bytes) suffix += chars[b % chars.length];
  return 'VIP-' + suffix.slice(0,4) + '-' + suffix.slice(4,8);
}

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
  for (const v of values) {
    for (const ch of C128[v]) units += 'ABCDabcd'.indexOf(ch) % 4 + 1;
  }
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
        rect.setAttribute('x', x);
        rect.setAttribute('y', 0);
        rect.setAttribute('width', width);
        rect.setAttribute('height', h);
        rect.setAttribute('fill', '#000');
        svg.appendChild(rect);
      }
      x += width;
    }
  }
}

function isBirthdayToday(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
}

function showCard(data) {
  currentCard = data;
  registrationView.classList.add('hidden');
  cardView.classList.remove('hidden');
  $('welcomeName').textContent = `Ciao, ${data.firstName}`;
  $('memberName').textContent = `${data.firstName} ${data.lastName}`;
  $('cardCode').textContent = data.cardCode;
  $('cardCodeLarge').textContent = data.cardCode;
  drawBarcode($('barcode'), data.cardCode, false);
  drawBarcode($('barcodeLarge'), data.cardCode, true);
  $('birthdayBox').classList.toggle('hidden', !isBirthdayToday(data.birthDate));
}

function validateBirthDate() {
  const val = $('birthDate').value;
  const notice = $('ageNotice');
  notice.className = 'notice';
  notice.textContent = '';
  if (!val) return null;
  const age = calculateAge(val);
  if (!Number.isFinite(age) || age < 0) {
    notice.classList.add('bad');
    notice.textContent = 'Controlla la data di nascita.';
    return false;
  }
  if (age < 18) {
    notice.classList.add('bad');
    notice.textContent = 'Registrazione non consentita: la V.I.P. Card è riservata ai maggiorenni.';
    return false;
  }
  notice.classList.add('ok');
  notice.textContent = `Età verificata: ${age} anni.`;
  return true;
}

async function loadOwnCard(user) {
  const ref = doc(db, 'cards', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) showCard(snap.data());
}

async function ensureAnonymousSession() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (user) {
        currentUser = user;
        unsub();
        try {
          await loadOwnCard(user);
          resolve(user);
        } catch (err) {
          reject(err);
        }
      } else {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          unsub();
          reject(err);
        }
      }
    });
  });
}

$('birthDate').addEventListener('change', validateBirthDate);

form.addEventListener('submit', async e => {
  e.preventDefault();
  $('formError').textContent = '';
  if (!form.reportValidity()) return;
  if (validateBirthDate() !== true) {
    $('formError').textContent = 'Non è possibile creare la tessera.';
    return;
  }
  if (!$('privacyConsent').checked) {
    $('formError').textContent = 'Devi accettare l’informativa privacy.';
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'CREAZIONE IN CORSO...';

  try {
    if (!currentUser) await ensureAnonymousSession();
    const cardRef = doc(db, 'cards', currentUser.uid);
    const existing = await getDoc(cardRef);
    if (existing.exists()) {
      showCard(existing.data());
      return;
    }

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
      createdAt: serverTimestamp()
    };

    await setDoc(cardRef, data);
    showCard({ ...data, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    $('formError').textContent = 'Non riesco a salvare la tessera. Controlla la connessione e riprova.';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'CREA LA MIA V.I.P. CARD';
  }
});

$('fullscreenBarcode').addEventListener('click', () => $('barcodeModal').classList.remove('hidden'));
$('closeModal').addEventListener('click', () => $('barcodeModal').classList.add('hidden'));
$('barcodeModal').addEventListener('click', e => { if (e.target === $('barcodeModal')) $('barcodeModal').classList.add('hidden'); });

$('copyCode').addEventListener('click', async () => {
  const code = $('cardCode').textContent;
  try {
    await navigator.clipboard.writeText(code);
    $('copyCode').textContent = 'CODICE COPIATO ✓';
    setTimeout(() => $('copyCode').textContent = 'COPIA CODICE TESSERA', 1700);
  } catch {
    alert('Codice tessera: ' + code);
  }
});

ensureAnonymousSession().catch(err => {
  console.error(err);
  $('formError').textContent = 'Connessione al servizio tessere non disponibile. Ricarica la pagina.';
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
