# Push delivery — prepared, not deployed

The server and client changes are on a separate branch. Production stays at 6.3.0 until configuration is complete.

## Behavior

After saving a new general or personal message, the admin calls an authenticated `/send` endpoint. Only a verified Firebase Google admin token with the expected project, issuer and email is accepted. The server reads the saved message (no arbitrary text submitted for delivery), checks its age, resolves devices against authoritative cards/current recovery access, and sends a generic data-only FCM push. Marketing selection additionally requires the authoritative card's marketing consent.

Five devices are processed per request; the admin continues through the batches. Each message/token delivery has a persistent claim written before FCM contact. Repeated requests do not resend it. Network-ambiguous deliveries remain unconfirmed instead of being automatically retried. FCM acceptance is NOT a delivery/read receipt.

The service worker displays a non-silent notification, protects against repeated event IDs, updates badge hints where supported and opens the protected Communications section on tap. Foreground delivery is handled too. Sound and icon presentation still follow the phone/OS settings.

## Deployment prerequisites

1. Complete Cloudflare dashboard verification/login. The existing cloud browser currently stops at Cloudflare security verification; do not bypass it.
2. Deploy the separate `vip-card-notifications` Worker from `push-server/`, using the user's existing Cloudflare account and a free plan. Do not overwrite the Wallet Worker.
3. Configure a dedicated Firebase project service account with only the necessary FCM send and Firestore permissions. Place its JSON only into the encrypted Worker secret `FIREBASE_SERVICE_ACCOUNT`. Do not put it in GitHub, browser code, logs or chat. Verify project ID `vip-card-22fbe`. Do not enable paid plans without authorization.
4. Record the actual deployed HTTPS `/send` URL in `push-config.js`. Empty configuration currently fails safely and reports saved messages without claiming notification delivery.
5. Validate authenticated endpoint behavior and deploy the client only after the endpoint/secret are ready and release is authorized. Never send backlog; the sender rejects messages older than 15 minutes.
6. With the owner's explicit test authorization, send a NEW personal message only to the owner's card with the app closed. Verify banner, sound and tap/open. Do not test with a real customer broadcast.

No test notification has been sent, no paid plan enabled, no worker deployed, no secret generated/read.

## Verification

- Existing client/admin regression tests: 12 passed.
- Worker tests: 6 passed (input validation, authoritative recipient proof and revocation, marketing filtering, data-only privacy, duplicate/ambiguous delivery, expired-token result, authentication/origin rejection).
- Service worker display tests: 3 passed (background and foreground display, repeated event IDs, Firebase automatic display without duplicates).
- Wrangler dry-run bundle succeeded. This is a build check, not a live delivery test.

## Current limitations to retain in the UI

- A successful Firestore save must stay reported as saved even if push delivery fails.
- No guaranteed sound, immediate delivery or badge count on every OS.
- A cancelled/closed admin tab can interrupt the remaining batches; no background queue exists yet.
- The receiver badge updates are hints; message read status in Firestore remains authoritative.
