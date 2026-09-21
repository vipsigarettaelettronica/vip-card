import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
let oauthCache;
const segment = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function validateRequest(body) {
  if (!body || !['personal','general'].includes(body.scope) || !segment(body.messageId)
    || (body.scope === 'personal' && !segment(body.ownerUid))
    || !['service','marketing'].includes(body.kind)
    || !Number.isSafeInteger(body.cursor ?? 0) || (body.cursor ?? 0) < 0 || (body.cursor ?? 0) > 10000) throw new Error('INVALID_REQUEST');
  return { ...body, cursor: body.cursor ?? 0 };
}
export function decode(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key,v]) => [key,
    v.stringValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : undefined)
    ?? (v.timestampValue ? new Date(v.timestampValue).getTime() : undefined)
  ]));
}
function encode(data) {
  return Object.fromEntries(Object.entries(data).map(([key,value]) => [key,
    typeof value === 'boolean' ? {booleanValue:value} : typeof value === 'number' ? {integerValue:String(value)} : {stringValue:String(value)}
  ]));
}
export function verifiedOwner(subscription, id, cards, access) {
  if (subscription.enabled !== true || subscription.ownerUid !== id || typeof subscription.token !== 'string' || !subscription.token) return null;
  const own = cards.get(id);
  if (own?.cardCode === subscription.cardCode) return id;
  const proof = access.get(id);
  const card = cards.get(proof?.ownerUid);
  if (proof && card && proof.cardCode === card.cardCode && subscription.cardCode === card.cardCode
      && proof.recoveryCode && proof.recoveryCode === card.recoveryKey) return proof.ownerUid;
  return null;
}
export function eligible(subscription, owner, card, request) {
  return !!owner && (request.scope === 'general' || owner === request.ownerUid)
    && (request.kind !== 'marketing' || card?.marketingConsent === true);
}
export function notificationPayload(token, jobId, appUrl) {
  return { message: { token, data: {
    title: 'V.I.P. Card', body: 'Hai un nuovo messaggio da V.I.P. Apri l’app per leggerlo.',
    url: appUrl + '?messages=1', eventId: jobId
  }, webpush: { headers: {TTL:'86400', Urgency:'high'} } } };
}
async function accessToken(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!sa.client_email || !sa.private_key || sa.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('SERVER_NOT_CONFIGURED');
  if (oauthCache?.email === sa.client_email && oauthCache.until > Date.now()) return oauthCache.token;
  const now = Math.floor(Date.now()/1000);
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore'})
    .setProtectedHeader({alg:'RS256'}).setIssuer(sa.client_email).setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now+3600).sign(key);
  const response = await fetch('https://oauth2.googleapis.com/token', {method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('SERVER_AUTH_FAILED');
  oauthCache = {email:sa.client_email,token:data.access_token,until:Date.now()+Math.max(0,(data.expires_in-120))*1000};
  return data.access_token;
}
async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function claimAndSend(deps, jobId, token, appUrl) {
  const existing = await deps.claim(jobId);
  if (existing) return existing.status === 'accepted' ? 'alreadyAccepted' : 'uncertain';
  // Persist the claim BEFORE contacting FCM. Never automatically resend after an ambiguous failure.
  let response;
  try { response = await deps.send(notificationPayload(token, jobId, appUrl)); }
  catch { await deps.finish(jobId, 'uncertain').catch(()=>{}); return 'uncertain'; }
  if (response.ok) {
    await deps.finish(jobId, 'accepted').catch(()=>{});
    return 'accepted';
  }
  const code = response.error?.details?.find(d=>d.errorCode)?.errorCode;
  const status = code === 'UNREGISTERED' ? 'expired' : 'failed';
  await deps.finish(jobId,status).catch(()=>{});
  return status;
}
async function dispatch(request, env, input) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!bearer) throw new Error('UNAUTHORIZED');
  let identity;
  try { identity = (await jwtVerify(bearer,googleKeys,{algorithms:['RS256'],audience:env.FIREBASE_PROJECT_ID,issuer:`https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`})).payload; }
  catch { throw new Error('UNAUTHORIZED'); }
  if (identity.email !== env.ADMIN_EMAIL || identity.email_verified !== true || identity.firebase?.sign_in_provider !== 'google.com') throw new Error('FORBIDDEN');
  const token = await accessToken(env);
  const root = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const headers = {Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  async function read(path) {
    const r = await fetch(`${root}/${path}`,{headers});
    if (r.status===404) return null;
    if (!r.ok) throw new Error('DATABASE_UNAVAILABLE');
    return decode((await r.json()).fields);
  }
  const path = input.scope==='personal' ? `personalInboxes/${input.ownerUid}/messages/${input.messageId}` : `messages/${input.messageId}`;
  const message = await read(path);
  if (!message || message.active === false || !Number.isFinite(message.publishedAt) || Date.now()-message.publishedAt > 15*60*1000 || message.publishedAt>Date.now()+60000) throw new Error('MESSAGE_NOT_RECENT');
  // Batch listing avoids exceeding the free Worker's per-request subrequest limit.
  const query = await fetch(`${root}:runQuery`,{method:'POST',headers,body:JSON.stringify({structuredQuery:{from:[{collectionId:'pushSubscriptions'}],where:{fieldFilter:{field:{fieldPath:'enabled'},op:'EQUAL',value:{booleanValue:true}}},limit:1000}})});
  if (!query.ok) throw new Error('DATABASE_UNAVAILABLE');
  const subscriptions=(await query.json()).filter(r=>r.document).map(r=>({id:r.document.name.split('/').pop(),...decode(r.document.fields)})).sort((a,b)=>a.id.localeCompare(b.id));
  if (subscriptions.length===1000) throw new Error('TOO_MANY_DEVICES');
  const batch=subscriptions.slice(input.cursor,input.cursor+5);
  const results={accepted:0,alreadyAccepted:0,uncertain:0,failed:0,expired:0,skipped:0};
  for(const sub of batch) {
    const cards=new Map(), access=new Map();
    const own=await read(`cards/${sub.id}`);
    if(own) cards.set(sub.id,own);
    if(!own || own.cardCode!==sub.cardCode) {
      const proof=await read(`cardMessageAccess/${sub.id}`);
      if(proof && segment(proof.ownerUid)) {access.set(sub.id,proof);const card=await read(`cards/${proof.ownerUid}`);if(card)cards.set(proof.ownerUid,card);}
    }
    const owner=verifiedOwner(sub,sub.id,cards,access);
    if(!eligible(sub,owner,cards.get(owner),input)) {results.skipped++;continue;}
    // One delivery per saved message and FCM token, including duplicate device registrations.
    const jobId=await digest(`${path}:${sub.token}`);
    const status=await claimAndSend({
      claim:async id=>{
        const r=await fetch(`${root}/pushDeliveries?documentId=${id}`,{method:'POST',headers,body:JSON.stringify({fields:encode({status:'claimed',createdAt:Date.now(),messagePath:path})})});
        if(r.status===409)return await read(`pushDeliveries/${id}`) || {status:'uncertain'};
        if(!r.ok)throw new Error('DATABASE_UNAVAILABLE');
        return null;
      },
      finish:async(id,status)=>{
        const r=await fetch(`${root}/pushDeliveries/${id}?updateMask.fieldPaths=status`,{method:'PATCH',headers,body:JSON.stringify({fields:encode({status})})});
        if(!r.ok)throw new Error('DATABASE_UNAVAILABLE');
      },
      send:async payload=>{
        const r=await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,{method:'POST',headers,body:JSON.stringify(payload)});
        const data=await r.json();return {ok:r.ok,error:data.error};
      }
    },jobId,sub.token,env.APP_URL);
    results[status]++;
  }
  return {...results,nextCursor: input.cursor+5<subscriptions.length ? input.cursor+5 : null};
}
export default {async fetch(request,env) {
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin!==env.ALLOWED_ORIGIN)return new Response(JSON.stringify({error:'ORIGIN_DENIED'}),{status:403,headers});
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(new URL(request.url).pathname!='/send' || request.method!=='POST')return new Response(JSON.stringify({error:'NOT_FOUND'}),{status:404,headers});
  try {
    const raw=await request.text();if(raw.length>2048)throw new Error('INVALID_REQUEST');
    const input=validateRequest(JSON.parse(raw));
    const result=await dispatch(request,env,input);
    return new Response(JSON.stringify(result),{headers});
  } catch(error) {
    const allowed=['INVALID_REQUEST','UNAUTHORIZED','FORBIDDEN','SERVER_NOT_CONFIGURED','SERVER_AUTH_FAILED','DATABASE_UNAVAILABLE','MESSAGE_NOT_RECENT','TOO_MANY_DEVICES'];
    const code=allowed.includes(error.message)?error.message:'DELIVERY_UNAVAILABLE';
    return new Response(JSON.stringify({error:code}),{status:code==='UNAUTHORIZED'?401:code==='FORBIDDEN'?403:code==='INVALID_REQUEST'?400:503,headers});
  }
}};
