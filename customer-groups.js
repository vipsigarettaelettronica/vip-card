// Shared by the admin interface and recipient-selection tests.
export function matchesGroup(card, {gender = '', danea = '', consent = '', category = ''} = {}) {
  if (gender && (card.adminGender || 'unknown') !== gender) return false;
  if (danea === 'linked' && card.daneaLinked !== true) return false;
  if (danea === 'unlinked' && card.daneaLinked === true) return false;
  if (consent === 'yes' && card.marketingConsent !== true) return false;
  if (consent === 'no' && card.marketingConsent === true) return false;
  if (category && !(card.adminCategories || []).includes(category)) return false;
  return true;
}
export function recipientSnapshot(cards, selected, kind) {
  return cards.filter(c => selected.has(c.id) && (kind !== 'marketing' || c.marketingConsent === true))
    .map(c => ({...c}));
}
export async function deliverGroup(job, {save, push, progress = () => {}}) {
  for (const item of job.items) {
    if (item.state === 'done' || item.state === 'skipped') continue;
    try {
      if (!item.saved) {
        const eligible = await save(item, job);
        if (!eligible) { item.state = 'skipped'; progress(); continue; }
        item.saved = true;
      }
      item.result = await push(item, job);
      item.state = item.result.failed || item.result.uncertain ? 'push-error' : 'done';
    } catch (error) {
      item.state = item.saved ? 'push-error' : 'save-error';
    }
    progress();
  }
}
