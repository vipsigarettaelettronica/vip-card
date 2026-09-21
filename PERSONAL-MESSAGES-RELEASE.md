# V.I.P. Card 6.3.0 — review before release

## Customer-facing behavior

- General announcements remain in the existing public messages collection.
- The customer detail panel has a clearly named recipient, a private message form, confirmation before sending, history, and read status.
- Personal messages use separate per-owner inboxes and appear with the personal label in Communications. Snapshot listeners update the open app.
- Recovered devices prove possession of the current recovery secret through a rules-validated access record. Changing the recovery secret revokes their inbox access until they recover again; message history stays associated with the card owner.
- With notification permission already granted, the app refreshes its FCM token and device registration on startup and network reconnection. Failure is shown as a connection problem, not as revoked permission.
- The app updates its icon badge while running on platforms supporting the Badging API. This does not deliver a push to a closed app.

## Required deployment sequence — not performed

1. Read and back up the complete current live Firestore rules. The repository's `firestore-rules-v5.txt` is older than the current live consent rules and MUST NOT replace them.
2. Merge `personal-messages.rules.inc` inside the live `match /databases/{database}/documents` block. Confirm that no broader existing wildcard grants access to these new paths. Keep all existing consent/card protections.
3. Re-run rule tests against the combined rules, then deploy the additive rules after the owner's release approval.
4. Merge this branch to the Pages release branch after approval. Versioned client/admin/style URLs and service worker cache version move to 6.3.0.
5. Test with controlled owner and recovered test cards: send one explicitly authorized test message, verify only its intended recipient can see it, open it and check the receipt. Do not send test broadcasts to real customers.

## Push delivery remains separate

The existing admin publishing function only writes Firestore documents. This PR does not deploy a trusted server sender or claim successful push delivery. No notification was sent and no billing plan changed.

Before enabling personal-message push delivery, implement an authenticated trusted sender with server-side recipient resolution and proof of device/card linkage, rather than trusting the client-writable `pushSubscriptions.cardCode`. Avoid including private message content in push payloads; use a generic alert that opens the protected inbox. Review recipient eligibility and applicable consent for broadcasts. Do not replay old messages on deployment.

The current Firebase console uses the Spark plan. Decide on a trusted sender deployment without silently enabling billing. Test sound and OS badge behavior on the owner's actual phone; both remain subject to permission and platform settings.

## Verification

- `node --test registration-flow.test.cjs tests/admin-personal-messages.test.cjs`: 12 passing tests, including existing registration/consent behavior, message escaping, private receipt routing, public-message fallback, device registration recovery and captured-recipient handling.
- `npm run test:messages`: 4 passing Firestore Emulator scenarios. Covers owner/admin access, cross-customer and anonymous denial, collection query denial, forged recovery record denial, recovery-secret rotation/revocation and receipt validation.
- Syntax checks: app.js, admin.js, sw.js.
- No live rules changed, no Pages release, no real customer message sent.

## Rollback

Revert the frontend release commit if needed. The additive rules and private inboxes may stay in place; older clients ignore them. Never move private messages into the public collection as a compatibility fallback.
