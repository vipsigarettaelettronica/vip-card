// Add INSIDE match /databases/{database}/documents in the current LIVE rules.
// Do not replace the existing rules with the older firestore-rules-v5.txt.
function canReadPersonalInbox(ownerUid) {
  return signedIn() && (
    request.auth.uid == ownerUid || (
      exists(/databases/$(database)/documents/cardMessageAccess/$(request.auth.uid))
      && get(/databases/$(database)/documents/cardMessageAccess/$(request.auth.uid)).data.ownerUid == ownerUid
      && get(/databases/$(database)/documents/cardMessageAccess/$(request.auth.uid)).data.recoveryCode
         == get(/databases/$(database)/documents/cards/$(ownerUid)).data.recoveryKey
      && get(/databases/$(database)/documents/cardMessageAccess/$(request.auth.uid)).data.cardCode
         == get(/databases/$(database)/documents/cards/$(ownerUid)).data.cardCode
    )
  );
}

match /cardMessageAccess/{deviceUid} {
  allow get: if isAdmin() || (signedIn() && request.auth.uid == deviceUid);
  allow list: if isAdmin();
  allow create, update: if signedIn() && request.auth.uid == deviceUid
    && request.resource.data.keys().hasAll(['ownerUid', 'cardCode', 'recoveryCode'])
    && request.resource.data.keys().hasOnly(['ownerUid', 'cardCode', 'recoveryCode'])
    && request.resource.data.ownerUid is string
    && request.resource.data.cardCode is string
    && request.resource.data.recoveryCode is string
    && request.resource.data.recoveryCode == get(/databases/$(database)/documents/cards/$(request.resource.data.ownerUid)).data.recoveryKey
    && request.resource.data.cardCode == get(/databases/$(database)/documents/cards/$(request.resource.data.ownerUid)).data.cardCode;
  allow delete: if isAdmin() || (signedIn() && request.auth.uid == deviceUid);
}

match /personalInboxes/{ownerUid}/messages/{messageId} {
  allow read: if isAdmin() || canReadPersonalInbox(ownerUid);
  allow create, update: if isAdmin()
    && exists(/databases/$(database)/documents/cards/$(ownerUid))
    && request.resource.data.keys().hasAll(['title', 'body', 'active', 'publishedAt'])
    && request.resource.data.keys().hasOnly(['title', 'body', 'active', 'publishedAt'])
    && request.resource.data.title is string && request.resource.data.title.size() > 0 && request.resource.data.title.size() <= 80
    && request.resource.data.body is string && request.resource.data.body.size() > 0 && request.resource.data.body.size() <= 500
    && request.resource.data.active is bool
    && request.resource.data.publishedAt == request.time;
  allow delete: if isAdmin();
}

match /personalInboxes/{ownerUid}/reads/{messageId} {
  allow read: if isAdmin() || canReadPersonalInbox(ownerUid);
  allow create, update: if canReadPersonalInbox(ownerUid)
    && exists(/databases/$(database)/documents/personalInboxes/$(ownerUid)/messages/$(messageId))
    && request.resource.data.keys().hasAll(['viewerUid', 'readAt'])
    && request.resource.data.keys().hasOnly(['viewerUid', 'readAt'])
    && request.resource.data.viewerUid == request.auth.uid
    && request.resource.data.readAt == request.time;
  allow delete: if isAdmin();
}
