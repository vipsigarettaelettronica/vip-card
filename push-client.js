import { PUSH_ENDPOINT } from './push-config.js?v=6.4.0';
export async function sendMessageNotification(user, message, {endpoint=PUSH_ENDPOINT, fetcher=fetch}={}) {
  if (!endpoint) throw new Error('PUSH_NOT_CONFIGURED');
  if (!user || user.isAnonymous) throw new Error('PUSH_AUTH_REQUIRED');
  const totals={accepted:0,alreadyAccepted:0,uncertain:0,failed:0,expired:0,skipped:0};
  let cursor=0;
  while(cursor!==null) {
    const token=await user.getIdToken();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),25000);
    let response;
    try {response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...message,cursor}),signal:controller.signal});}
    catch {throw new Error('PUSH_RESULT_UNCERTAIN');}
    finally {clearTimeout(timer);}
    const data=await response.json();
    if(!response.ok)throw new Error(data.error || 'PUSH_UNAVAILABLE');
    for(const key of Object.keys(totals))totals[key]+=Number(data[key]||0);
    if(data.nextCursor!==null && (!Number.isSafeInteger(data.nextCursor)||data.nextCursor<=cursor||data.nextCursor>10000))throw new Error('PUSH_UNAVAILABLE');
    cursor=data.nextCursor;
  }
  return totals;
}
export function notificationSummary(result) {
  const accepted=result.accepted+result.alreadyAccepted;
  if(result.failed||result.uncertain)return `Messaggio salvato. Avviso accettato dal servizio per ${accepted} dispositivi; ${result.failed+result.uncertain} invii non confermati.`;
  if(!accepted)return 'Messaggio salvato nell’app. Nessun dispositivo destinatario raggiungibile con notifiche attive.';
  return `Messaggio salvato. Avviso accettato dal servizio per ${accepted} dispositivi. La ricezione sul telefono dipende dalle sue impostazioni e dalla connessione.`;
}
