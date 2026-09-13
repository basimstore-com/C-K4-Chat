# C$K4 Chat changelog

## 5.3.1 — Request System Fix + Admin Full Control + Bug Cleanup (2026-09-13)

### Request System (CRITICAL FIX — user-reported bug)
- **Root cause fix:** `acceptRequest()` / `rejectRequest()` / `sendChatRequest()` body double-stringify ho rahi thi (`JSON.stringify` + `api()` helper bhi stringify karta hai) → server 500 "Unexpected token" error → **request accept kabhi kabhi fail hoti thi**. Ab plain object pass hota hai — **100% reliable**
- **New UI:** Chat list me "📩 CHAT REQUESTS (N)" section with ✓ Accept / ✕ Reject buttons (pehle yeh UI thi hi nahi!)
- **New UI:** Notification modal me request notifications par Accept/Reject buttons (live update)
- **Reverse-request auto-accept:** A→B request jab B A ko already request bhej chuki ho to bhejte hi accept (pehle silently flip hota tha)
- **Accept/reject race-safe:** dono directions check + already-accepted idempotent response
- **Privacy:** block hua user request nahi bhej sakta (dono directions), self-request blocked

### Admin Panel — Groups/Channels POORA CONTROL (new)
- **Channels tab (naya):** Create / Rename / Subscribers list + remove / Post broadcast / Notify All users / Delete — sab themed confirm modal ke sath
- **Groups controls (new):** Create / Rename / Members list + add/remove / Broadcast message / Delete
- **8 destructive actions** native `confirm()` se **themed `askConfirm()` modal** me convert (delete user/message/story/group/channel, remove member/sub, logout)

### Bug Fixes
- Chat list me "Chat Requests" section invisible tha jab normal chats na hon (assignment overwrite bug)
- Notification modal buttons stale/rebind nahi hote the (class `active` vs `open` mismatch — 3 jagah)
- Socket cold-start race (test flakiness) — settle delay add

### Verified (self-test before delivery)
- REST e2e suite: **68 PASS / 0 FAIL**
- Socket.io suite (DM, typing, seen, message-status): **11 PASS / 0 FAIL** (2 consecutive runs)
- Browser E2E: request send → pending list visible → Accept → chat appears → message send with ✓ delivery tick
- Browser E2E: admin Channels — create + delete via themed modal, toast feedback, live table refresh

## 5.3.0 — Privacy + Admin Control Upgrade (2026-09-13)

### Privacy System
- Public user list removed for normal users
- Users only discoverable via username search (min 2 chars)
- Message Request system: send → accept → chat
- Reject allows re-request; Block permanently blocks requests
- Email & Phone hidden by default (show_email / show_phone toggles in privacy settings)
- Admin still sees full user list + emails + phones

### Groups & Channels
- Only Admin can create Groups and Channels
- Official **C$K4** channel auto-created on first run
- Every new/existing user is auto-subscribed to C$K4 (cannot unfollow)
- Channel posts can notify all users

### Other
- Existing security fixes (2FA TOTP, View-once delete, TURN, CSP, strong password, PBKDF2) retained
- Syntax checked clean

## 5.2.0 — 2026-09-10
- Previous fixes...
