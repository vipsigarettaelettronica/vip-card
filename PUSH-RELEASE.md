# Push notifications 6.4.0

Backend deployed to vip-card-notifications.vipsigarettaelettronica.workers.dev. Owner configured FIREBASE_SERVICE_ACCOUNT as a runtime secret and enabled production access on 2026-09-21. The assistant has not read the private key.

Origin restrictions and unauthenticated rejection checked live. Client/admin and notification display tests: 15 passed. Prior Worker tests and dry-run passed. No notifications sent by assistant, no paid plans enabled, existing Wallet Worker untouched.

Authenticated service-account operation and actual phone reception remain to be verified with a new personal message sent by the owner to her own card. Do not broadcast a test or replay old messages.

Server verifies Firebase Google admin identity and resolves recipient ownership against authoritative cards and recovery proof. Promotional notifications require marketing consent. Generic lock-screen text, persistent delivery claims and event deduplication limit disclosure and duplicates. FCM acceptance is not delivery or reading confirmation.

Admin must keep the tab open during batches. Ambiguous sends are not automatically retried. Sound and badge presentation depend on OS settings and support. A saved message remains saved if push delivery fails.
