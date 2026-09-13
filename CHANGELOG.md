# C$K4 Chat changelog

## 5.4.0 — Inbox + SMS Popups + Group Post Permissions + Support/Ads/Tools (2026-09-14)

### Bug Fixes (user-reported — Phase A)
- **A1 BACK BUTTON:** Chat / Group / Channel view me top-left **⬅ back button** — header click karke chat list par wapas. Story viewer me bhi close button
- **A2 STORY VIDEO TIMER:** Story video ka progress timer ab **video actually play hone par hi start** hota hai (network loading delay me time waste nahi hota)
- **A3 NOTIFICATION SOUND:** Harsh beep hata — ab **soft pleasant chime** (WebAudio 3-harmonic, gentle volume) incoming message/requests par
- **A4 ADMIN MEDIA BROADCAST:** Admin group broadcast + channel post me ab **PIC / VIDEO / FILE attach** kar sakte hain (pehle sirf text tha)
- **A5 ADMIN STORY VIEW:** Admin stories tab me ab story **dekh sakta hai** (image/video + caption + views) — sirf delete nahi
- **A6 ADMIN MEDIA PREVIEW:** Admin messages tab me ab **pic/video/file preview** nazar aata hai (inline thumbnails, pehle sirf [media] label tha)

### New Features (Phase B)
- **B1 INBOX-STYLE CHAT LIST:** Har chat me **last message preview + time + unread badge** (green dot + count). Group messages ke liye unread tracking (last_read timestamp). Channels me last post preview. `/api/inbox` endpoint
- **B2 SMS POPUP + RINGTONE:** Jab message aaye aur aap **doosri chat me ho** ya doosri tab me — top par **SMS-style popup card** slide hota hai (sender name + snippet + ✕). Click = seedha uss chat par. Max 3 popups queue system. Soft chime sound bhi bajta hai
- **B3 GROUP POSTING PERMISSION (dual-layer):** Group me ab **admin decide karta hai kaun post kare**:
  - `post_mode: all` = sab members post kar sake (default) / `post_mode: admin` = **sirf admin**
  - Per-member **Allow Post / Block Post** toggle (admin panel)
  - Admin role hamesha bypass — admin kabhi block nahi hota
  - User-side: permission nahi to **composer disable + note** ("Admin ne aapki posting BLOCK ki hai")
  - Server-side enforce — API bypass possible nahi
- **B4 SOCIAL LINKS + HELP CONTACTS (admin-controlled):** Admin Settings tab se **12 links** control: WhatsApp / Email / TikTok / Facebook / GitHub / X / LinkedIn / Telegram / Telegram Channel / WhatsApp Channel / Instagram / YouTube. User side **Help & Support modal** me sab links + WhatsApp (03347382564) + Email (cryptixshadowkernel@gmail.com)
- **B5 HELP-LINE SUPPORT CHAT:** User **Help & Support** se ticket bhej sakta hai (Problem / Feedback / Suggestion + message). Admin **Support tab** me dekh + **Reply** (user ko live notification + popup) + Close. User apni tickets + admin replies dekh sakta hai
- **B6 ADS SYSTEM:** Admin **Ads tab** — ad create (title + body + link + button label + **"notify all users"** checkbox). Active ad user-side **top banner** (gold glow animation) + sab users ko notification. On/Off toggle + Delete
- **B7 TOOLS SECTION:** Admin **Tools tab** se tools add/manage. Default tools: **TikTok Video Downloader** (csktiktokvideodownloder.netlify.app) + **BasimStore** (basimstore-com.github.io). User side **🛠️ Tools modal** (sidebar button)
- **B8 PREMIUM COLORS:** Realistic premium palette — dark glassmorphism + gold accent gradients. Auth card glass blur + gradient logo text. Message bubbles gold-tinted out-bubbles. Buttons gold gradient + glow. SMS popups / ads banner / help cards / tickets sab premium theme me

### Technical
- DB migrations: `group_members.can_post` (DEFAULT 1) + `last_read`, `groups.post_mode` (DEFAULT 'all'), new tables `site_settings`, `ads`, `tools`, `support_tickets`
- New endpoints: `/api/inbox`, `/api/settings`, `/api/ads`, `/api/tools`, `/api/support`, `/api/support/my`, admin: `/api/admin/settings`, `/api/admin/ads/*`, `/api/admin/tools/*`, `/api/admin/support/*`, `/api/admin/groups/:id/members/:userId/can-post`
- Admin panel 4 naye tabs: Support / Ads / Tools / Settings — 12-endpoint parallel fetch
- Inbox previews **AES-256 decrypt** ho kar send hote hain (pehle raw ciphertext nazar aata tha); inbox groups me `post_mode` expose (legacy NULL → 'all' normalize)
- Fresh-install self-verify: unzip → boot → seeds (admin/demo/bot/channel + 12 settings keys + TikTok/BasimStore tools auto-seed) — sab OK
- **Tests: 130/130 PASS** (e2e 68/68 + socket 11/11 + v5.4.0 suite 51/51)

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
