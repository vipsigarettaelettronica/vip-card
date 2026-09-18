import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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
const CURRENT_PRIVACY_VERSION = '2026-09-v4';
const CURRENT_REGULATION_VERSION = '2026-09-v2';
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

function nextBirthdayInfo(data) {
  const md = data.birthMonthDay || birthMonthDay(data.birthDate);
  if (!md) return null;
  const [m, d] = md.split('-').map(Number);
  if (!m || !d) return null;

  const today = new Date();
  today.setHours(0,0,0,0);

  let next = new Date(today.getFullYear(), m - 1, d);
  next.setHours(0,0,0,0);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);

  const days = Math.round((next - today) / 86400000);
  const yearStart = new Date(next.getFullYear() - 1, m - 1, d);
  const span = Math.max(1, Math.round((next - yearStart) / 86400000));
  const elapsed = Math.max(0, span - days);
  const progress = Math.max(0, Math.min(100, Math.round((elapsed / span) * 100)));

  return { days, next, progress };
}

function renderBirthdayDashboard(data) {
  const box = $('birthdayBox');
  if (!box) return;

  const coupon = birthdayCouponStatus(data);
  const info = nextBirthdayInfo(data);
  box.classList.remove('used');

  if (coupon.active) {
    $('birthdayTitle').textContent = coupon.used ? 'Coupon compleanno utilizzato ✓' : 'Il tuo -15% è disponibile!';
    $('birthdayText').textContent = coupon.used
      ? 'Hai già utilizzato il V.I.P. Birthday di quest’anno.'
      : `Valido fino al ${formatShortDate(coupon.end)} e utilizzabile una volta in negozio.`;
    $('birthdayCountdown').textContent = coupon.used ? 'Ci rivediamo al prossimo compleanno.' : 'BUON COMPLEANNO!';
    $('birthdayProgress').style.width = '100%';
    box.classList.toggle('used', coupon.used);
    return;
  }

  if (!info) {
    $('birthdayTitle').textContent = 'Coupon compleanno';
    $('birthdayText').textContent = 'Il countdown sarà disponibile quando la data di nascita sarà associata alla tessera.';
    $('birthdayCountdown').textContent = '';
    $('birthdayProgress').style.width = '0%';
    return;
  }

  $('birthdayTitle').textContent = 'Coupon compleanno';
  $('birthdayText').textContent = info.days === 0
    ? 'Il tuo V.I.P. Birthday è arrivato.'
    : `Il tuo coupon -15% si attiva il giorno del compleanno.`;
  $('birthdayCountdown').textContent = info.days === 1 ? 'Manca 1 giorno' : `Mancano ${info.days} giorni`;
  $('birthdayProgress').style.width = `${info.progress}%`;
}

function renderReviewStatus(data) {
  const done = data.reviewDone === true;
  $('reviewCheck')?.classList.toggle('hidden', !done);
  if ($('reviewStatus')) {
    $('reviewStatus').textContent = done
      ? 'Recensione effettuata ✓ Grazie per il tuo feedback.'
      : 'Se ti va, racconta la tua esperienza con V.I.P.';
  }
  if ($('reviewLink')) {
    $('reviewLink').classList.toggle('hidden', done);
  }
}

function messageDate(data) {
  try {
    if (data.publishedAt?.toDate) return data.publishedAt.toDate();
    if (data.createdAt?.toDate) return data.createdAt.toDate();
    if (data.date) return new Date(data.date);
  } catch {}
  return new Date(0);
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function messageDayLabel(date) {
  const today = new Date();
  today.setHours(0,0,0,0);

  const target = new Date(date);
  target.setHours(0,0,0,0);

  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return 'OGGI';
  if (diff === 1) return 'IERI';

  return target.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: target.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  }).toUpperCase();
}

function messageTimeLabel(date) {
  return date.toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function markMessagesRead(messages) {
  if (!currentUser || !currentCard?.cardCode || !currentRecoveryCode || !messages.length) return;

  const safeCardCode = String(currentCard.cardCode).replace(/[^A-Za-z0-9_-]/g, '_');

  try {
    await Promise.all(messages.map(async m => {
      const readId = `${m.id}__${safeCardCode}`;

      await setDoc(
        doc(db, 'messageReads', readId),
        {
          messageId: m.id,
          cardCode: currentCard.cardCode,
          recoveryCode: currentRecoveryCode,
          viewerUid: currentUser.uid,
          firstName: currentCard.firstName || '',
          lastName: currentCard.lastName || '',
          readAt: serverTimestamp()
        },
        { merge: true }
      );
    }));
  } catch (err) {
    console.warn('Registrazione lettura comunicazioni non disponibile:', err);
  }
}

async function loadMessages() {
  const preview = $('messagePreview');
  const list = $('messagesList');
  const badge = $('messageBadge');
  const toggle = $('toggleMessages');
  if (!preview || !list || !badge || !toggle) return;

  try {
    const snap = await getDocs(collection(db, 'messages'));
    const newestFirst = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => m.active !== false)
      .sort((a,b) => messageDate(b) - messageDate(a));

    const lastSeenKey = currentCard?.cardCode
      ? `vipMessagesSeen:${currentCard.cardCode}`
      : 'vipMessagesSeen';

    const lastSeen = Number(localStorage.getItem(lastSeenKey) || 0);
    const unread = newestFirst.filter(m => messageDate(m).getTime() > lastSeen).length;

    badge.textContent = String(unread);
    badge.classList.toggle('hidden', unread < 1);

    if (!newestFirst.length) {
      preview.innerHTML = '<p class="dashboard-copy">Nessuna comunicazione al momento.</p>';
      list.innerHTML = '';
      toggle.classList.add('hidden');
      return;
    }

    toggle.classList.remove('hidden');

    const latest = newestFirst[0];
    const latestDate = messageDate(latest);

    preview.innerHTML = `
      <div class="sms-preview">
        <div class="sms-avatar" aria-hidden="true">VIP</div>
        <div class="sms-preview-copy">
          <strong>${escapeText(latest.title || 'Comunicazione V.I.P.')}</strong>
          <p>${escapeText(latest.body || '')}</p>
          <time>${messageDayLabel(latestDate)} · ${messageTimeLabel(latestDate)}</time>
        </div>
      </div>`;

    const oldestFirst = [...newestFirst].reverse();
    let currentDay = '';

    list.innerHTML = oldestFirst.map(m => {
      const d = messageDate(m);
      const day = messageDayLabel(d);
      const separator = day !== currentDay
        ? `<div class="sms-day-separator"><span>${escapeText(day)}</span></div>`
        : '';

      currentDay = day;

      return `
        ${separator}
        <article class="sms-row">
          <div class="sms-bubble">
            <span class="sms-sender">V.I.P.</span>
            <strong>${escapeText(m.title || 'Comunicazione V.I.P.')}</strong>
            <p>${escapeText(m.body || '')}</p>
            <time>${messageTimeLabel(d)}</time>
          </div>
        </article>
      `;
    }).join('');

    toggle.onclick = async () => {
      const opening = list.classList.contains('hidden');

      list.classList.toggle('hidden');
      toggle.textContent = opening ? 'CHIUDI MESSAGGI' : 'APRI MESSAGGI';

      if (opening) {
        localStorage.setItem(lastSeenKey, String(Date.now()));
        badge.classList.add('hidden');

        requestAnimationFrame(() => {
          list.scrollTop = list.scrollHeight;
        });

        await markMessagesRead(newestFirst);
      }
    };
  } catch (err) {
    console.warn('Comunicazioni non disponibili:', err);
    preview.innerHTML = '<p class="dashboard-copy">Le comunicazioni non sono disponibili in questo momento.</p>';
  }
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
async function showCard(data, recoveryCode='', recovered=false) {
  currentCard = data;
  currentRecoveryCode = recoveryCode || data.recoveryKey || '';
  const notificationBtn = $('enableNotifications');
const notificationStatus = $('notificationStatus');

try {
  if ('Notification' in window && Notification.permission === 'granted' && currentUser) {
    const pushSnap = await getDoc(doc(db, 'pushSubscriptions', currentUser.uid));

    if (pushSnap.exists() && pushSnap.data().enabled === true) {
      notificationBtn.textContent = 'AVVISI V.I.P. ATTIVI ✓';
      notificationStatus.textContent = 'Riceverai avvisi V.I.P. su orari speciali, chiusure e comunicazioni utili.';
    } else {
      notificationBtn.textContent = 'ATTIVA AVVISI V.I.P.';
      notificationStatus.textContent = 'RICEVI AVVISI SU ORARI SPECIALI, EVENTI E V.I.P. BIRTHDAY.';
    }
  } else {
    notificationBtn.textContent = 'ATTIVA AVVISI V.I.P.';
    notificationStatus.textContent = 'RICEVI AVVISI SU ORARI SPECIALI, EVENTI E V.I.P. BIRTHDAY.';
  }
} catch (err) {
  console.error('Controllo stato notifiche:', err);
}
  let consentIsCurrent =
  data.privacyConsent === true &&
  data.privacyVersion === CURRENT_PRIVACY_VERSION &&
  data.regulationConsent === true &&
  data.regulationVersion === CURRENT_REGULATION_VERSION;

if (!consentIsCurrent && data.cardCode) {
  try {
    const localConsent = JSON.parse(
      localStorage.getItem(`vipConsent:${data.cardCode}`) || 'null'
    );

    consentIsCurrent =
      localConsent?.privacyVersion === CURRENT_PRIVACY_VERSION &&
      localConsent?.regulationVersion === CURRENT_REGULATION_VERSION;
  } catch {}
}

if (!consentIsCurrent && currentRecoveryCode) {
  try {
    const consentSnap = await getDoc(
      doc(db, 'consentAcceptances', currentRecoveryCode)
    );

    if (consentSnap.exists()) {
      const consent = consentSnap.data();

      consentIsCurrent =
        consent.privacyConsent === true &&
        consent.privacyVersion === CURRENT_PRIVACY_VERSION &&
        consent.regulationConsent === true &&
        consent.regulationVersion === CURRENT_REGULATION_VERSION;

      if (consentIsCurrent) {
        currentCard.privacyConsent = true;
        currentCard.privacyVersion = CURRENT_PRIVACY_VERSION;
        currentCard.regulationConsent = true;
        currentCard.regulationVersion = CURRENT_REGULATION_VERSION;

        localStorage.setItem(
          `vipConsent:${data.cardCode}`,
          JSON.stringify({
            privacyVersion: CURRENT_PRIVACY_VERSION,
            regulationVersion: CURRENT_REGULATION_VERSION
          })
        );
      }
    }
  } catch (err) {
    console.warn('Controllo consensi non disponibile:', err);
  }
}

$('consentUpdateModal').classList.toggle('hidden', consentIsCurrent);
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
  renderBirthdayDashboard(data);
  renderReviewStatus(data);
  await loadMessages();
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
    reviewDone: data.reviewDone === true,
    reviewDoneAt: data.reviewDoneAt || null,
    privacyConsent: data.privacyConsent === true,
privacyVersion: data.privacyVersion || null,
regulationConsent: data.regulationConsent === true,
regulationVersion: data.regulationVersion || null,
marketingConsent: data.marketingConsent === true,
consentRecordedAt: data.consentRecordedAt || null,
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
$('confirmConsentUpdate').addEventListener('click', async () => {
  const btn = $('confirmConsentUpdate');
  const error = $('consentUpdateError');

  error.textContent = '';

  if (
    !$('updatePrivacyConsent').checked ||
    !$('updateRegulationConsent').checked
  ) {
    error.textContent =
      'Devi confermare Privacy e Regolamento per continuare.';
    return;
  }

  if (!currentUser || !currentCard || !currentRecoveryCode) {
    error.textContent =
      'Non riesco a identificare la tessera. Riprova.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'SALVATAGGIO...';

  try {
    await setDoc(
      doc(db, 'consentAcceptances', currentRecoveryCode),
      {
        recoveryCode: currentRecoveryCode,
        cardCode: currentCard.cardCode,
        privacyConsent: true,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        regulationConsent: true,
        regulationVersion: CURRENT_REGULATION_VERSION,
        acceptedByUid: currentUser.uid,
        acceptedAt: serverTimestamp()
      },
      { merge: true }
    );

    currentCard.privacyConsent = true;
    currentCard.privacyVersion = CURRENT_PRIVACY_VERSION;
    currentCard.regulationConsent = true;
    currentCard.regulationVersion = CURRENT_REGULATION_VERSION;

    localStorage.setItem(
      `vipConsent:${currentCard.cardCode}`,
      JSON.stringify({
        privacyVersion: CURRENT_PRIVACY_VERSION,
        regulationVersion: CURRENT_REGULATION_VERSION
      })
    );

    $('consentUpdateModal').classList.add('hidden');

  } catch (err) {
    console.error('Errore salvataggio consensi:', err);
    error.textContent =
      'Non è stato possibile registrare la conferma. Riprova.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'CONFERMA E CONTINUA';
  }
});
form.addEventListener('submit', async e => {
  e.preventDefault(); $('formError').textContent = '';
  if (!form.reportValidity()) return;
  if (validateBirthDate() !== true) { $('formError').textContent = 'Non è possibile creare la tessera.'; return; }
 if (!$('privacyConsent').checked) { $('formError').textContent = 'Devi dichiarare di aver preso visione dell’Informativa Privacy.'; return; }
if (!$('regulationConsent').checked) { $('formError').textContent = 'Devi accettare il Regolamento V.I.P. Card.'; return; }
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
privacyVersion: '2026-09-v4',

regulationConsent: true,
regulationVersion: '2026-09-v2',

marketingConsent: $('marketingConsent').checked,

consentVersion: '2026-09-v2',
consentRecordedAt: serverTimestamp(),
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
$('copyRecovery').addEventListener('click', async () => {
  if (!currentRecoveryCode) return;
  try { await navigator.clipboard.writeText(currentRecoveryCode); $('copyRecovery').textContent = 'CODICE COPIATO ✓'; setTimeout(() => $('copyRecovery').textContent = 'COPIA CODICE RECUPERO', 1700); }
  catch { alert('Codice recupero: ' + currentRecoveryCode); }
});

ensureAnonymousSession().catch(err => {
  console.error(err);
  $('formError').textContent = 'Connessione al servizio tessere non disponibile. Ricarica la pagina.';
});
$('enableNotifications').addEventListener('click', async () => {
  const btn = $('enableNotifications');
  const status = $('notificationStatus');

  try {
    btn.disabled = true;

    if (!currentUser || !currentCard) {
      throw new Error('Tessera non disponibile');
    }

    if (!(await isSupported())) {
      status.textContent = 'Le notifiche non sono supportate su questo dispositivo.';
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      status.textContent = 'Notifiche non attivate. Puoi abilitarle dalle impostazioni del browser.';
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(firebaseApp);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (!token) {
      throw new Error('Token notifiche non disponibile');
    }

    await setDoc(
      doc(db, 'pushSubscriptions', currentUser.uid),
      {
        ownerUid: currentUser.uid,
        cardCode: currentCard.cardCode,
        firstName: currentCard.firstName || '',
        lastName: currentCard.lastName || '',
        token: token,
        marketingConsent: currentCard.marketingConsent === true,
        enabled: true,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    btn.textContent = 'AVVISI V.I.P. ATTIVI ✓';
    status.textContent = 'Riceverai avvisi V.I.P. su orari speciali, chiusure e comunicazioni utili.';

  } catch (err) {
    console.error('Errore notifiche:', err);
    status.textContent = 'Non è stato possibile attivare gli avvisi. Riprova.';
  } finally {
    btn.disabled = false;
  }
});
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
