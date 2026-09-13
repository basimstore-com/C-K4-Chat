# 🚀 C$K4 Chat v5.3.1 — Full-Featured Messenger

Ek complete real-time chat application — **Node.js + Express + Socket.io + SQLite + WebRTC** par bana hua, Linux/macOS par directly run hota hai. WhatsApp-inspired UI, secure admin controls, persistent reactions aur mobile fixes included hain.

> This is an independent messenger implementation. It does not use WhatsApp private APIs or copy WhatsApp branding.

## v5.2.0 upgrade

- Production startup now requires custom `JWT_SECRET`, `ENCRYPTION_KEY` and `ADMIN_PASSWORD`.
- Removed third-party runtime scripts and unsafe wildcard CORS defaults.
- Added persistent message reactions with toggle support and history hydration.
- Hardened direct messages, group/channel socket rooms, uploads, location validation and admin authorization.
- Fixed admin panel name/report/audit mappings, mobile filters and safe user/story/group deletion cleanup.
- Upgraded Multer and UUID dependencies; use `npm ci` after pulling the new lockfile.

---

## 🛠️ Mobile hotfix included

Is updated build me mobile chat composer ko harden kiya gaya hai:

- Empty composer par 🎤 tap se voice recording start hoti hai; dobara tap se stop karke send hoti hai.
- Voice recording browser ke supported audio format ke saath safe fallback use karti hai.
- Voice upload ke baad recorder cleanup aur audio playback errors handle kiye gaye hain.
- 📎 attachments, 1️⃣ view-once aur send/voice controls narrow screens par shrink ya hide nahi hote.
- Images, videos, audio, documents, multi-file upload aur camera upload ke liye clearer mobile layout.
- Group media metadata aur group view-once messages ke liye database migration included hai; purani database delete karne ki zaroorat nahi.
- Composer ko premium glass-style polish, better spacing aur touch-friendly controls diye gaye hain.

---

## 📋 Features (All 50)

| # | Feature | # | Feature |
|---|---------|---|---------|
| 1 | Text messages | 26 | Polls (live voting) |
| 2 | Voice messages (recording) | 27 | Tic-Tac-Toe game 🎮 |
| 3 | Image sharing | 28 | Channels (broadcast) |
| 4 | Video sharing | 29 | Scheduled messages ⏰ |
| 5 | File/document sharing | 30 | Auto-reply 🤖 |
| 6 | Profile pictures | 31 | Multi-file sharing |
| 7 | Voice calls (WebRTC) 📞 | 32 | Offline messages queue |
| 8 | Video calls (WebRTC) 📹 | 33 | Delete for everyone 🚫 |
| 9 | Group calls | 34 | View-once media 👀 |
| 10 | Screen sharing 🖥️ | 35 | Privacy settings |
| 11 | Emoji picker 😄 | 36 | Story tags (@mentions) |
| 12 | Typing indicator | 37 | Quick replies (/) |
| 13 | Online/last-seen status | 38 | Wallpaper change 🎨 |
| 14 | Delivery/seen ticks ✓✓ | 39 | Stories (24h expiry) |
| 15 | Reply to messages | 40 | Story views + viewer list |
| 16 | Edit messages ✏️ | 41 | Story highlights ⭐ |
| 17 | Forward messages ➡️ | 42 | Group creation |
| 18 | Pin messages 📌 | 43 | Group admin (add/remove members) |
| 19 | Search (global) 🔍 | 44 | Notifications 🔔 |
| 20 | Dark/Light theme 🌙 | 45 | Block/Unblock user 🚷 |
| 21 | Groups chat | 46 | Report user/messages |
| 22 | Stories/Status | 47 | 2FA security 🔐 |
| 23 | AI Chat Bot 🤖 (bot@csk4.com) | 48 | AES-256 message encryption |
| 24 | Voice-to-text (Web Speech API) | 49 | JSON backup download |
| 25 | Live location sharing 📍 | 50 | Admin panel 👑 |

---

## 🧰 Requirements (Kali Linux)

```bash
# Node.js 18+ chahiye (Node 20 recommended). Check karo:
node -v

# Agar Node install nahi hai to:
sudo apt update && sudo apt install -y nodejs npm
# ya nvm se latest LTS:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc && nvm install 20
```

Build tools (sqlite3 native module ke liye — Kali par pehle se hote hain, phir bhi check kar lo):

```bash
sudo apt install -y build-essential python3 make g++
```

---

## ⚡ Quick Start (Kali Linux)

```bash
# 1. Project folder me jao
cd csk4-chat/server

# 2. Dependencies install karo
npm install

# 3. Server start karo
npm start
```

Server start hone par ye screen dikhegi:

```
==========================================
   C$K4 Chat v5.3.1 Server
==========================================
   Web App   :  http://localhost:3000
   Admin Panel:  http://localhost:3000/admin/admin.html
==========================================
```

Ab browser me kholo:
- **Chat App** → http://localhost:3000
- **Admin Panel** → http://localhost:3000/admin/admin.html

---

## 👤 Development accounts (optional)

| Account | Email / Username | Password | Kaam |
|---------|------------------|----------|------|
| **Admin** | value from `.env` | value from `.env` | Admin panel + chat |
| **Demo User** | `demo@csk4.com` | `demo123` | Normal user testing |
| **AI Bot** | `bot@csk4.com` | — | AI chat bot (auto-seeded, isse login karne ki zaroorat nahi) |

> ⚠️ **Note:** Demo accounts only `NODE_ENV=development` me auto-create hote hain. Production me `ENABLE_DEMO_ACCOUNTS=false` rakho.

**Testing tip:** Do different browser tabs/windows (ya browser + incognito) me login karo — ek me `admin@csk4.com`, doosre me `demo@csk4.com` — phir real-time messaging, typing indicator, seen ticks, calls sab live test ho jayenge!

---

## 📱 Mobile Support (v5.1)

App **har mobile screen par auto-adjust** hota hai (320px se lekar tablets tak). v5.1 me complete mobile overhaul:

- **WhatsApp-style 1-pane navigation** — mobile par sidebar/chat full-screen; `←` back button + swipe-right gesture se wapas
- **Auto screen-fit** — responsive breakpoints: 900px / 768px / 480px / 360px + landscape mode; `100dvh` se address-bar bug fix
- **Notch/Dynamic Island safe** — `viewport-fit=cover` + `env(safe-area-inset-*)` (iPhone X+)
- **iOS fixes** — input `font-size: 16px` (auto-zoom rok deta hai), double-tap zoom disable, rubber-band scroll fix
- **Touch UX** — 44px+ touch targets, hamesha-visible message actions, long-press = message menu, vibration feedback
- **Keyboard handling** — keyboard khulne par layout auto-adjust (visualViewport API) + messages bottom scroll
- **Modals bottom-sheet style** mobile par; emoji picker full-width sheet
- **Admin panel** bhi mobile responsive (tables horizontal scroll, stats grid)

**Phone par test karne ka tarika:** Server chalao → phone same WiFi → `http://<PC-IP>:3000` → Demo User quick-login button dabao.

---

## 🌐 LAN / Mobile Testing (same WiFi par)

Server `0.0.0.0` par listen karta hai, to same network wale devices (phone, dusre PC) bhi access kar sakte hain:

```bash
# Apna IP nikaalo:
ip a | grep "inet " | grep -v 127.0.0.1
# Example: 192.168.1.50

# Phir phone browser me kholo:
http://192.168.1.50:3000
```

Agar firewall block kar raha ho to:

```bash
sudo ufw allow 3000/tcp
```

---

## 📁 Project Structure

```
csk4-chat/
├── server/
│   ├── index.js            # Complete backend (REST APIs + Socket.io + WebRTC signaling + cron)
│   ├── package.json        # Dependencies
│   ├── .env                # Environment config (PORT, JWT_SECRET, ENCRYPTION_KEY)
│   ├── .env.example        # Example config
│   ├── admin/
│   │   └── admin.html      # Admin panel UI (soft gold-white theme)
│   ├── database/           # SQLite DB file (auto-created)
│   ├── uploads/            # Media files (images, videos, voice, files)
│   └── backups/            # Auto backups (cron)
├── public/
│   ├── index.html          # Chat app UI (WhatsApp-style)
│   ├── script.js           # Complete frontend logic (170+ functions)
│   └── style.css           # Soft gold-white theme CSS
└── README.md               # Ye file
```

---

## ⚙️ Configuration (.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | change me! | JWT token signing key |
| `ENCRYPTION_KEY` | change me! | AES message encryption key |
| `ADMIN_EMAIL` | `admin@csk4.com` | Admin account email |
| `ADMIN_PASSWORD` | change me! | Admin password |
| `MAX_FILE_SIZE` | `104857600` (100MB) | Upload limit |
| `ALLOWED_ORIGINS` | localhost in development | Allowed browser origins |
| `ENABLE_DEMO_ACCOUNTS` | `true` in development | Seed demo user or not |

Production me `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `ALLOWED_ORIGINS` **zaroor set karo**.

**Password security:** Users ke passwords bcrypt one-way hashes me store hote hain. Admin purana password dekh nahi sakta; Admin Panel ka **Reset password** action naya password set karke purane sessions logout karta hai.

---

## 🎯 Features Kaise Use Karein (Quick Guide)

**Messaging:** Chat kholo → type karo → Enter. Emoji ke liye 😄 button. Voice ke liye 🎤 (hold/record). Attachment 📎 se image/video/file (multi-select + drag-drop). Reply ke liye message par swipe/hover → Reply. Edit ✏️, Delete 🚫 (for everyone), Forward ➡️, Pin 📌 bhi same menu me.

**Stories:** Top bar me **+** dabao → text/image/video story banao → audience choose karo (contacts, everyone, selected users, ya only me) → 24h ke baad auto-delete. Dost ki story dekho → progress bar auto-advance (5s). Apni story par 👁 viewers list, ⭐ highlight, delete.

**Calls:** Chat info (top name) kholo → 📞 voice ya 📹 video call. Screen share 🖥️ call ke andar. Mute 🔇, camera off ⏹️, end 📴.

**Groups/Channels:** ⋮ menu → New Group (members select karo) / New Channel. Group info me members add/remove, leave. Channel me subscribe karke broadcast messages lo.

**Polls:** ⋮ menu → Poll → question + options + duration → send. Live votes update hote hain (socket se).

**Game:** ⋮ menu → Tic-Tac-Toe 🎮 → create → dost ko game message aayega → Join → khelo (X vs O, turns live).

**Schedule:** ⋮ menu → Schedule ⏰ → message + date/time → server cron automatically bhej dega.

**Search:** 🔍 button → global search (users, groups, messages).

**Wallpaper:** ⋮ menu → Wallpaper 🎨 → 9 presets ya custom upload.

**Settings (avatar icon):** Profile edit, theme 🌙 toggle, privacy (last seen / profile pic / status / about), 2FA 🔐 toggle (code save kar lena), Auto-reply 🤖, Backup download, Logout.

**Quick Replies:** ⋮ menu → Quick Replies → shortcut (e.g. `hi`) + message → chat me `/` type karo aur `hi` enter karo.

**View-once 👀:** Attach me view-once toggle → media sirf 1 baar dikhega (auto-hide).

**Live location 📍:** 📎 → Location → live location bhejo.

**Voice-to-text:** 🎤 ke sath mic button — Web Speech API se transcribe.

**AI Bot 🤖:** `bot@csk4.com` se chat shuru karo — smart replies milega.

---

## 🛠️ Troubleshooting (Kali Linux)

| Problem | Solution |
|---------|----------|
| `EACCES` permission error | `sudo chown -R $USER:$USER csk4-chat` ya root se chalao |
| sqlite3 build fail | `sudo apt install -y build-essential python3` phir `npm rebuild sqlite3` |
| Port 3000 busy | `.env` me `PORT=3001` karo, ya `kill $(lsof -t -i:3000)` |
| Camera/Mic not working | Browser par HTTPS ya `localhost` chahiye — `localhost:3000` use karo |
| Screen share nahi chal raha | Chrome/Chromium use karo (Firefox me alag API) |
| Node version old | `nvm install 20 && nvm use 20` |
| Login 401 aa raha hai | `.env` me `JWT_SECRET` change hua to purane tokens invalid — dobara login karo |

**Fresh start (DB reset):**

```bash
cd csk4-chat/server
rm -rf database/csk4.db && npm start
```

---

## 🔧 Tech Stack

- **Backend:** Node.js 20 + Express 4 + Socket.io 4 + SQLite3 (22 tables) + JWT + bcryptjs
- **Frontend:** Vanilla JS SPA (170+ functions) + CSS (dark/light theme)
- **Real-time:** Socket.io rooms (user/group/poll/game), offline message queue
- **Calls:** WebRTC (STUN: Google) — voice/video/screen-share, group signaling
- **Security:** AES-256 encryption (crypto-js), XSS sanitization, rate limiting, 2FA, Helmet
- **Storage:** Multer uploads (100MB), node-cron scheduled messages + auto-backup + story expiry

---

## 📜 License

MIT — C$K4 Chat v5.2 💜

**Enjoy karo! 🚀** Koi bug mile ya feature add karwana ho to batao.




