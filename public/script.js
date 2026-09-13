/* ============================================================
   C$K4 Chat v5.3.1 — script.js (Client)
   50 Features | WhatsApp-style UI
   ============================================================ */

'use strict';

/* ---------------- STATE ---------------- */
let TOKEN = localStorage.getItem('csk4_token') || '';
let ME = null;

function updateAdminOnlyUI() {
  const isAdmin = !!(ME && (ME.isAdmin || ME.is_admin));
  document.querySelectorAll('[title="New Group"], [title="New Channel"]').forEach(btn => {
    btn.style.display = isAdmin ? '' : 'none';
  });
}

let socket = null;
let currentChatUser = null;      // direct chat target {id, username, ...}
let currentGroup = null;         // group chat target
let currentChannel = null;       // channel target
let messages = [];               // currently loaded direct messages
let groupMessages = [];
let users = [];                  // all users cache
let groups = [];
let channels = [];
let pendingRequests = { incoming: [], outgoing: [] }; // v5.3.1: incoming requests = Accept/Reject buttons
let stories = [];                // grouped stories
let notifications = [];
let replyTo = null;              // message being replied to
let forwardMsgId = null;
let viewOnceMode = false;
let typingTimers = {};
let mediaRecorder = null;
let audioChunks = [];
let recStartTime = 0;
let recTimerInterval = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;          // { callId, type, with: userId, incoming }
let incomingCallData = null;
let callTimerInterval = null;
let callStartTs = 0;
let screenTrack = null;
let pollTimer = null;
let storyIndex = 0;              // index in current story user's list
let storyUserIdx = 0;            // which user's stories viewing
let storyViewTimer = null;
let currentWallpaper = localStorage.getItem('csk4_wallpaper') || '';
let activeTab = 'chats';
let lastMsgPreview = {};         // chatId -> {text, ts, unread}
let unreadByChat = {};
let emojiCategories = null;
let gameCurrent = null;          // active game state
let scheduledView = false;
let aiThinking = false;

const EMOJIS = {
  '😀': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😮‍💨','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','🙌','👏','👋','🤝','👍','👎','✊','✌️','🤞','🫰','🤟','🤘','👌','🤌','🤏','☝️','✋','🤚','🖐️','🖖','🫱','🫲','🫸','🫷','✍️','🙏','💪','🦾'],
  'animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪲','🦋','🐌','🐛','🐜','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐂','🐃','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐈‍⬛','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔'],
  'food': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🥂','🍷','🥃','🍸','🍹','🧉','🍾'],
  'activities': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🤾','🏌️','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️','🎪','🤹','🩰','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎲','♟️','🎯','🎳','🎮','🎰','🧩'],
  'objects': ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️','⏰','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🪜','🧰','🔧','🔨','⚒️','🛠️','⛏️','🪛','🔩','⚙️','🧲','🔫','💉','🩸','💊','🩹','🩺','🚪','🪑','🛏️','🚽','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🧼','🪥','🧽','🧯','🛒','🚬','⚰️','🗿','🏺','🎈','🎁','🎊','🎉','🎎','🧸','🪄','🔮','🪬','🕹️','🧿'],
  'symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','🉹','🈴','🈵','🈹','🈚','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❓','✅','🔔','🔖','🔗','📌','📍','📎','🖥️','🔒','🔓','🔐','🔑','🗝️','🧭','🧪'],
  'flags': ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏴‍☠️','🇦🇨','🇦🇪','🇦🇫','🇦🇬','🇦🇮','🇦🇱','🇦🇲','🇦🇴','🇦🇶','🇦🇷','🇦🇸','🇦🇹','🇦🇺','🇦🇼','🇦🇽','🇦🇿','🇧🇦','🇧🇧','🇧🇩','🇧🇪','🇧🇫','🇧🇬','🇧🇭','🇧🇮','🇧🇯','🇧🇱','🇧🇲','🇧🇳','🇧🇴','🇧🇷','🇧🇸','🇧🇹','🇧🇼','🇵🇰','🇮🇳','🇨🇳','🇺🇸','🇬🇧','🇸🇦','🇦🇫'],
};

const EMOJI_NAMES = { '😀': 'Smileys', 'animals': 'Animals & Nature', 'food': 'Food & Drink', 'activities': 'Activities', 'objects': 'Objects', 'symbols': 'Symbols & Hearts', 'flags': 'Flags' };

/* ---------------- HELPERS ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeStr = (ts) => { const d = new Date(ts); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
const dateStr = (ts) => new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const uid = () => Math.random().toString(36).slice(2, 10);

function toast(msg, type = 'info', ms = 2600) {
  const wrap = $('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, ms);
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN };
}

async function api(path, opts = {}) {
  try {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.form ? { 'Authorization': 'Bearer ' + TOKEN } : authHeaders(),
      body: opts.form ? opts.form : (opts.body ? JSON.stringify(opts.body) : undefined)
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (String(e.message).includes('401') || String(e.message).includes('Invalid or expired token') || String(e.message).includes('No token')) {
      // token dead -> force login
      localStorage.removeItem('csk4_token');
      TOKEN = '';
    }
    throw e;
  }
}

function initialOf(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }
function avatarHtml(p) {
  const pic = p?.profile_pic || p?.avatar || '';
  if (pic) return `<img src="${esc(pic)}" alt="" onerror="this.style.display='none'">`;
  return esc(initialOf(p?.username || p?.name || '?'));
}

/* ---------------- AUTH SCREEN ---------------- */
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  $('tabLogin').classList.toggle('active', isLogin);
  $('tabRegister').classList.toggle('active', !isLogin);
  $('regUsername').parentElement.classList.toggle('hidden', isLogin);
  const pwHint = $('pwHint');
  if (pwHint) pwHint.classList.toggle('hidden', isLogin);
  $('authBtn').textContent = isLogin ? 'Login 🚀' : 'Register ✨';
}
function fillDemo(email, pass) {
  switchAuthTab('login');
  $('authEmail').value = email;
  $('authPassword').value = pass;
  toast('Credentials filled — Login dabao! 👍', 'info');
}

async function handleAuth() {
  const email = $('authEmail').value.trim().toLowerCase();
  const password = $('authPassword').value;
  const username = $('regUsername').value.trim();
  const isLogin = $('tabLogin').classList.contains('active');
  const errEl = $('authError');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Email aur password dono likho!'; return; }
  if (!isLogin && username.length < 2) { errEl.textContent = 'Username kam se kam 2 characters ka likho!'; return; }
  $('authBtn').disabled = true; $('authBtn').textContent = '⏳ Please wait…';
  try {
    let data;
    if (isLogin) {
      const body = { email, password };
      if (!$('twofaField').classList.contains('hidden')) body.twofa_code = $('twofaCode').value.trim();
      data = await api('/api/login', { method: 'POST', body });
      if (data.requires2FA) {
        $('twofaField').classList.remove('hidden');
        errEl.style.color = 'var(--secondary)';
        errEl.textContent = '🔐 2FA code enter karo (Settings → 2FA Enable se code milta hai)';
        return;
      }
    } else {
      data = await api('/api/register', { method: 'POST', body: { username, email, password } });
    }
    TOKEN = data.token;
    ME = data.user;
    updateAdminOnlyUI();
    localStorage.setItem('csk4_token', TOKEN);
    localStorage.setItem('csk4_me', JSON.stringify(ME));
    toast(data.message, 'success');
    enterApp();
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    $('authBtn').disabled = false;
    $('authBtn').textContent = isLogin ? 'Login 🚀' : 'Register ✨';
  }
}

async function enterApp() {
  $('authScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('app').style.display = 'block';
  /* theme */
  const savedTheme = localStorage.getItem('csk4_theme');
  if (savedTheme === 'dark') document.body.classList.add('dark');
  initEmojiPicker();
  initSocket();
  await Promise.all([loadUsers(), loadGroups(), loadChannels(), loadStories(), loadNotifications()]);
  renderChatList();
  renderStoriesBar();
  setupComposer();
  applyWallpaper();
  if (ME && ME.isAdmin) console.log('%cADMIN MODE 👑', 'color:orange;font-weight:bold');
  toast(`Welcome, ${ME.username}! 🎉`, 'success');
}

/* ---------------- SOCKET ---------------- */
function initSocket() {
  if (socket) { try { socket.disconnect(); } catch {} }
  socket = io({
    auth: { token: TOKEN },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
    timeout: 10000
  });
  socket.on('connect', () => console.log('✅ Socket connected:', socket.id));
  socket.on('connect_error', (e) => console.error('Socket auth error:', e.message));
  socket.on('new-user-registered', () => { loadUsers(); });

  /* --- direct messages --- */
  socket.on('new-message', (m) => {
    if (m.from_user === ME.id) {
      /* my own message ack (multi-device sync) */
      upsertMessage(m);
      renderMessages();
      return;
    }
    const chatKey = 'u_' + m.from_user;
    if (currentChatUser && m.from_user === currentChatUser.id) {
      upsertMessage(m);
      renderMessages();
      socket.emit('mark-seen', { from: m.from_user });
      updateSeenUI(m.from_user);
    } else {
      unreadByChat[chatKey] = (unreadByChat[chatKey] || 0) + 1;
      lastMsgPreview[chatKey] = { text: previewOf(m), ts: m.timestamp };
      notifyToast(m);
      renderChatList();
    }
    lastMsgPreview[chatKey] = { text: previewOf(m), ts: m.timestamp };
    loadUsers();
  });

  socket.on('message-sent', (m) => {
    upsertMessage(m);
    renderMessages();
    updateTicks(m.id, 'queued/delivered');
  });

  socket.on('message-status', (s) => {
    if (s.status === 'delivered') updateTicks(s.id, 'delivered');
    if (s.status === 'queued') updateTicks(s.id, 'sent');
  });

  socket.on('messages-seen', (d) => {
    if (currentChatUser && d.by === currentChatUser.id) {
      document.querySelectorAll('.msg-meta .ticks').forEach(el => el.classList.add('seen'));
      messages.forEach(m => { if (m.from_user === ME.id) m.seen = 1; });
    }
  });

  /* --- group messages --- */
  socket.on('new-group-message', (m) => {
    if (currentGroup && m.group_id === currentGroup.id) {
      groupMessages.push(m);
      renderGroupMessages();
    } else {
      const chatKey = 'g_' + m.group_id;
      unreadByChat[chatKey] = (unreadByChat[chatKey] || 0) + 1;
      lastMsgPreview[chatKey] = { text: (m.sender?.username || 'Someone') + ': ' + previewOf(m), ts: m.timestamp };
      notifyToast(m, true);
    }
    loadGroups();
  });

  /* --- typing --- */
  socket.on('typing', (d) => {
    const isDirect = currentChatUser && d.from === currentChatUser.id;
    const isGroup = currentGroup && d.chatType === 'group' && false; // group typing via chatType+from
    if (isDirect) {
      if (d.typing) { $('chatStatus').innerHTML = '<span class="typing-txt">typing…</span>'; }
      else refreshChatHeaderStatus();
    }
    if (currentGroup && d.chatType === 'group') {
      const who = users.find(u => u.id === d.from);
      if (d.typing) $('chatStatus').innerHTML = `<span class="typing-txt">${esc(who?.username || 'Someone')} typing…</span>`;
      else refreshChatHeaderStatus();
    }
  });

  /* --- edits / deletes / pins --- */
  socket.on('message-edited', (d) => {
    const m = messages.find(x => x.id === d.id);
    if (m) { m.message = d.message; m.edited = 1; renderMessages(); }
  });
  socket.on('message-deleted', (d) => {
    const idx = messages.findIndex(x => x.id === d.id);
    if (idx > -1) { messages[idx] = { ...messages[idx], deleted_for_everyone: 1, message: '', media_url: null }; renderMessages(); }
    const gi = groupMessages.findIndex(x => x.id === d.id);
    if (gi > -1) { groupMessages[gi].deleted_for_everyone = 1; renderGroupMessages(); }
  });
  socket.on('message-pinned', (d) => {
    if (currentChatUser) loadMessages(currentChatUser.id);
    if (currentGroup) loadGroupMessages(currentGroup.id);
  });

  /* --- reactions --- */
  socket.on('message-reaction', (d) => {
    const m = messages.find(x => x.id === d.id) || groupMessages.find(x => x.id === d.id);
    if (m) {
      m.reactions = d.reactions || m.reactions || {};
      currentGroup ? renderGroupMessages() : renderMessages();
    }
  });

  /* --- presence --- */
  socket.on('presence', (d) => {
    if (currentChatUser && d.userId === currentChatUser.id) {
      currentChatUser.online = d.online;
      refreshChatHeaderStatus();
    }
    const u = users.find(x => x.id === d.userId);
    if (u) u.online = d.online;
    renderChatList();
  });
  socket.on('online-count', (d) => console.log('👥 Online:', d.count));

  /* --- view once opened --- */
  socket.on('view-once-opened', (d) => {
    const direct = messages.find(m => m.id === d.id);
    if (direct) direct.viewed = 1;
    const group = groupMessages.find(m => m.id === d.id);
    if (group) { group.viewed = 1; renderGroupMessages(); }
    toast('👁️ Recipient ne view-once message khol diya!', 'info');
  });

  /* --- notifications --- */
  socket.on('notification', (n) => {
    notifications.unshift(n);
    updateNotifBadge();
    notifyToast({ ...n, message: n.body });
    // v5.3.1: naya request aaya to chat list + notif modal live update karo
    if (n.type === 'request') {
      loadUsers().then(() => { renderChatList(); if ($('notifModal') && $('notifModal').classList.contains('open')) renderNotifList(); });
    }
  });

  /* --- stories --- */
  socket.on('story-viewed', (d) => toast(`👁️ ${d.viewer} ne aap ki story dekhi`, 'info', 2000));

  /* --- calls --- */
  socket.on('incoming-call', (d) => showIncomingCall(d));
  socket.on('call-accepted', (d) => { stopRingtone(); stopVibration(); onCallAccepted(d); });
  socket.on('call-rejected', (d) => { stopRingtone(); stopVibration(); hideCallUI(); toast('❌ Call rejected', 'error'); cleanupCall(); });
  socket.on('call-ended', (d) => { stopRingtone(); stopVibration(); hideCallUI(); toast('📵 Call ended', 'info'); cleanupCall(); });
  socket.on('webrtc-signal', async (d) => {
    try {
      if (d.signal.type === 'offer') {
        if (peerConnection) { try { peerConnection.close(); } catch {} }
        await setupPeer(d.signal.from, d.signal, 'answerer');
      } else if (d.signal.type === 'answer') {
        if (peerConnection && peerConnection.signalingState !== 'stable') await peerConnection.setRemoteDescription(new RTCSessionDescription(d.signal));
      } else if (d.signal.candidate) {
        if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(d.signal.candidate)).catch(() => {});
      }
    } catch (e) { console.error('webrtc-signal error', e); }
  });

  /* --- games --- */
  socket.on('game-invite', (d) => {
    if (confirm(`${d.from_username} ne aap ko Tic-Tac-Toe challenge kia! 🎮 Khelna hai?`)) {
      joinGame(d.game_id);
    }
  });
  socket.on('game-started', (d) => { toast(`🎮 Game started vs ${d.opponent}!`, 'success'); openGameModal(d.game_id); });
  socket.on('game-state', (d) => renderGame(d));

  /* --- polls --- */
  socket.on('poll-results', (d) => {
    if (pollTimer) { refreshPollCard(d); }
  });

  /* --- scheduled sent --- */
  socket.on('scheduled-sent', (d) => toast(`⏰ Scheduled message bhej diya gaya: "${d.message?.slice(0, 30)}…"`, 'info'));

  /* --- errors --- */
  socket.on('error-message', (d) => toast('⚠️ ' + (d.error || 'Error'), 'error'));
}

function notifyToast(m, isGroup = false) {
  const name = isGroup ? (m.sender?.username || 'Group') : (users.find(u => u.id === m.from_user)?.username || 'New message');
  const body = m.type === 'poll' ? '📊 Poll: ' + (m.message || '').replace('📊 POLL: ', '')
    : m.type === 'text' || m.type === 'scheduled' || m.type === 'auto-reply' ? (m.message || '')
    : previewOf(m);
  toast(`💬 ${name}: ${body.slice(0, 60)}`, 'info', 3000);
  playNotifySound();
  if (document.hidden && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') new Notification(`C$K4 Chat — ${name}`, { body: (body || '').slice(0, 80) });
      else if (Notification.permission !== 'denied') Notification.requestPermission();
    } catch {}
  }
}

/* ---------------- SOUND: NOTIFICATION BEEP + RINGTONE ---------------- */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
document.addEventListener('click', () => getAudioCtx(), { once: true });
document.addEventListener('touchstart', () => getAudioCtx(), { once: true, passive: true });

function beep(freq, duration, vol, delay) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0, t0 + duration / 1000);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration / 1000 + 0.05);
}

function playNotifySound() {
  beep(1000, 120, 0.18, 0);
  beep(1400, 120, 0.14, 0.13);
}

let ringtoneInterval = null;
function startRingtone() {
  if (ringtoneInterval) return;
  const ring = () => { beep(700, 350, 0.22, 0); beep(900, 350, 0.22, 0.4); };
  ring();
  ringtoneInterval = setInterval(ring, 1800);
}
function stopRingtone() {
  if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
}

let vibrateInterval = null;
function startVibration() {
  if (!navigator.vibrate || vibrateInterval) return;
  const pattern = [500, 300, 500, 900];
  navigator.vibrate(pattern);
  const cycleMs = pattern.reduce((a, b) => a + b, 0);
  vibrateInterval = setInterval(() => navigator.vibrate(pattern), cycleMs);
}
function stopVibration() {
  if (vibrateInterval) { clearInterval(vibrateInterval); vibrateInterval = null; }
  if (navigator.vibrate) navigator.vibrate(0);
}

function previewOf(m) {
  if (m.deleted_for_everyone) return '🚫 Message deleted';
  switch (m.type) {
    case 'image': return '🖼️ Photo';
    case 'video': return '🎬 Video';
    case 'voice': return '🎤 Voice message';
    case 'audio': return '🎵 Audio';
    case 'file': return '📄 ' + (m.media_name || 'File');
    case 'location': return '📍 Location';
    case 'poll': return (m.message || '').replace('📊 POLL: ', '📊 ');
    default: return m.message || '';
  }
}

/* ---------------- DATA LOADERS ---------------- */
async function loadUsers() {
  try {
    // Privacy: load only accepted contacts for the main chat list
    const data = await api('/api/requests');
    const accepted = data.accepted || [];
    pendingRequests.incoming = data.incoming || [];   // v5.3.1: pending incoming requests (Accept/Reject UI)
    pendingRequests.outgoing = data.outgoing || [];   // v5.3.1: outgoing pending requests
    users = accepted.map(r => ({
      id: r.other_user || (r.from_user === (ME && ME.id) ? r.to_user : r.from_user),
      username: r.username || 'User',
      profile_pic: r.profile_pic || '',
      online: false,
      is_admin: false,
      request_status: 'accepted'
    }));
    updateNotifBadge();
  } catch (e) { console.error('loadUsers', e.message); users = users || []; }
}

async function searchUsers(q) {
  if (!q || q.length < 2) return [];
  try {
    const data = await api('/api/users?search=' + encodeURIComponent(q));
    return data.users || [];
  } catch (e) {
    console.error('searchUsers', e.message);
    return [];
  }
}

async function loadGroups() {
  try {
    const data = await api('/api/groups');
    groups = data.groups || [];
  } catch (e) { console.error('loadGroups', e.message); }
}

async function loadChannels() {
  try {
    const data = await api('/api/channels');
    channels = data.channels || [];
  } catch (e) { console.error('loadChannels', e.message); }
}

async function loadStories() {
  try {
    const data = await api('/api/stories');
    stories = data.stories || [];
  } catch (e) { console.error('loadStories', e.message); }
}

async function loadNotifications() {
  try {
    const data = await api('/api/notifications');
    notifications = data.notifications || [];
    updateNotifBadge();
  } catch (e) { console.error('loadNotifications', e.message); }
}

function updateNotifBadge() {
  const unread = notifications.filter(n => !n.read).length;
  const b = $('notifBadge');
  if (!b) return;
  if (unread > 0) { b.classList.remove('hidden'); b.textContent = unread > 9 ? '9+' : unread; }
  else b.classList.add('hidden');
}

/* ---------------- CHAT LIST (tabs) ---------------- */
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.chat-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderChatList();
}

function renderChatList() {
  const list = $('chatList');
  if (!list) return;
  const q = ($('searchUsers')?.value || '').toLowerCase();
  let html = '';

  if (activeTab === 'chats') {
    if (q && q.length >= 2) {
      // Live search → show discovery results with request buttons
      html = `<div class="empty-state" style="padding:20px"><div class="small-note">🔍 Searching...</div></div>`;
      list.innerHTML = html;
      searchUsers(q).then(results => {
        let h = '';
        if (!results.length) h = `<div class="empty-state" style="padding:40px 20px"><div class="es-ico">👤</div><div class="small-note">Koi user nahi mila</div></div>`;
        results.forEach(u => {
          const status = u.request_status;
          let actionBtn = '';
          if (status === 'accepted') {
            actionBtn = `<button class="btn-sm" onclick="event.stopPropagation();openChatWith('${u.id}')">Chat</button>`;
          } else if (status === 'pending') {
            actionBtn = `<span class="small-note">Request pending</span>`;
          } else if (status === 'blocked') {
            actionBtn = `<span class="small-note">Blocked</span>`;
          } else {
            actionBtn = `<button class="btn-sm gold" onclick="event.stopPropagation();sendChatRequest('${u.id}')">Request</button>`;
          }
          h += `
          <div class="chat-item" onclick="${status === 'accepted' ? `openChatWith('${u.id}')` : ''}">
            <div class="chat-item-img">${avatarHtml(u)}${u.online ? '<span class="online-dot"></span>' : ''}</div>
            <div class="chat-item-info">
              <div class="chat-item-name"><span>${esc(u.username)} ${u.isAdmin ? '👑' : ''}</span></div>
              <div class="chat-item-last"><span class="preview">${esc((u.bio || '').slice(0, 35))}</span> ${actionBtn}</div>
            </div>
          </div>`;
        });
        if (list) list.innerHTML = h;
      });
      return;
    }

    // v5.3.1: INCOMING REQUESTS section — Accept/Reject buttons (pehle yeh UI thi hi nahi!)
    const incoming = (pendingRequests.incoming || []).filter(r => r.status === 'pending');
    if (incoming.length) {
      html += `
      <div style="padding:10px 16px 4px;display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;font-weight:700;color:var(--primary,#c9a227);letter-spacing:.4px;text-transform:uppercase;">📩 Chat Requests</span>
        <span class="unread-badge" style="position:static;background:var(--primary,#c9a227);color:#111;">${incoming.length}</span>
      </div>`;
      incoming.forEach(r => {
        const from = r.from_user;
        html += `
        <div class="chat-item" onclick="openChatWith('${from}')">
          <div class="chat-item-img">${avatarHtml({ id: from, username: r.username, profile_pic: r.profile_pic })}<span class="online-dot" style="background:#f59e0b"></span></div>
          <div class="chat-item-info">
            <div class="chat-item-name"><span>${esc(r.username || 'User')}</span></div>
            <div class="chat-item-last" style="gap:6px;">
              <span class="preview">Request bheji hai — accept karo to chat shuru 🤝</span>
              <button class="btn-sm gold" style="margin-left:auto;" onclick="event.stopPropagation();acceptRequest('${from}')">✓ Accept</button>
              <button class="btn-sm" style="background:rgba(255,90,90,.15);color:#ff6b6b;" onclick="event.stopPropagation();rejectRequest('${from}')">✕ Reject</button>
            </div>
          </div>
        </div>`;
      });
      // Outgoing pending requests (chhota note)
      const outgoing = (pendingRequests.outgoing || []).filter(r => r.status === 'pending');
      if (outgoing.length) {
        outgoing.forEach(r => {
          html += `
          <div class="chat-item" style="opacity:.65;">
            <div class="chat-item-img">${avatarHtml({ id: r.to_user, username: r.username, profile_pic: r.profile_pic })}</div>
            <div class="chat-item-info">
              <div class="chat-item-name"><span>${esc(r.username || 'User')}</span></div>
              <div class="chat-item-last"><span class="preview">⏳ Aapki request pending hai</span></div>
            </div>
          </div>`;
        });
      }
    }

    // Normal chats list = only accepted contacts
    const chatUsers = (users || []).filter(u => u.id !== (ME && ME.id));
    const filtered = chatUsers;
    filtered.sort((a, b) => (lastMsgPreview['u_' + b.id]?.ts || 0) - (lastMsgPreview['u_' + a.id]?.ts || 0));
    if (!filtered.length) html += `<div class="empty-state" style="padding:40px 20px"><div class="es-ico">👤</div><div class="small-note">Username search karke request bhejo. Accept hone ke baad yahan dikhenge.</div></div>`;
    filtered.forEach(u => {
      const key = 'u_' + u.id;
      const prev = lastMsgPreview[key];
      const unread = unreadByChat[key] || 0;
      html += `
      <div class="chat-item ${currentChatUser && currentChatUser.id === u.id ? 'active' : ''}" onclick="openChatWith('${u.id}')">
        <div class="chat-item-img">${avatarHtml(u)}${u.online ? '<span class="online-dot"></span>' : ''}</div>
        <div class="chat-item-info">
          <div class="chat-item-name"><span>${esc(u.username)} ${u.is_admin ? '👑' : ''}</span><span class="time">${prev ? timeStr(prev.ts) : ''}</span></div>
          <div class="chat-item-last">
            <span class="preview">${esc((prev?.text || u.bio || '').slice(0, 40))}</span>
            ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
          </div>
        </div>
      </div>`;
    });
  }

  if (activeTab === 'groups') {
    const filtered = q ? groups.filter(g => (g.name || '').toLowerCase().includes(q)) : groups;
    if (!filtered.length) html = `<div class="empty-state" style="padding:40px 20px"><div class="es-ico">👥</div><div class="small-note">Koi group nahi. Sirf Admin group bana sakta hai.</div></div>`;
    filtered.forEach(g => {
      const key = 'g_' + g.id;
      const prev = lastMsgPreview[key];
      const unread = unreadByChat[key] || 0;
      html += `
      <div class="chat-item ${currentGroup && currentGroup.id === g.id ? 'active' : ''}" onclick="openGroupChat('${g.id}')">
        <div class="chat-item-img">${avatarHtml(g)}<span class="online-dot" style="background:var(--secondary)"></span></div>
        <div class="chat-item-info">
          <div class="chat-group-name chat-item-name"><span>${esc(g.name)}</span><span class="time">${prev ? timeStr(prev.ts) : ''}</span></div>
          <div class="chat-item-last">
            <span class="preview">${esc((prev?.text || `${g.member_count || 0} members`).slice(0, 40))}</span>
            ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
          </div>
        </div>
      </div>`;
    });
  }

  if (activeTab === 'channels') {
    const filtered = q ? channels.filter(c => (c.name || '').toLowerCase().includes(q)) : channels;
    if (!filtered.length) html = `<div class="empty-state" style="padding:40px 20px"><div class="es-ico">📢</div><div class="small-note">Koi channel nahi. Official C$K4 channel auto-follow hota hai.</div></div>`;
    filtered.forEach(c => {
      html += `
      <div class="chat-item ${currentChannel && currentChannel.id === c.id ? 'active' : ''}" onclick="openChannelChat('${c.id}')">
        <div class="chat-item-img">📢</div>
        <div class="chat-item-info">
          <div class="chat-item-name"><span>${esc(c.name)}</span><span class="time">${timeStr(c.created_at)}</span></div>
          <div class="chat-item-last">
            <span class="preview">${esc((c.description || 'Channel').slice(0, 40))}</span>
            ${c.subscribed ? '<span class="badge" style="background:var(--secondary)">Subscribed</span>' : ''}
          </div>
        </div>
      </div>`;
    });
  }

  list.innerHTML = html;
}

/* ---------------- MESSAGE REQUEST HELPERS ---------------- */
async function sendChatRequest(userId) {
  try {
    const data = await api('/api/request', { method: 'POST', body: { to_user: userId } });
    toast(data.message || 'Request sent ✅');
    renderChatList();
  } catch (e) { toast(e.message || 'Request failed', 'error'); }
}

async function acceptRequest(fromUserId) {
  try {
    await api('/api/request/accept', { method: 'POST', body: { from_user: fromUserId } });
    toast('✅ Request accepted! Ab aap chat kar sakte ho');
    // Full refresh: requests, notifications, chat list — taaki chat turant dikhe
    await Promise.all([loadUsers(), loadNotifications()]).catch(() => {});
    renderChatList();
    if ($('notifModal') && $('notifModal').classList.contains('open')) renderNotifList();
  } catch (e) {
    toast(e.message || 'Accept failed', 'error');
    // Stale state ho sakta hai — refresh karo taaki duplicate buttons na dikhe
    await loadUsers().catch(() => {});
    renderChatList();
  }
}

async function rejectRequest(fromUserId) {
  try {
    await api('/api/request/reject', { method: 'POST', body: { from_user: fromUserId } });
    toast('Request rejected');
    await Promise.all([loadUsers(), loadNotifications()]).catch(() => {});
    renderChatList();
    if ($('notifModal') && $('notifModal').classList.contains('open')) renderNotifList();
  } catch (e) {
    toast(e.message || 'Reject failed', 'error');
    await loadUsers().catch(() => {});
    renderChatList();
  }
}

/* ---------------- OPEN CHATS ---------------- */
async function openChatWith(userId) {
  try {
    const data = await api('/api/user/' + userId);
    if (data.request_status && data.request_status !== 'accepted' && !(data.user && data.user.isAdmin)) {
      toast('Pehle request accept karni hogi', 'error');
      return;
    }
    currentChatUser = { ...data.user, online: data.online, blocked_by_me: data.blocked_by_me };
    currentGroup = null; currentChannel = null;
    $('appContainer').classList.add('chat-open');
    showChatUI('user');
    await loadMessages(userId);
    socket.emit('mark-seen', { from: userId });
    unreadByChat['u_' + userId] = 0;
    renderChatList();
    loadQuickReplies();
  } catch (e) { toast(e.message, 'error'); }
}

async function openGroupChat(groupId) {
  const g = groups.find(x => x.id === groupId);
  currentGroup = g || { id: groupId, name: 'Group' };
  currentChatUser = null; currentChannel = null;
  $('appContainer').classList.add('chat-open');
  showChatUI('group');
  socket.emit('join-group', { group_id: groupId });
  await loadGroupMessages(groupId);
  unreadByChat['g_' + groupId] = 0;
  renderChatList();
  const members = await api('/api/group/' + groupId + '/members').catch(() => null);
  if (members) currentGroup.members = members.members;
}

async function openChannelChat(channelId) {
  const c = channels.find(x => x.id === channelId);
  currentChannel = c || { id: channelId, name: 'Channel' };
  currentChatUser = null; currentGroup = null;
  $('appContainer').classList.add('chat-open');
  showChatUI('channel');
  socket.emit('join-channel', { channel_id: channelId });
  await loadChannelMessages(channelId);
}

function showChatUI(kind) {
  $('emptyState').classList.add('hidden');
  $('chatUI').classList.remove('hidden');
  $('chatUI').style.display = 'flex';
  const isChannel = kind === 'channel';
  const isGroup = kind === 'group';
  /* composer visibility — channels: only owner can post */
  const canPost = !isChannel || (currentChannel && currentChannel.owner_id === ME.id);
  const composer = $('chatUI')?.querySelector('.composer');
  if (composer) composer.style.display = canPost ? 'flex' : 'none';
  $('btnVoiceCall').style.display = (!isChannel && !isGroup) || isGroup ? '' : 'none';
  $('btnVideoCall').style.display = (!isChannel && !isGroup) || isGroup ? '' : 'none';
  $('blockBtn').style.display = (!isChannel && !isGroup) ? '' : 'none';
  refreshChatHeaderStatus();
  renderStoriesBar();
}

function refreshChatHeaderStatus() {
  if (currentChatUser) {
    $('chatName').textContent = currentChatUser.username + (currentChatUser.isAdmin ? ' 👑' : '');
    const on = currentChatUser.online;
    const lastSeen = currentChatUser.last_seen ? 'last seen ' + timeAgo(currentChatUser.last_seen) : '';
    $('chatStatus').innerHTML = on ? '<span style="color:var(--online)">● online</span>' : esc(lastSeen || 'offline');
  } else if (currentGroup) {
    $('chatName').textContent = currentGroup.name;
    $('chatStatus').textContent = (currentGroup.member_count || (currentGroup.members && currentGroup.members.length) || 0) + ' members';
  } else if (currentChannel) {
    $('chatName').textContent = currentChannel.name;
    $('chatStatus').textContent = (currentChannel.subscribers || 0) + ' subscribers 📢';
  }
  const av = $('chatAvatar');
  if (currentChatUser) av.innerHTML = avatarHtml(currentChatUser);
  else if (currentGroup) av.innerHTML = avatarHtml(currentGroup);
  else if (currentChannel) av.innerHTML = '📢';
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' h ago';
  return Math.floor(diff / 86400000) + ' d ago';
}

function closeChat() {
  $('appContainer').classList.remove('chat-open');
  currentChatUser = null; currentGroup = null; currentChannel = null;
  $('chatUI').classList.add('hidden');
  $('emptyState').classList.remove('hidden');
}

/* ---------------- MESSAGES: LOAD ---------------- */
async function loadMessages(userId) {
  try {
    const data = await api(`/api/messages/${userId}?limit=100`);
    messages = data.messages || [];
    renderMessages();
    updatePinnedBar();
    const prev = messages.length ? { text: previewOf(messages[messages.length - 1]), ts: messages[messages.length - 1].timestamp } : null;
    if (prev) lastMsgPreview['u_' + userId] = prev;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadGroupMessages(groupId) {
  try {
    const data = await api(`/api/group/messages/${groupId}?limit=100`);
    groupMessages = data.messages || [];
    renderGroupMessages();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadChannelMessages(channelId) {
  try {
    const data = await api(`/api/channel/messages/${channelId}`);
    channelMsgs = data.messages || [];
    renderChannelMessages();
  } catch (e) {
    if (String(e.message).includes('Subscribe')) { toast('Pehle subscribe karo! 📢', 'info'); }
    else toast(e.message, 'error');
  }
}

/* ---------------- MESSAGES: RENDER ---------------- */
function renderMessages() {
  const box = $('messagesContainer');
  if (!box) return;
  if (!currentChatUser) return;
  let html = '';
  let lastDate = '';
  const list = [...messages].sort((a, b) => (a.is_pinned === b.is_pinned) ? (a.timestamp - b.timestamp) : b.is_pinned - a.is_pinned);
  list.forEach(m => {
    const d = dateStr(m.timestamp);
    if (d !== lastDate) { html += `<div class="date-divider"><span>${esc(d)}</span></div>`; lastDate = d; }
    html += renderMessageBubble(m, m.from_user === ME.id ? 'out' : 'in', false);
  });
  box.innerHTML = html;
  scrollMsgsBottom(false);
}

function renderGroupMessages() {
  const box = $('messagesContainer');
  if (!box || !currentGroup) return;
  let html = '';
  let lastDate = '';
  groupMessages.forEach(m => {
    const d = dateStr(m.timestamp);
    if (d !== lastDate) { html += `<div class="date-divider"><span>${esc(d)}</span></div>`; lastDate = d; }
    html += renderMessageBubble(m, m.sender_id === ME.id ? 'out' : 'in', true);
  });
  box.innerHTML = html;
  scrollMsgsBottom(false);
}

let channelMsgs = [];
function renderChannelMessages() {
  const box = $('messagesContainer');
  if (!box || !currentChannel) return;
  let html = '';
  channelMsgs.forEach(m => {
    html += renderMessageBubble(m, m.sender_id === ME.id ? 'out' : 'in', false, true);
  });
  box.innerHTML = html;
  scrollMsgsBottom(false);
}

function renderMessageBubble(m, side, isGroup, isChannel = false) {
  if (m.deleted_for_everyone) {
    return `<div class="message ${side} deleted">🚫 ${m.from_user === ME.id || m.sender_id === ME.id ? 'You deleted this message' : 'This message was deleted'}</div>`;
  }
  const mine = side === 'out';
  const senderName = isGroup && !mine ? (m.sender_name || m.sender?.username || 'Unknown') : '';
  let inner = '';

  /* forwarded tag */
  if (m.forwarded) inner += `<div class="forwarded-tag">➡️ Forwarded</div>`;

  /* reply quote */
  if (m.reply_to) {
    const rq = messages.find(x => x.id === m.reply_to) || groupMessages.find(x => x.id === m.reply_to);
    if (rq) inner += `<div class="reply-quote" onclick="scrollToMsg('${rq.id}')"><span class="rq-name">${esc(rq.from_user === ME.id ? 'You' : (rq.sender_name || rq.username || 'Them'))}</span><div class="rq-text">${esc(previewOf(rq))}</div></div>`;
    else inner += `<div class="reply-quote"><span class="rq-name">Original message</span></div>`;
  }

  /* body by type */
  switch (m.type) {
    case 'image':
      inner += `<img class="msg-media" src="${esc(m.media_url)}" onclick="viewMedia('${esc(m.media_url)}','image')" loading="lazy">`;
      if (m.message && m.message !== '🖼️') inner += `<div class="msg-text">${esc(m.message)}</div>`;
      break;
    case 'video':
      inner += `<video class="msg-media" src="${esc(m.media_url)}" controls preload="metadata"></video>`;
      break;
    case 'voice':
      inner += renderVoiceBubble(m);
      break;
    case 'audio':
      inner += `<div class="voice-msg"><button class="voice-play" onclick="playVoice('${esc(m.media_url)}',this)">▶</button><div class="voice-wave">${'<i></i>'.repeat(24)}</div><span class="voice-dur">${fmtDur(m.duration || 0)}</span><audio src="${esc(m.media_url)}" preload="metadata"></audio></div>`;
      break;
    case 'file':
      inner += `<a class="file-attach" href="${esc(m.media_url)}" download="${esc(m.media_name || 'file')}"><span class="file-ico">📄</span><span><div>${esc(m.media_name || 'File')}</div><div class="file-meta">${fmtSize(m.media_size || 0)} — Click to download</div></span></a>`;
      break;
    case 'location':
      inner += renderLocationBubble(m);
      break;
    case 'poll':
      inner += renderPollCard(m);
      break;
    case 'auto-reply':
      inner += `<div class="msg-text">🤖 <em>${esc(m.message)}</em></div>`;
      break;
    default:
      inner += `<div class="msg-text">${linkify(esc(m.message || ''))}</div>`;
  }

  /* view once wrapper for text/media sent as view_once */
  if (m.view_once) {
    if (m.viewed && !mine) {
      inner = `<div class="view-once-opened">1️⃣ View-once message — opened, content removed</div>`;
    } else if (!mine) {
      inner = `<div class="view-once-wrap" onclick="openViewOnce('${m.id}')"><span class="vo-ico">${m.type === 'text' ? '💬' : '🖼️'}</span><span>View-once message — tap to open 👆</span></div>`;
    } else {
      inner = `<div class="view-once-wrap" style="cursor:default"><span class="vo-ico">${m.type === 'text' ? '💬' : '🖼️'}</span><span>1️⃣ View-once message</span></div>`;
    }
  }

  /* reactions */
  let reactionsHtml = '';
  if (m.reactions && Object.keys(m.reactions).length) {
    reactionsHtml = `<div class="reaction-row">${Object.entries(m.reactions).map(([e, by]) => {
      const people = Array.isArray(by) ? by : [by];
      return `<span class="reaction-chip" title="${people.length} reaction(s)">${e} ${people.includes(ME.id) ? '(you)' : ''}${people.length > 1 ? ` ${people.length}` : ''}</span>`;
    }).join('')}</div>`;
  }

  const ticks = mine ? tickHtml(m) : '';
  const actions = mine || true ? msgActionsHtml(m, mine, isChannel) : '';

  return `
  <div class="message ${side} ${m.is_pinned ? 'pinned-msg' : ''}" id="msg-${m.id}">
    ${senderName ? `<span class="sender-name">${esc(senderName)}</span>` : ''}
    ${actions}
    ${inner}
    ${reactionsHtml}
    <div class="msg-meta">
      ${m.edited ? '<span class="edited-tag">edited</span>' : ''}
      <span>${timeStr(m.timestamp)}</span>
      ${ticks}
    </div>
  </div>`;
}

function tickHtml(m) {
  if (m.offline) return '<span class="ticks"><span class="one">✓</span></span>';
  if (m.seen) return '<span class="ticks seen">✓✓✓</span>';
  if (m.delivered) return '<span class="ticks seen">✓✓</span>';
  return '<span class="ticks"><span class="one">✓</span></span>';
}

function msgActionsHtml(m, mine, isChannel) {
  if (isChannel) return '';
  const mid = m.id;
  const base = `event.stopPropagation();`;
  return `<div class="msg-actions">
    <button title="Reply" onclick="${base}setReply('${mid}')">↩️</button>
    ${mine ? `<button title="Edit" onclick="${base}editMessage('${mid}')">✏️</button>` : ''}
    <button title="Forward" onclick="${base}openForward('${mid}')">➡️</button>
    <button title="Pin" onclick="${base}pinMessage('${mid}')">📌</button>
    <button title="React ❤️" onclick="${base}reactMessage('${mid}','❤️')">❤️</button>
    <button title="More" onclick="${base}msgMore('${mid}',${mine})">⋯</button>
  </div>`;
}

function msgMore(mid, mine) {
  const opts = ['📋 Copy', 'ℹ️ Info', '⏰ Schedule', '🚫 Report'];
  const choices = mine ? ['📋 Copy', '🗑️ Delete for me', '💣 Delete for everyone', 'ℹ️ Info'] : ['📋 Copy', 'ℹ️ Info', '⏰ Schedule', '🚫 Report'];
  const pick = prompt(`Choose action for message:\n${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n(number likho)`);
  const idx = parseInt(pick, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= choices.length) return;
  const label = choices[idx];
  if (label.includes('Copy')) copyMessage(mid);
  else if (label.includes('Delete for me')) deleteMessage(mid, false);
  else if (label.includes('Delete for everyone')) deleteMessage(mid, true);
  else if (label.includes('Info')) messageInfo(mid);
  else if (label.includes('Report')) reportMessage(mid);
}

function copyMessage(mid) {
  const m = findMsg(mid);
  if (m && m.message) { navigator.clipboard?.writeText(m.message).then(() => toast('📋 Copied!', 'success')).catch(() => {}); }
}

function messageInfo(mid) {
  const m = findMsg(mid);
  if (!m) return;
  alert(`ℹ️ Message Info\n\nID: ${m.id}\nType: ${m.type}\nStatus: ${m.seen ? '✓✓✓ Seen' : m.delivered ? '✓✓ Delivered' : '✓ Sent'}\nTime: ${new Date(m.timestamp).toLocaleString()}\nDelivered: ${m.delivered ? 'Yes' : 'No'}\nSeen: ${m.seen ? 'Yes' : 'No'}\nEdited: ${m.edited ? 'Yes' : 'No'}\nPinned: ${m.is_pinned ? 'Yes' : 'No'}\nView-once: ${m.view_once ? 'Yes' : 'No'}\nEncrypted: 🔒 AES-256`);
}

function findMsg(mid) { return messages.find(x => x.id === mid) || groupMessages.find(x => x.id === mid) || channelMsgs.find(x => x.id === mid); }

function fmtDur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function fmtSize(b) {
  if (b > 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b > 1024) return (b / 1044).toFixed(1) + ' KB';
  return b + ' B';
}
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function scrollMsgsBottom(smooth = true) {
  const box = $('messagesContainer');
  if (box) box.scrollTop = box.scrollHeight;
  setTimeout(() => { if (box) box.scrollTop = box.scrollHeight; }, 60);
}

function upsertMessage(m) {
  const idx = messages.findIndex(x => x.id === m.id);
  if (idx > -1) messages[idx] = { ...messages[idx], ...m };
  else messages.push(m);
}

/* ============================================================
   COMPOSER — SEND / TYPING / EMOJI / ATTACH / VOICE
   ============================================================ */
function setupComposer() {
  const input = $('messageInput');
  if (!input) return;
  if (input.dataset.bound) return;
  input.dataset.bound = '1';

  input.addEventListener('input', () => {
    /* quick reply expansion */
    const v = input.value;
    const qrMatch = v.match(/^\/(\w+)$/);
    if (qrMatch && quickRepliesCache.length) {
      const qr = quickRepliesCache.find(q => q.shortcut.toLowerCase() === qrMatch[1].toLowerCase());
      if (qr) { input.value = qr.message; toast(`⚡ Quick reply "/${qr.shortcut}" expand ho gaya`, 'success', 1800); }
    }
    sendTyping(true);
    updateSendButton();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  /* click outside closes pickers */
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-picker') && !e.target.closest('[onclick*="toggleEmojiPicker"]')) $('emojiPicker')?.classList.remove('open');
    if (!e.target.closest('.attach-menu') && !e.target.closest('[onclick*="toggleAttachMenu"]') && !e.target.closest('[onclick*="toggleChatMenu"]')) { $('attachMenu')?.classList.remove('open'); $('chatMenu')?.classList.remove('open'); }
  });
  /* file inputs */
  $('fileInput')?.addEventListener('change', onFilesPicked);
  $('cameraInput')?.addEventListener('change', onCameraPicked);
  /* wallpaper upload */
  $('wpUpload')?.addEventListener('change', onWallpaperPicked);
  updateSendButton();
}

let quickRepliesCache = [];

async function loadQuickReplies() {
  try {
    const data = await api('/api/quick-reply');
    quickRepliesCache = data.quickReplies || [];
    const row = $('quickRepliesRow');
    if (!row) return;
    if (!quickRepliesCache.length) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    row.innerHTML = quickRepliesCache.slice(0, 8).map(q =>
      `<button class="qr-chip" onclick="useQuickReply('${esc(q.message)}')" title="/${esc(q.shortcut)}">⚡ ${esc(q.shortcut)}</button>`).join('');
  } catch { }
}

function useQuickReply(msg) { $('messageInput').value = msg; $('messageInput').focus(); sendMessage(); }

/* ---- TYPING ---- */
let typingSentAt = 0;
function sendTyping(isTyping) {
  if (!socket) return;
  const now = Date.now();
  if (isTyping && now - typingSentAt < 1200) return; // throttle
  typingSentAt = now;
  if (currentChatUser) socket.emit('typing', { to: currentChatUser.id, typing: isTyping, chatType: 'direct' });
  if (currentGroup) socket.emit('typing', { to: currentGroup.id, typing: isTyping, chatType: 'group' });
  if (isTyping) {
    clearTimeout(typingTimers.stop);
    typingTimers.stop = setTimeout(() => sendTyping(false), 2200);
  }
}

/* ---- SEND ---- */
function onSendBtn() {
  if (mediaRecorder && mediaRecorder.state === 'recording') { stopVoiceRecording(true); return; }
  const text = $('messageInput')?.value.trim();
  if (text) sendMessage();
  else startVoiceRecording();
}

function updateSendButton() {
  const btn = $('sendBtn');
  const input = $('messageInput');
  if (!btn || mediaRecorder?.state === 'recording') return;
  const hasText = !!input?.value.trim();
  btn.textContent = hasText ? '➤' : '🎤';
  btn.title = hasText ? 'Send message' : 'Record voice message';
  btn.setAttribute('aria-label', hasText ? 'Send message' : 'Record voice message');
}

async function sendMessage() {
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) { toast('Kuch likho pehle! 😄', 'info', 1500); return; }
  input.value = '';
  updateSendButton();
  sendTyping(false);
  const payload = {
    to: currentChatUser ? currentChatUser.id : null,
    group_id: currentGroup ? currentGroup.id : null,
    message: text,
    reply_to: replyTo ? replyTo.id : null,
    view_once: viewOnceMode
  };
  if (viewOnceMode) {
    viewOnceMode = false;
    $('voBtn').style.opacity = '1';
    $('voBtn').classList.remove('active');
  }
  cancelReply();
  if (payload.to) {
    socket.emit('send-message', payload);
  } else if (payload.group_id) {
    socket.emit('send-group-message', { group_id: payload.group_id, message: text, reply_to: payload.reply_to, view_once: payload.view_once });
  } else if (currentChannel) {
    socket.emit('send-channel-message', { channel_id: currentChannel.id, message: text });
  }
}

/* ---- EMOJI PICKER ---- */
function initEmojiPicker() {
  const picker = $('emojiPicker');
  if (!picker || picker.dataset.built) return;
  picker.dataset.built = '1';
  let html = `<div class="emoji-cats">`;
  Object.keys(EMOJIS).forEach((cat, i) => {
    html += `<button onclick="switchEmojiCat('${cat}')" title="${EMOJI_NAMES[cat]}">${cat === '😀' ? '😀' : EMOJIS[cat][0]}</button>`;
  });
  html += `</div><div class="emoji-grid" id="emojiGrid"></div>`;
  picker.innerHTML = html;
  switchEmojiCat('😀');
}

function switchEmojiCat(cat) {
  const grid = $('emojiGrid');
  if (!grid) return;
  grid.innerHTML = EMOJIS[cat].map(e => `<button onclick="insertEmoji('${e}')">${e}</button>`).join('');
}

function insertEmoji(e) {
  const input = $('messageInput');
  if (!input) return;
  input.value += e;
  input.focus();
}

function toggleEmojiPicker() {
  const p = $('emojiPicker');
  if (p) { p.classList.toggle('open'); $('attachMenu')?.classList.remove('open'); }
}

function toggleAttachMenu() {
  const m = $('attachMenu');
  if (m) { m.classList.toggle('open'); $('emojiPicker')?.classList.remove('open'); }
}

function toggleChatMenu() {
  const m = $('chatMenu');
  if (m) { m.classList.toggle('open'); $('attachMenu')?.classList.remove('open'); }
}

/* ---- VIEW ONCE TOGGLE ---- */
function toggleViewOnce() {
  viewOnceMode = !viewOnceMode;
  $('voBtn').style.opacity = '1';
  $('voBtn').classList.toggle('active', viewOnceMode);
  $('voBtn').setAttribute('aria-pressed', String(viewOnceMode));
  toast(viewOnceMode ? '1️⃣ View-once ON — agli message ek baar dikhegi' : 'View-once OFF', 'info', 1800);
}

async function openViewOnce(mid) {
  try {
    const data = await api('/api/view-once', { method: 'POST', body: { id: mid } });
    const m = messages.find(x => x.id === mid);
    if (m) { m.viewed = 1; m.message = data.message; m.media_url = data.media_url; m.type = data.type; renderMessages(); }
    const gm = groupMessages.find(x => x.id === mid);
    if (gm) { gm.viewed = 1; gm.message = data.message; gm.media_url = data.media_url; gm.type = data.type; renderGroupMessages(); }
    toast('👁️ Message khul gaya — dobara nahi dikhega!', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---- ATTACH FILES ---- */
function pickFile(kind) {
  $('attachMenu')?.classList.remove('open');
  const fi = $('fileInput');
  const ci = $('cameraInput');
  if (kind === 'camera') { ci.click(); return; }
  if (!fi) return;
  fi.dataset.kind = kind;
  fi.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : kind === 'audio' ? 'audio/*' : '*/*';
  fi.click();
}

async function onFilesPicked(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  await uploadAndSend(files, e.target.dataset.kind || 'file');
}

async function onCameraPicked(e) {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  await uploadAndSend(files, 'image');
}

async function uploadAndSend(files, kind) {
  if (!currentChatUser && !currentGroup) { toast('Pehle koi chat kholo!', 'error'); return; }
  toast(`⏳ ${files.length} file(s) upload ho rahi hain…`, 'info', 2000);
  const fd = new FormData();
  files.forEach(f => fd.append('files', f));
  try {
    const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    if (!Array.isArray(data.files) || !data.files.length) throw new Error('Server ne uploaded file return nahi ki');
    for (const f of data.files) {
      let type = 'file';
      if (f.mimetype?.startsWith('image/')) type = 'image';
      else if (f.mimetype?.startsWith('video/')) type = 'video';
      else if (f.mimetype?.startsWith('audio/')) type = 'audio';
      if (currentChatUser) {
        socket.emit('send-message', { to: currentChatUser.id, message: '', type, media_url: f.url, media_name: f.name, media_size: f.size, reply_to: replyTo?.id || null, view_once: viewOnceMode && type !== 'file' });
      } else if (currentGroup) {
        socket.emit('send-group-message', {
          group_id: currentGroup.id, message: '', type, media_url: f.url,
          media_name: f.name, media_size: f.size, reply_to: replyTo?.id || null,
          view_once: viewOnceMode && type !== 'file'
        });
      }
    }
    if (viewOnceMode) {
      viewOnceMode = false;
      $('voBtn')?.classList.remove('active');
      $('voBtn').style.opacity = '1';
    }
    cancelReply();
    toast('✅ Files bhej di gayi!', 'success');
  } catch (err) { toast('Upload error: ' + err.message, 'error', 4000); }
}

/* ---- VOICE RECORDING ---- */
async function startVoiceRecording() {
  try {
    if (!currentChatUser && !currentGroup) { toast('Pehle koi chat kholo!', 'error'); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error('Is browser me voice recording supported nahi — Chrome/Firefox ka latest version use karo');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const mimeType = mimeCandidates.find(type => MediaRecorder.isTypeSupported?.(type)) || '';
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorder = recorder;
    audioChunks = [];
    recStartTime = Date.now();
    recorder.ondataavailable = (e) => { if (e.data.size) audioChunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const dur = Math.max(1, Math.round((Date.now() - recStartTime) / 1000));
      const blobType = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(audioChunks, { type: blobType });
      if (blob.size < 800) { toast('Recording bahut choti thi', 'info'); return; }
      const fd = new FormData();
      const extension = blobType.includes('mp4') ? 'm4a' : blobType.includes('ogg') ? 'ogg' : 'webm';
      fd.append('files', blob, `voice-${Date.now()}.${extension}`);
      try {
        const res = await fetch('/api/upload', { method: 'POST', headers: { 'Authorization': 'Bearer ' + TOKEN }, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        const f = data.files[0];
        if (currentChatUser) socket.emit('send-message', { to: currentChatUser.id, message: '', type: 'voice', media_url: f.url, duration: dur, reply_to: replyTo?.id || null });
        else if (currentGroup) socket.emit('send-group-message', {
          group_id: currentGroup.id, message: '', type: 'voice', media_url: f.url,
          duration: dur, view_once: viewOnceMode
        });
        if (viewOnceMode) {
          viewOnceMode = false;
          $('voBtn')?.classList.remove('active');
          $('voBtn').style.opacity = '1';
          $('voBtn').setAttribute('aria-pressed', 'false');
        }
        cancelReply();
        toast(`🎤 Voice message bheja (${fmtDur(dur)})`, 'success');
      } catch (err) { toast('Voice upload failed: ' + err.message, 'error'); }
    };
    recorder.start(250);
    $('sendBtn').classList.add('recording');
    $('sendBtn').textContent = '⏹';
    $('sendBtn').title = 'Stop and send voice message';
    $('sendBtn').setAttribute('aria-label', 'Stop and send voice message');
    $('recTimer').style.display = 'inline';
    let sec = 0;
    recTimerInterval = setInterval(() => {
      sec++;
      $('recTimer').textContent = fmtDur(sec);
      if (sec >= 300) stopVoiceRecording(true); // max 5 min
    }, 1000);
    toast('🔴 Recording… Send button dabao stop karne ke liye', 'info', 2500);
  } catch (e) {
    toast('🎙️ Mic access nahi mila: ' + e.message, 'error', 4000);
  }
}

function stopVoiceRecording(send = true) {
  if (recTimerInterval) { clearInterval(recTimerInterval); recTimerInterval = null; }
  $('recTimer').style.display = 'none';
  $('recTimer').textContent = '0:00';
  $('sendBtn').classList.remove('recording');
  $('sendBtn').textContent = '🎤';
  $('sendBtn').title = 'Record voice message';
  $('sendBtn').setAttribute('aria-label', 'Record voice message');
  const recorder = mediaRecorder;
  mediaRecorder = null;
  if (recorder && recorder.state !== 'inactive') {
    if (send) recorder.stop();
    else { recorder.onstop = null; recorder.stop(); }
  }
  updateSendButton();
}

function renderVoiceBubble(m) {
  return `<div class="voice-msg">
    <button class="voice-play" onclick="playVoice('${esc(m.media_url)}',this)">▶</button>
    <div class="voice-wave">${'<i></i>'.repeat(24)}</div>
    <span class="voice-dur">${fmtDur(m.duration || 0)}</span>
    <button class="vt-btn" title="Voice to text 🤖" onclick="voiceToText('${esc(m.media_url)}')">🤖</button>
    <audio src="${esc(m.media_url)}" preload="metadata"></audio>
  </div>`;
}

function playVoice(url, btn) {
  document.querySelectorAll('audio').forEach(a => { if (!a.paused) { a.pause(); } });
  document.querySelectorAll('.voice-play').forEach(b => { if (b !== btn) b.textContent = '▶'; });
  let audio = btn.parentElement.querySelector('audio') || new Audio(url);
  if (audio.paused) {
    audio.play().then(() => { btn.textContent = '⏸'; }).catch(() => toast('Audio play nahi ho saki — dobara tap karo', 'error'));
    audio.onended = () => btn.textContent = '▶';
  }
  else { audio.pause(); btn.textContent = '▶'; }
}

async function voiceToText(url) {
  toast('🤖 Voice-to-text: browser SpeechRecognition try kar raha hoon…', 'info', 2000);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('⚠️ Is browser me SpeechRecognition support nahi — Chrome use karo', 'error', 3500); return; }
  try {
    const rec = new SR();
    rec.lang = 'ur-PK';
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript;
      toast('🗣️ ' + txt, 'info', 5000);
    };
    rec.onerror = () => toast('Speech recognition error', 'error');
    rec.start();
  } catch (e) { toast('VT error: ' + e.message, 'error'); }
}

/* ---- LOCATION ---- */
async function shareLocation(live) {
  $('attachMenu')?.classList.remove('open');
  if (!navigator.geolocation) { toast('Geolocation support nahi', 'error'); return; }
  if (!currentChatUser && !currentGroup) { toast('Pehle chat kholo', 'error'); return; }
  toast('📍 Location le rahe hain…', 'info', 1800);
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lng } = pos.coords;
    if (currentChatUser) socket.emit('share-location', { to: currentChatUser.id, lat, lng, live, duration_min: 15 });
    else if (currentGroup) {
      /* group: send as location message via REST then socket */
      const r = await api('/api/location', { method: 'POST', body: { lat, lng } }).catch(() => null);
      socket.emit('send-group-message', { group_id: currentGroup.id, message: `📍 ${r?.place || lat.toFixed(4) + ', ' + lng.toFixed(4)}`, type: 'text' });
    }
    toast(live ? '📡 Live location 15 min ke liye share ho gayi' : '📍 Location share ho gayi', 'success');
  }, (err) => toast('Location error: ' + err.message, 'error'), { enableHighAccuracy: true, timeout: 10000 });
}

function renderLocationBubble(m) {
  const lat = m.location_lat, lng = m.location_lng;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  return `<div class="location-card">
    <a class="loc-link" href="${mapUrl}" target="_blank" rel="noopener">📍 ${esc(m.message || 'Open location')}</a>
    <a href="${mapUrl}" target="_blank" rel="noopener"><img class="location-map" style="width:230px;height:120px;object-fit:cover" src="https://staticmap.openstreetmap.org/staticmap?center=${lat},${lng}&zoom=15&size=230x120&markers=${lat},${lng},red" onerror="this.outerHTML='<div class=\\'location-map\\'>🗺️ Map load nahi hua — link kholo</div>'"></a>
    ${m.location_live ? '<span class="small-note">📡 Live location (15 min)</span>' : ''}
  </div>`;
}

/* ---- MSG ACTIONS: reply/edit/delete/pin/forward/react/report ---- */
function setReply(mid) {
  const m = findMsg(mid);
  if (!m) return;
  replyTo = m;
  $('replyPreview').style.display = 'flex';
  $('rpName').textContent = (m.from_user === ME.id || m.sender_id === ME.id) ? 'You' : (m.sender_name || currentChatUser?.username || 'Them');
  $('rpText').textContent = previewOf(m);
  $('messageInput')?.focus();
}

function cancelReply() {
  replyTo = null;
  const rp = $('replyPreview');
  if (rp) rp.style.display = 'none';
}

async function editMessage(mid) {
  const m = findMsg(mid);
  if (!m) return;
  const newText = prompt('✏️ Edit message (15 min window):', m.message || '');
  if (newText === null) return;
  if (!newText.trim()) { toast('Khali message nahi ho sakta', 'error'); return; }
  try {
    await api('/api/edit-message', { method: 'POST', body: { id: mid, message: newText } });
    m.message = newText; m.edited = 1;
    renderMessages();
    toast('✏️ Message edited', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteMessage(mid, forEveryone) {
  if (forEveryone && !confirm('💣 Sab ke liye delete karein? Ye wapas nahi aayega!')) return;
  try {
    if (forEveryone) {
      await api('/api/delete-for-everyone', { method: 'POST', body: { id: mid } });
    } else {
      await api('/api/delete-for-me', { method: 'POST', body: { id: mid } });
    }
    const idx = messages.findIndex(x => x.id === mid);
    if (idx > -1) {
      if (forEveryone) { messages[idx].deleted_for_everyone = 1; messages[idx].message = ''; messages[idx].media_url = null; }
      else messages.splice(idx, 1);
    }
    renderMessages();
    toast(forEveryone ? '💣 Sab ke liye delete ho gaya' : '🗑️ Aap ke liye delete ho gaya', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function pinMessage(mid) {
  try {
    const data = await api('/api/pin', { method: 'POST', body: { id: mid } });
    const m = findMsg(mid);
    if (m) m.is_pinned = data.is_pinned ? 1 : 0;
    renderMessages();
    updatePinnedBar();
    toast(data.message, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function unpinMessage() {
  const pinned = messages.find(m => m.is_pinned) || groupMessages.find(m => m.is_pinned);
  if (pinned) pinMessage(pinned.id);
}

function updatePinnedBar() {
  const bar = $('pinnedBar');
  if (!bar) return;
  const pinned = messages.find(m => m.is_pinned) || groupMessages.find(m => m.is_pinned);
  if (pinned) {
    bar.classList.remove('hidden');
    $('pinnedText').textContent = previewOf(pinned).slice(0, 80);
    bar.dataset.mid = pinned.id;
  } else bar.classList.add('hidden');
}

function scrollToPinned() {
  const bar = $('pinnedBar');
  if (bar?.dataset.mid) scrollToMsg(bar.dataset.mid);
}

function scrollToMsg(mid) {
  const el = document.getElementById('msg-' + mid);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--accent)'; setTimeout(() => el.style.outline = '', 1600); }
}

function reactMessage(mid, emoji) {
  socket.emit('react-message', { id: mid, emoji });
  const m = findMsg(mid);
  toast(`${emoji} Reaction bheja`, 'success', 1500);
}

async function reportMessage(mid) {
  const reason = prompt('🚫 Report reason likho (spam/abuse/harassment):');
  if (!reason) return;
  const m = findMsg(mid);
  try {
    await api('/api/report', { method: 'POST', body: { message_id: mid, reported_user: m ? (m.from_user || m.sender_id) : null, reason } });
    toast('🚫 Report bhej di gayi — admin review karega', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---- FORWARD ---- */
let forwardPicks = new Set();
function openForward(mid) {
  forwardMsgId = mid;
  forwardPicks = new Set();
  const list = $('forwardList');
  let html = '';
  users.filter(u => u.id !== ME.id).forEach(u => {
    html += `<div class="user-pick" onclick="toggleForwardPick('${u.id}',this)">
      <div class="up-av">${avatarHtml(u)}</div>
      <div style="flex:1"><div class="up-name">${esc(u.username)}</div><div class="up-sub">${esc(u.email)}</div></div>
    </div>`;
  });
  groups.forEach(g => {
    html += `<div class="user-pick" data-gid="${g.id}" onclick="toggleForwardPick('${g.id}',this,true)">
      <div class="up-av">👥</div>
      <div style="flex:1"><div class="up-name">${esc(g.name)}</div><div class="up-sub">Group</div></div>
    </div>`;
  });
  list.innerHTML = html;
  openModal('forwardModal');
}

function toggleForwardPick(id, el, isGroup = false) {
  const key = (isGroup ? 'g:' : 'u:') + id;
  if (forwardPicks.has(key)) { forwardPicks.delete(key); el.classList.remove('selected'); }
  else { forwardPicks.add(key); el.classList.add('selected'); }
}

async function forwardSelected() {
  if (!forwardMsgId || !forwardPicks.size) { toast('Koi target select karo!', 'error'); return; }
  const userTargets = [...forwardPicks].filter(k => k.startsWith('u:')).map(k => k.slice(2));
  const groupTargets = [...forwardPicks].filter(k => k.startsWith('g:')).map(k => k.slice(2));
  try {
    if (userTargets.length) await api('/api/forward', { method: 'POST', body: { message_id: forwardMsgId, to: userTargets } });
    for (const gid of groupTargets) {
      const m = findMsg(forwardMsgId);
      if (m) socket.emit('send-group-message', { group_id: gid, message: m.message || '', type: m.type || 'text', media_url: m.media_url || '', forwarded: true });
    }
    closeModal('forwardModal');
    toast(`➡️ ${forwardPicks.size} chat(s) me forward ho gaya`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---- TICKS UI ---- */
function updateTicks(mid, status) {
  const m = messages.find(x => x.id === mid);
  if (!m) return;
  if (status === 'delivered') m.delivered = 1;
  const el = document.querySelector(`#msg-${mid} .ticks`);
  if (el) el.outerHTML = tickHtml(m);
}

function updateSeenUI(fromId) {
  messages.forEach(m => { if (m.from_user === ME.id) { m.delivered = 1; m.seen = 1; } });
  document.querySelectorAll('.msg-meta .ticks').forEach(el => el.classList.add('seen'));
}

/* ---- MEDIA VIEWER ---- */
function viewMedia(url, kind) {
  if (kind === 'image') {
    const w = window.open('', '_blank');
    if (w) w.document.write(`<title>C$K4 Media</title><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${url}" style="max-width:100%;max-height:100%">`);
  } else window.open(url, '_blank');
}

/* ---- CLEAR CHAT ---- */
async function clearCurrentChat() {
  if (!currentChatUser) { toast('Sirf personal chats clear ho sakti hain', 'info'); return; }
  if (!confirm('🧹 Is chat ke saare messages delete karein (dono taraf)?')) return;
  try {
    const all = await api(`/api/messages/${currentChatUser.id}?limit=100`);
    for (const m of (all.messages || [])) {
      await api('/api/delete-for-me', { method: 'POST', body: { id: m.id } }).catch(() => {});
    }
    messages = [];
    renderMessages();
    toast('🧹 Chat clear ho gayi', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---- BLOCK ---- */
async function blockCurrentUser() {
  if (!currentChatUser) return;
  if (!confirm(`🚫 ${currentChatUser.username} ko block karein?`)) return;
  try {
    await api('/api/block', { method: 'POST', body: { userId: currentChatUser.id } });
    toast('🚫 User blocked', 'success');
    closeChat();
    loadUsers();
  } catch (e) { toast(e.message, 'error'); }
}

async function unblockUser(userId) {
  try {
    await api('/api/unblock', { method: 'POST', body: { userId } });
    toast('✅ User unblocked', 'success');
    openChatInfo();
  } catch (e) { toast(e.message, 'error'); }
}

/* ============================================================
   PART 3 — MODALS, STORIES, CALLS, GROUPS, CHANNELS, POLLS,
   GAMES, SCHEDULE, SETTINGS, SEARCH, WALLPAPER, BOOT
   ============================================================ */

/* ---------------- GENERIC MODALS ---------------- */
function openModal(id) {
  const m = $(id);
  if (m) m.classList.add('open');
}
function closeModal(id) {
  const m = $(id);
  if (m) m.classList.remove('open');
}
/* overlay click pe close (calls aur stories except — unke apne close handlers) */
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay') && e.target.id !== 'callModal' && e.target.id !== 'storyViewer') {
    e.target.classList.remove('open');
  }
});

/* ---------------- STORY CREATOR ---------------- */
function openStoryCreator() {
  if (ME.two_fa_enabled === undefined) { /* noop */ }
  openModal('storyCreator');
  setTimeout(() => {
    storyTypeChanged();
    $('stText') && ($('stText').value = '');
    $('stCaption') && ($('stCaption').value = '');
    $('stTags') && ($('stTags').value = '');
    $('stBg') && ($('stBg').value = '#201a0d');
    if ($('stMedia')) $('stMedia').value = '';
  }, 30);
}
function storyTypeChanged() {
  const t = $('stType') ? $('stType').value : 'text';
  const txt = $('stTextField'), bg = $('stBgField'), med = $('stMediaField');
  if (txt) txt.classList.toggle('hidden', t !== 'text');
  if (bg) bg.classList.toggle('hidden', t !== 'text');
  if (med) med.classList.toggle('hidden', t === 'text');
}

async function postStory() {
  const type = $('stType').value;
  const text = $('stText').value.trim();
  const caption = $('stCaption').value.trim();
  const tags = $('stTags').value.trim();
  const bg = $('stBg').value || '#201a0d';
  const file = $('stMedia').files ? $('stMedia').files[0] : null;
  if (type === 'text' && !text) { toast('Story text likho! ✍️', 'error'); return; }
  if (type !== 'text' && !file) { toast('Image/video select karo! 🖼️', 'error'); return; }
  /* tags: usernames -> user ids */
  let tagIds = [];
  if (tags) {
    const names = tags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    tagIds = users.filter(u => names.includes((u.username || '').toLowerCase()) || names.includes((u.email || '').toLowerCase())).map(u => u.id);
  }
  try {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('text', text);
    fd.append('caption', caption);
    fd.append('background', bg);
    if (tagIds.length) fd.append('tags', JSON.stringify(tagIds));
    if (file) fd.append('story', file);
    await api('/api/story', { method: 'POST', form: fd });
    toast('✨ Story posted! 24h baad auto-delete', 'success');
    closeModal('storyCreator');
    await loadStories();
    renderStoriesBar();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- STORIES BAR ---------------- */
function renderStoriesBar() {
  const bar = $('storiesBar');
  if (!bar) return;
  let html = `
  <div class="story-item" onclick="openStoryCreator()">
    <div class="story-ring" style="background:transparent;padding:0"><div class="story-add">＋</div></div>
    <div class="story-name">My story</div>
  </div>`;
  for (const grp of stories) {
    const isMe = grp.user_id === ME.id;
    const hasNew = !grp.all_viewed && !isMe;
    const isHighlight = grp.stories.every(s => s.is_highlight);
    const ringClass = hasNew ? '' : 'viewed';
    const ringStyle = hasNew ? 'background:linear-gradient(45deg,#D9B872,#B8935A,#D9B872)' : '';
    const hasImg = !!(grp.profile_pic);
    const inner = hasImg ? `<img src="${esc(grp.profile_pic)}" alt="">` : `<span class="story-initial">${esc(initialOf(grp.username))}</span>`;
    html += `
    <div class="story-item" onclick="openStories('${grp.user_id}')">
      <div class="story-ring ${ringClass}" style="${ringStyle}">${inner}</div>
      <div class="story-name">${isMe ? 'My story' : esc(grp.username)}</div>
    </div>`;
  }
  bar.innerHTML = html;
}

/* ---------------- STORY VIEWER ---------------- */
function openStories(userId) {
  const idx = stories.findIndex(g => g.user_id === userId);
  if (idx < 0) return;
  storyUserIdx = idx;
  storyIndex = 0;
  $('storyViewer').classList.add('open');
  renderCurrentStory();
}

function currentStoryGroup() { return stories[storyUserIdx]; }
function currentStory() { return currentStoryGroup().stories[storyIndex]; }

function renderCurrentStory() {
  const grp = currentStoryGroup();
  const st = currentStory();
  if (!grp || !st) { closeStoryViewer(); return; }
  /* progress bars */
  const prog = $('storyProgress');
  prog.innerHTML = grp.stories.map((s, i) =>
    `<div class="sp ${i < storyIndex ? 'done' : (i === storyIndex ? 'active' : '')}"></div>`).join('');
  /* header */
  $('svAvatar').innerHTML = grp.profile_pic ? `<img src="${esc(grp.profile_pic)}" alt="">` : esc(initialOf(grp.username));
  $('svName').textContent = grp.username;
  $('svTime').textContent = timeAgo(st.created_at) + (st.is_highlight ? ' · ⭐ Highlight' : '');
  /* content */
  const c = $('svContent');
  if (st.type === 'text') {
    c.innerHTML = `<div class="st-text" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:36px;background:${esc(st.background || '#201a0d')};color:#fff;font-size:24px;font-weight:600;text-align:center;word-break:break-word">${esc(st.content || '')}</div>`;
  } else if (st.type === 'image') {
    c.innerHTML = `<img src="${esc(st.media_url)}" alt="story">`;
  } else {
    c.innerHTML = `<video src="${esc(st.media_url)}" autoplay controls playsinline></video>`;
  }
  /* caption + tags */
  let cap = st.caption ? esc(st.caption) : '';
  if (st.tags && st.tags.length) {
    const taggedNames = st.tags.map(tid => {
      const u = users.find(x => x.id === tid);
      return u ? '@' + u.username : null;
    }).filter(Boolean);
    if (taggedNames.length) cap += (cap ? ' — ' : '') + taggedNames.join(' ');
  }
  $('svCaption').innerHTML = cap;
  /* bottom: owner = viewers/highlight/delete; viewer = view+mark */
  const isOwner = grp.user_id === ME.id;
  $('svBottom').innerHTML = isOwner
    ? `<button class="btn btn-sm btn-secondary" onclick="openViewers('${st.id}')">👁 ${st.views || 0} viewers</button>
       ${!st.is_highlight ? `<button class="btn btn-sm btn-ghost" onclick="highlightStory('${st.id}')">⭐ Highlight</button>` : ''}
       <button class="btn btn-sm btn-danger" onclick="deleteStory('${st.id}')">🗑 Delete</button>`
    : `<span style="color:#fff;opacity:.8;font-size:12px">👁 ${st.views || 0} views</span>`;
  /* mark as viewed */
  if (!isOwner) {
    api('/api/story/view/' + st.id, { method: 'POST', body: {} }).then(() => {
      st.viewed = true;
    }).catch(() => {});
  }
  /* auto-advance timer (5s — matches CSS spFill animation) */
  clearTimeout(storyViewTimer);
  storyViewTimer = setTimeout(() => nextStory(), 5000);
}

function nextStory() {
  const grp = currentStoryGroup();
  if (storyIndex < grp.stories.length - 1) {
    storyIndex++;
    renderCurrentStory();
  } else if (storyUserIdx < stories.length - 1) {
    storyUserIdx++;
    storyIndex = 0;
    renderCurrentStory();
  } else {
    closeStoryViewer();
  }
}
function prevStory() {
  if (storyIndex > 0) { storyIndex--; renderCurrentStory(); }
  else if (storyUserIdx > 0) { storyUserIdx--; storyIndex = 0; renderCurrentStory(); }
}
function closeStoryViewer() {
  clearTimeout(storyViewTimer);
  storyViewTimer = null;
  const v = $('storyViewer');
  if (v) { v.classList.remove('open'); $('svContent').innerHTML = ''; }
}

async function openViewers(storyId) {
  try {
    const data = await api('/api/story/' + storyId + '/viewers');
    const rows = (data.viewers || []).map(v =>
      `<div class="notif-item"><div class="ni-ico">👁</div><div><div class="ni-title">${esc(v.username)}</div><div class="ni-body">${timeAgo(v.viewed_at)}</div></div><div class="ni-time">${new Date(v.viewed_at).toLocaleString()}</div></div>`).join('');
    $('viewersBody').innerHTML = rows || '<div class="empty-state" style="padding:40px 20px"><div class="es-ico">🫥</div><div class="small-note">Abhi koi nahi dekha</div></div>';
    openModal('viewersModal');
  } catch (e) { toast(e.message, 'error'); }
}

async function highlightStory(storyId) {
  try {
    await api(`/api/story/${storyId}/highlight`, { method: 'POST', body: {} });
    toast('⭐ Story highlight me save ho gayi', 'success');
    await loadStories();
    renderStoriesBar();
    renderCurrentStory();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteStory(storyId) {
  if (!confirm('🗑 Ye story delete karein?')) return;
  try {
    await api(`/api/story/${storyId}`, { method: 'DELETE' });
    toast('Story deleted 🗑', 'success');
    await loadStories();
    renderStoriesBar();
    closeStoryViewer();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- PROFILE / CHAT INFO ---------------- */
async function openChatInfo() {
  let title = 'Info';
  let inner = '';
  if (currentChatUser) {
    title = 'Contact info';
    const u = currentChatUser;
    inner = `
    <div style="text-align:center;padding:8px 0 4px">
      <div style="width:92px;height:92px;border-radius:50%;background:var(--secondary);color:#fff;font-size:38px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto 10px">${u.profile_pic ? `<img src="${esc(u.profile_pic)}" style="width:100%;height:100%;object-fit:cover" alt="">` : esc(initialOf(u.username))}</div>
      <div style="font-size:19px;font-weight:700">${esc(u.username)} ${u.isAdmin ? '👑' : ''}</div>
      <div class="small-note">${esc(u.email || '')}</div>
    </div>
    <div class="divider-label">About</div>
    <div style="padding:0 16px;font-size:14px">${esc(u.bio || '—')}</div>
    <div class="divider-label">Phone</div>
    <div style="padding:0 16px;font-size:14px">${esc(u.phone || '—')}</div>
    <div class="divider-label">Actions</div>
    <div style="padding:4px 16px 8px;display:flex;flex-wrap:wrap;gap:8px">
      <button class="btn btn-sm btn-secondary" onclick="startCall('voice')">📞 Call</button>
      <button class="btn btn-sm btn-secondary" onclick="startCall('video')">🎥 Video</button>
      ${u.blocked_by_me
        ? `<button class="btn btn-sm btn-ghost" onclick="unblockUser('${u.id}')">✅ Unblock</button>`
        : `<button class="btn btn-sm btn-danger" onclick="blockCurrentUser()">🚫 Block</button>`}
      <button class="btn btn-sm btn-ghost" onclick="openViewOnceUser('${u.id}')">1️⃣ View-once media</button>
    </div>
    <div class="mt-16"></div>`;
  } else if (currentGroup) {
    title = 'Group info';
    const members = currentGroup.members || [];
    let memHtml = '';
    try {
      const data = await api('/api/group/' + currentGroup.id + '/members');
      members.length = 0;
      members.push(...(data.members || []));
    } catch {}
    const amAdmin = currentGroup.my_role === 'admin' || currentGroup.is_admin;
    memHtml = members.map(m => `
      <div class="notif-item">
        <div class="ni-ico">${m.profile_pic ? `<img src="${esc(m.profile_pic)}" style="width:26px;height:26px;border-radius:50%">` : '👤'}</div>
        <div><div class="ni-title">${esc(m.username)} ${m.role === 'admin' ? '👑' : ''}</div><div class="ni-body">${m.online ? '🟢 online' : 'last seen ' + timeAgo(m.last_seen || 0)}</div></div>
        ${amAdmin && m.id !== ME.id ? `<button class="btn btn-sm btn-ghost" onclick="removeGroupMember('${m.id}')">✕</button>` : ''}
      </div>`).join('');
    inner = `
    <div style="text-align:center;padding:8px 0 4px">
      <div style="width:92px;height:92px;border-radius:50%;background:var(--secondary);color:#fff;font-size:38px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto 10px">${currentGroup.avatar ? `<img src="${esc(currentGroup.avatar)}" style="width:100%;height:100%;object-fit:cover" alt="">` : esc(initialOf(currentGroup.name))}</div>
      <div style="font-size:19px;font-weight:700">${esc(currentGroup.name)}</div>
      <div class="small-note">${members.length} members</div>
    </div>
    <div class="divider-label">Description</div>
    <div style="padding:0 16px;font-size:14px">${esc(currentGroup.description || '—')}</div>
    <div class="divider-label">Members</div>
    ${memHtml || '<div class="small-note" style="padding:10px 16px">Loading…</div>'}
    <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap">
      ${amAdmin ? `<button class="btn btn-sm btn-secondary" onclick="addMembersToGroup()">＋ Add members</button>` : ''}
      <button class="btn btn-sm btn-danger" onclick="leaveGroup()">🚪 Leave group</button>
    </div>
    <div class="mt-16"></div>`;
  } else if (currentChannel) {
    title = 'Channel info';
    const sub = currentChannel.subscribed;
    inner = `
    <div style="text-align:center;padding:8px 0 4px">
      <div style="width:92px;height:92px;border-radius:50%;background:var(--secondary);color:#fff;font-size:38px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">📢</div>
      <div style="font-size:19px;font-weight:700">${esc(currentChannel.name)}</div>
      <div class="small-note">${esc(currentChannel.description || 'Channel')} · 👥 ${currentChannel.subscribers || 1}</div>
    </div>
    <div class="divider-label">Subscription</div>
    <div style="padding:4px 16px 8px;display:flex;gap:8px">
      ${sub
        ? `<button class="btn btn-sm btn-danger" onclick="unsubscribeChannel()">🔕 Unsubscribe</button>`
        : `<button class="btn btn-sm" onclick="subscribeChannel()">🔔 Subscribe</button>`}
    </div>
    <div class="mt-16"></div>`;
  } else {
    /* my own profile */
    title = 'My profile';
    inner = `
    <div style="text-align:center;padding:8px 0 4px">
      <div style="width:92px;height:92px;border-radius:50%;background:var(--secondary);color:#fff;font-size:38px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto 10px">${ME.profile_pic ? `<img src="${esc(ME.profile_pic)}" style="width:100%;height:100%;object-fit:cover" alt="">` : esc(initialOf(ME.username))}</div>
      <div style="font-size:19px;font-weight:700">${esc(ME.username)} ${ME.isAdmin ? '👑' : ''}</div>
      <div class="small-note">${esc(ME.email || '')}</div>
    </div>
    <div class="divider-label">About</div>
    <div style="padding:0 16px;font-size:14px">${esc(ME.bio || '—')}</div>
    <div class="divider-label">Privacy</div>
    <div style="padding:0 16px;font-size:13px" class="small-note">
      Last seen: ${esc(ME.privacy?.last_seen || 'everyone')} · Profile photo: ${esc(ME.privacy?.profile_pic || 'everyone')} · Status: ${esc(ME.privacy?.status || 'everyone')}
    </div>
    <div style="padding:12px 16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-secondary" onclick="closeModal('profileModal');openSettings()">⚙️ Edit profile</button>
    </div>
    <div class="mt-16"></div>`;
  }
  $('pmTitle').textContent = title;
  $('pmBody').innerHTML = inner;
  openModal('profileModal');
}

async function openViewOnceUser(userId) {
  toast('1️⃣ View-once messages sirf chat ke andar dikhte hain — bhejne ke liye composer me 1️⃣ button dabao', 'info', 3500);
  closeModal('profileModal');
}

async function removeGroupMember(userId) {
  if (!currentGroup || !confirm('Remove this member?')) return;
  try {
    await api('/api/group/remove-member', { method: 'POST', body: { group_id: currentGroup.id, user_id: userId } });
    toast('Member removed ✕', 'success');
    openChatInfo();
  } catch (e) { toast(e.message, 'error'); }
}

async function addMembersToGroup() {
  const notIn = users.filter(u => u.id !== ME.id && !(currentGroup.members || []).some(m => m.id === u.id));
  if (!notIn.length) { toast('Sab users pehle se members hain', 'info'); return; }
  const pick = prompt(`Add karna hai kaun? (comma separated numbers likho)\n${notIn.map((u, i) => `${i + 1}. ${u.username}`).join('\n')}`);
  if (!pick) return;
  const idxs = pick.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(i => i >= 0 && i < notIn.length);
  if (!idxs.length) return;
  const ids = idxs.map(i => notIn[i].id);
  try {
    await api('/api/group/add-member', { method: 'POST', body: { group_id: currentGroup.id, userIds: ids } });
    toast(`✅ ${ids.length} member(s) added`, 'success');
    openChatInfo();
  } catch (e) { toast(e.message, 'error'); }
}

async function leaveGroup() {
  if (!currentGroup || !confirm(`🚪 "${currentGroup.name}" leave karein?`)) return;
  try {
    await api('/api/group/leave', { method: 'POST', body: { group_id: currentGroup.id } });
    toast('Group left 👋', 'success');
    closeModal('profileModal');
    closeChat();
    loadGroups().then(renderChatList);
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- GROUPS ---------------- */
function openNewGroupModal() {
  const list = $('ngMembers');
  if (!list) { openModal('newGroupModal'); return; }
  list.innerHTML = users.filter(u => u.id !== ME.id).map(u => `
    <div class="user-pick" onclick="this.classList.toggle('selected')" data-uid="${u.id}">
      <div class="up-av">${u.profile_pic ? `<img src="${esc(u.profile_pic)}" alt="">` : esc(initialOf(u.username))}</div>
      <div style="flex:1"><div class="up-name">${esc(u.username)}</div><div class="up-sub">${esc(u.email || '')}</div></div>
      <div class="up-check">✓</div>
    </div>`).join('') || '<div class="small-note" style="padding:12px">Koi user available nahi — pehle dusre accounts banao!</div>';
  if ($('ngName')) $('ngName').value = '';
  if ($('ngDesc')) $('ngDesc').value = '';
  if ($('ngAvatar')) $('ngAvatar').value = '';
  openModal('newGroupModal');
}

async function createGroup() {
  const name = $('ngName').value.trim();
  if (!name) { toast('Group name likho!', 'error'); return; }
  const selected = [...document.querySelectorAll('#ngMembers .user-pick.selected')].map(el => el.dataset.uid);
  try {
    const fd = new FormData();
    fd.append('name', name);
    if ($('ngDesc').value.trim()) fd.append('description', $('ngDesc').value.trim());
    const av = $('ngAvatar').files ? $('ngAvatar').files[0] : null;
    if (av) fd.append('avatar', av);
    if (selected.length) fd.append('members', JSON.stringify(selected));
    const data = await api('/api/group', { method: 'POST', form: fd });
    toast(`👥 Group "${name}" created!`, 'success');
    closeModal('newGroupModal');
    await loadGroups();
    switchTab('groups');
    renderChatList();
    if (data.group_id) openGroupChat(data.group_id);
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- CHANNELS ---------------- */
function openNewChannelModal() {
  if ($('ncName')) $('ncName').value = '';
  if ($('ncDesc')) $('ncDesc').value = '';
  openModal('newChannelModal');
}

async function createChannel() {
  const name = $('ncName').value.trim();
  if (!name) { toast('Channel name likho!', 'error'); return; }
  try {
    const data = await api('/api/channel', { method: 'POST', body: { name, description: $('ncDesc').value.trim() } });
    toast(`📢 Channel "${name}" created!`, 'success');
    closeModal('newChannelModal');
    await loadChannels();
    switchTab('channels');
    renderChatList();
    if (data.channel_id) openChannelChat(data.channel_id);
  } catch (e) { toast(e.message, 'error'); }
}

async function subscribeChannel() {
  if (!currentChannel) return;
  try {
    await api(`/api/channel/subscribe/${currentChannel.id}`, { method: 'POST', body: {} });
    currentChannel.subscribed = 1;
    toast('🔔 Subscribed', 'success');
    await loadChannels(); renderChatList();
    openChatInfo();
  } catch (e) { toast(e.message, 'error'); }
}

async function unsubscribeChannel() {
  if (!currentChannel) return;
  try {
    await api(`/api/channel/unsubscribe/${currentChannel.id}`, { method: 'POST', body: {} });
    currentChannel.subscribed = 0;
    toast('🔕 Unsubscribed', 'info');
    await loadChannels(); renderChatList();
    openChatInfo();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- POLLS ---------------- */
function openPollModal() {
  if (!currentChatUser && !currentGroup && !currentChannel) { toast('Pehle koi chat kholo! 📊', 'info'); return; }
  if ($('pollQuestion')) $('pollQuestion').value = '';
  if ($('pollOptions')) $('pollOptions').value = '';
  openModal('pollModal');
}

async function createPoll() {
  const q = $('pollQuestion').value.trim();
  const opts = $('pollOptions').value.split(',').map(s => s.trim()).filter(Boolean);
  if (!q || opts.length < 2) { toast('Question + kam se kam 2 options chahiye! 📊', 'error'); return; }
  const ctx = currentGroup ? { context_type: 'group', context_id: currentGroup.id } : (currentChannel ? { context_type: 'channel', context_id: currentChannel.id } : { context_type: 'chat', context_id: currentChatUser.id });
  try {
    const data = await api('/api/poll', { method: 'POST', body: { ...ctx, question: q, options: opts, duration_hours: parseInt($('pollDuration')?.value || '24', 10) || 24 } });
    toast('📊 Poll created!', 'success');
    closeModal('pollModal');
    /* local render */
    const mid = 'poll_' + Date.now();
    if (currentGroup) {
      groupMessages.push({ id: mid, group_id: currentGroup.id, sender_id: ME.id, sender: { id: ME.id, username: ME.username }, message: `📊 POLL: ${q}`, type: 'poll', poll_id: data.poll_id, media_url: data.poll_id, timestamp: Date.now() });
      renderGroupMessages();
    } else {
      messages.push({ id: mid, from_user: ME.id, to_user: ctx.context_id, message: `📊 POLL: ${q}`, type: 'poll', poll_id: data.poll_id, media_url: data.poll_id, timestamp: Date.now() });
      renderMessages();
    }
    scrollMsgsBottom();
    /* poll room join karke live updates le lo */
    socket.emit('join-poll', { poll_id: data.poll_id });
  } catch (e) { toast(e.message, 'error'); }
}

/* renderPollCard — renderMessageBubble type:'poll' call karta hai */
async function renderPollCard(m) {
  const pid = m.poll_id || m.media_url;
  if (!pid) return `<div class="poll-card"><div class="poll-q">📊 Poll (expired)</div></div>`;
  let d = null;
  try { d = await api('/api/poll/' + pid); } catch { return `<div class="poll-card"><div class="poll-q">📊 ${esc(m.message || 'Poll')}</div><div class="small-note">Poll unavailable</div></div>`; }
  const poll = d.poll;
  const counts = d.counts || {};
  const total = d.total || 0;
  const myVote = d.my_vote;
  const opts = poll.options || [];
  const expired = poll.expires_at && poll.expires_at < Date.now();
  let bar = opts.map((o, i) => {
    const c = counts[i] || 0;
    const pct = total ? Math.round(c / total * 100) : 0;
    return `<div class="poll-opt ${myVote === i ? 'my-vote' : ''}" onclick="votePoll('${pid}',${i},${myVote === null ? 1 : 0})">
      <div class="po-label"><span>${esc(o)} ${myVote === i ? '✔' : ''}</span><span>${c} · ${pct}%</span></div>
      <div class="po-bar"><div class="po-fill" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
  return `<div class="poll-card" id="pollcard-${esc(pid)}">
    <div class="poll-q">📊 ${esc(poll.question)}</div>
    ${bar}
    <div class="poll-foot"><span>${total} vote(s)${expired ? ' · ⏰ ended' : ''}</span><span>${poll.anonymous ? '🙈 anonymous' : ''}</span></div>
  </div>`;
}

/* poll-card async hai — render ke baad fill karte hain */
function votePoll(pollId, idx, canVote) {
  if (!canVote) { toast('Aapne pehle se vote kar diya hai ✔', 'info'); return; }
  socket.emit('poll-vote', { poll_id: pollId, option_index: idx });
  socket.emit('join-poll', { poll_id: pollId });
  toast('🗳 Vote bheja!', 'success', 1500);
}

function refreshPollCard(d) {
  const card = $('pollcard-' + d.poll_id);
  if (!card) return;
  const total = d.total || 0;
  card.querySelectorAll('.poll-opt').forEach((row, i) => {
    const c = (d.counts || {})[i] || 0;
    const pct = total ? Math.round(c / total * 100) : 0;
    row.classList.toggle('my-vote', row.querySelector('.po-label span').textContent.includes('✔'));
    row.querySelector('.po-label span:last-child').textContent = `${c} · ${pct}%`;
    row.querySelector('.po-fill').style.width = pct + '%';
  });
  const foot = card.querySelector('.poll-foot span');
  if (foot) foot.textContent = `${total} vote(s)`;
}

/* ---------------- GAMES (Tic-Tac-Toe) ---------------- */
function openGameModal(gameId) {
  if (gameId) { loadGame(gameId); }
  else {
    const list = users.filter(u => u.id !== ME.id && u.email !== 'bot@csk4.com');
    const html = `
    <div class="game-status">Opponent select karo 👇</div>
    <div class="user-pick-list" id="gameOppList">
      ${list.map(u => `<div class="user-pick" onclick="createGame('${u.id}')">
        <div class="up-av">${u.profile_pic ? `<img src="${esc(u.profile_pic)}" alt="">` : esc(initialOf(u.username))}</div>
        <div style="flex:1"><div class="up-name">${esc(u.username)}</div><div class="up-sub">Challenge bhejo 🎮</div></div>
      </div>`).join('')}
    </div>`;
    $('gameBody').innerHTML = html;
  }
  openModal('gameModal');
}

async function createGame(opponentId) {
  try {
    const data = await api('/api/game/create', { method: 'POST', body: { opponent: opponentId } });
    socket.emit('join-game', { game_id: data.game_id });
    renderGame({ game_id: data.game_id, board: data.board, turn: data.turn, status: 'waiting', your_symbol: 'X' });
    toast('🎲 Challenge bheja! Wait for accept…', 'info');
  } catch (e) { toast(e.message, 'error'); }
}

async function joinGame(gameId) {
  try {
    const data = await api(`/api/game/join/${gameId}`, { method: 'POST', body: {} });
    socket.emit('join-game', { game_id: gameId });
    renderGame({ game_id: gameId, board: data.board, turn: data.turn, status: 'playing', your_symbol: 'O' });
    openModal('gameModal');
    toast('🎮 Game joined — aap O ho, X pehle chalta hai', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function loadGame(gameId) {
  try {
    const data = await api('/api/game/' + gameId);
    renderGame({ ...data.game, game_id: gameId, your_symbol: data.game.player1 === ME.id ? 'X' : 'O' });
    openModal('gameModal');
  } catch (e) { toast(e.message, 'error'); }
}

function renderGame(d) {
  gameCurrent = d;
  const body = $('gameBody');
  if (!body) return;
  const mySymbol = d.your_symbol || (d.player1 === ME.id ? 'X' : 'O');
  const oppName = d.player2_name || (d.opponent || '');
  const myTurn = d.turn === ME.id;
  const statusTxt =
    d.status === 'waiting' ? '⏳ Waiting for opponent to join…' :
    d.status === 'finished' ? (d.winner === ME.id ? '🏆 Aap jeet gaye!' : '💀 Aap haar gaye!') :
    d.status === 'draw' ? '🤝 Draw! Koi nahi jeeta' :
    (myTurn ? '✅ Aap ki turn (' + mySymbol + ')' : `⏳ Opponent ki turn${oppName ? ' — ' + esc(oppName) : ''}`);
  const cells = (d.board || '---------').split('').map((c, i) =>
    `<button class="game-cell ${c !== '-' ? c : ''}" ${c !== '-' || !myTurn || d.status !== 'playing' ? 'disabled' : ''} onclick="gameMove(${i})">${c === '-' ? '' : c}</button>`).join('');
  body.innerHTML = `
    <div class="game-status">${statusTxt}</div>
    <div class="game-board">${cells}</div>
    <div class="small-note" style="text-align:center">🎮 Tic-Tac-Toe · aap: <b>${mySymbol}</b> · status: ${esc(d.status || 'playing')}</div>
    <div style="display:flex;justify-content:center;margin-top:10px">
      <button class="btn btn-sm btn-ghost" onclick="closeModal('gameModal')">Close</button>
    </div>`;
}

function gameMove(pos) {
  if (!gameCurrent) return;
  socket.emit('game-move', { game_id: gameCurrent.game_id, position: pos });
}

/* ---------------- SCHEDULE ---------------- */
function openScheduleModal() {
  if (!currentChatUser && !currentGroup) { toast('Pehle koi chat kholo! ⏰', 'info'); return; }
  if ($('schedMsg')) $('schedMsg').value = '';
  const dt = $('schedAt');
  if (dt) {
    const now = new Date(Date.now() + 3600000);
    dt.value = now.toISOString().slice(0, 16);
    dt.min = new Date().toISOString().slice(0, 16);
  }
  openModal('scheduleModal');
}

async function scheduleMessage() {
  const msg = $('schedMsg').value.trim();
  const at = $('schedAt').value;
  if (!msg) { toast('Message likho! ⏰', 'error'); return; }
  if (!at) { toast('Date & time select karo!', 'error'); return; }
  const to = currentChatUser ? currentChatUser.id : (currentGroup ? 'g:' + currentGroup.id : null);
  if (!to) { toast('Sirf chats/groups me schedule hota hai', 'error'); return; }
  try {
    const data = await api('/api/schedule', { method: 'POST', body: { to, message: msg, send_at: at } });
    toast(`⏰ Scheduled: ${data.message || 'OK'}`, 'success', 4000);
    closeModal('scheduleModal');
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- QUICK REPLIES ---------------- */
async function openQuickReplies() {
  openModal('qrModal');
  await loadQuickReplies();
  await renderQuickReplyList();
}

async function renderQuickReplyList() {
  const list = $('qrList');
  if (!list) return;
  try {
    const data = await api('/api/quick-reply');
    quickRepliesCache = data.quickReplies || [];
    list.innerHTML = quickRepliesCache.length
      ? quickRepliesCache.map(q => `
        <div class="notif-item">
          <div class="ni-ico">⚡</div>
          <div style="flex:1"><div class="ni-title">/${esc(q.shortcut)}</div><div class="ni-body">${esc(q.message)}</div></div>
          <button class="btn btn-sm btn-danger" onclick="deleteQuickReply('${q.id}')">🗑</button>
        </div>`).join('')
      : '<div class="small-note" style="padding:12px">Koi quick reply nahi — /shortcut chat me type karke auto-expand hota hai</div>';
  } catch (e) { console.error(e.message); }
}

async function addQuickReply() {
  const sc = $('qrShortcut').value.trim();
  const msg = $('qrMessage').value.trim();
  if (!sc || !msg) { toast('Shortcut + message dono likho! ⚡', 'error'); return; }
  if (!sc.startsWith('/')) { toast('Shortcut / se start ho (jaise /brb)', 'info'); }
  try {
    await api('/api/quick-reply', { method: 'POST', body: { shortcut: sc.replace(/^\//, ''), message: msg } });
    toast('⚡ Quick reply saved!', 'success');
    $('qrShortcut').value = ''; $('qrMessage').value = '';
    renderQuickReplyList();
    loadQuickReplies();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteQuickReply(id) {
  try {
    await api('/api/quick-reply/' + id, { method: 'DELETE' });
    toast('🗑 Deleted', 'success');
    renderQuickReplyList();
    loadQuickReplies();
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- NOTIFICATIONS ---------------- */
function openNotifications() {
  renderNotifList();
  openModal('notifModal');
}

function renderNotifList() {
  const body = $('notifBody');
  if (!body) return;
  const icons = { message: '💬', group: '👥', story: '🖼️', 'story-tag': '🏷️', call: '📞', game: '🎮', poll: '📊', report: '🚫', system: '⚙️', request: '📩', 'request_accepted': '🤝' };
  body.innerHTML = notifications.length
    ? notifications.map(n => {
      // v5.3.1: normalize data (socket = object, DB = JSON string)
      let nd = n.data || {};
      if (typeof nd === 'string') { try { nd = JSON.parse(nd) || {}; } catch { nd = {}; } }
      const nFrom = nd.from_user || null;
      // v5.3.1: request notification par Accept/Reject action buttons
      let actions = '';
      const stillPending = nFrom && (pendingRequests.incoming || []).some(r => r.from_user === nFrom && r.status === 'pending');
      if (n.type === 'request' && nFrom && stillPending) {
        actions = `
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn-sm gold" onclick="event.stopPropagation();acceptRequest('${nFrom}')">✓ Accept</button>
          <button class="btn-sm" style="background:rgba(255,90,90,.15);color:#ff6b6b;" onclick="event.stopPropagation();rejectRequest('${nFrom}')">✕ Reject</button>
        </div>`;
      } else if (n.type === 'request_accepted' && (nd.user_id || nFrom)) {
        actions = `<button class="btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();openChatWith('${nd.user_id || nFrom}')">💬 Open Chat</button>`;
      }
      return `
      <div class="notif-item ${n.read ? '' : 'unread'}" onclick="readOneNotif('${n.id}')">
        <div class="ni-ico">${icons[n.type] || '🔔'}</div>
        <div style="flex:1">
          <div class="ni-title">${esc(n.title)}</div>
          <div class="ni-body">${esc(n.body)}</div>${actions}
        </div>
        <div class="ni-time">${timeAgo(n.created_at)}</div>
      </div>`;
    }).join('')
    : '<div class="empty-state" style="padding:40px 20px"><div class="es-ico">🔕</div><div class="small-note">Koi notification nahi</div></div>';
}

async function readOneNotif(id) {
  try {
    await api('/api/notifications/read', { method: 'POST', body: { id } });
    const n = notifications.find(x => x.id === id);
    if (n) n.read = 1;
    renderNotifList();
    updateNotifBadge();
  } catch {}
}

async function markAllNotifsRead() {
  try {
    await api('/api/notifications/read', { method: 'POST', body: {} });
    notifications.forEach(n => n.read = 1);
    renderNotifList();
    updateNotifBadge();
    toast('✅ Sab read mark ho gaye', 'success', 1500);
  } catch (e) { toast(e.message, 'error'); }
}

/* ---------------- SEARCH ---------------- */
function openSearch() {
  if ($('globalSearchInput')) $('globalSearchInput').value = '';
  if ($('globalSearchResults')) $('globalSearchResults').innerHTML = '<div class="small-note" style="padding:10px">🔍 Kuch bhi type karo — saare personal messages me search hoga</div>';
  openModal('searchModal');
}

let searchDebTimer = null;
function globalSearchDebounce() {
  clearTimeout(searchDebTimer);
  searchDebTimer = setTimeout(runGlobalSearch, 350);
}

async function runGlobalSearch() {
  const q = $('globalSearchInput').value.trim();
  const box = $('globalSearchResults');
  if (!q) { box.innerHTML = '<div class="small-note" style="padding:10px">🔍 Query likho…</div>'; return; }
  box.innerHTML = '<div class="small-note" style="padding:10px">⏳ Searching…</div>';
  try {
    const data = await api('/api/search/messages?q=' + encodeURIComponent(q));
    const rows = data.results || [];
    box.innerHTML = rows.length
      ? rows.map(r => {
        const other = r.from_user === ME.id ? (users.find(u => u.id === r.to_user)?.username || '??') : (users.find(u => u.id === r.from_user)?.username || '??');
        return `<div class="notif-item" style="cursor:pointer" onclick="jumpToSearch('${r.from_user === ME.id ? r.to_user : r.from_user}','${r.id}')">
          <div class="ni-ico">💬</div>
          <div style="flex:1"><div class="ni-title">${esc(other)}</div><div class="ni-body">${esc((r.message || '').slice(0, 80))}</div></div>
          <div class="ni-time">${timeStr(r.timestamp)}</div>
        </div>`;
      }).join('')
      : '<div class="empty-state" style="padding:30px 16px"><div class="es-ico">🙈</div><div class="small-note">Kuch nahi mila — dusre words try karo</div></div>';
  } catch (e) { box.innerHTML = `<div class="small-note" style="padding:10px">⚠️ ${esc(e.message)}</div>`; }
}

async function jumpToSearch(userId, mid) {
  closeModal('searchModal');
  await openChatWith(userId);
  setTimeout(() => scrollToMsg(mid), 400);
}

/* ---------------- WALLPAPER ---------------- */
const WALLPAPERS = [
  { id: 'solid-1', name: 'Light beige' }, { id: 'solid-2', name: 'Mint' },
  { id: 'solid-3', name: 'Rose' }, { id: 'solid-4', name: 'Sky' },
  { id: 'solid-5', name: 'Dark slate' }, { id: 'solid-6', name: 'Deep night' },
  { id: 'wp-img-1', name: 'Cat 🐱' }, { id: 'wp-img-2', name: 'Lake 🏞️' }, { id: 'wp-img-3', name: 'Forest 🌲' },
];

function openWallpaperPicker() {
  const grid = $('wallpaperGrid');
  if (grid) {
    grid.innerHTML = WALLPAPERS.map(w => `
      <div class="wallpaper-item ${w.id}" onclick="setWallpaper('${w.id}')">${esc(w.name)}</div>`).join('');
  }
  openModal('wallpaperModal');
}

function setWallpaper(id) {
  currentWallpaper = id || '';
  localStorage.setItem('csk4_wallpaper', currentWallpaper);
  applyWallpaper();
  toast('🎨 Wallpaper set!', 'success', 1500);
}

function applyWallpaper() {
  const c = $('messagesContainer');
  if (!c) return;
  const WPS = {
    'solid-1': '#efe7dd', 'solid-2': '#d1e7dd', 'solid-3': '#e7d8d1',
    'solid-4': '#d1d8e7', 'solid-5': '#0a0a0a', 'solid-6': '#1a1508',
    'wp-img-1': 'url("https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=800")',
    'wp-img-2': 'url("https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800")',
    'wp-img-3': 'url("https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800")',
  };
  c.style.backgroundImage = '';
  c.style.backgroundColor = '';
  if (WPS[currentWallpaper]) {
    if (WPS[currentWallpaper].startsWith('url')) { c.style.backgroundImage = WPS[currentWallpaper]; c.style.backgroundSize = 'cover'; c.style.backgroundPosition = 'center'; }
    else c.style.backgroundColor = WPS[currentWallpaper];
  }
  /* custom uploaded wallpaper URL */
  if (currentWallpaper && currentWallpaper.startsWith('/uploads')) {
    c.style.backgroundImage = `url("${currentWallpaper}")`;
    c.style.backgroundSize = 'cover';
  }
}

async function onWallpaperPicked(e) {
  const file = e && e.target && e.target.files ? e.target.files[0] : null;
  if (!file) return;
  const fd = new FormData();
  fd.append('wallpaper', file);
  try {
    const data = await api('/api/wallpaper', { method: 'POST', form: fd });
    if (data.wallpaper) {
      currentWallpaper = data.wallpaper;
      localStorage.setItem('csk4_wallpaper', currentWallpaper);
      applyWallpaper();
      toast('🖼️ Custom wallpaper laga diya!', 'success');
    }
  } catch (er) { toast(er.message, 'error'); }
}

/* ---------------- WEBRTC CALLS ---------------- */
const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};
let facingMode = 'user';

async function switchCamera() {
  if (!localStream || !currentCall || currentCall.type !== 'video') return;
  const newFacing = facingMode === 'user' ? 'environment' : 'user';
  try {
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) { oldTrack.stop(); localStream.removeTrack(oldTrack); }

    let newStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: newFacing } }, audio: false });
    } catch (err) {
      newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: newFacing } }, audio: false });
    }
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) throw new Error('Camera nahi mila');
    localStream.addTrack(newTrack);
    if (peerConnection) {
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
    }
    const lv = $('localVideo');
    if (lv) lv.srcObject = localStream;
    facingMode = newFacing;
    toast(facingMode === 'environment' ? '📷 Back camera' : '🤳 Front camera', 'info', 1200);
  } catch (e) {
    toast('⚠️ Camera switch nahi ho saka (' + e.message + ')', 'error');
  }
}

async function startCall(type) {
  if (!currentChatUser) { toast('Calls sirf personal chats me! 📞', 'info'); return; }
  if (!window.RTCPeerConnection) { toast('WebRTC browser me available nahi', 'error'); return; }
  const callId = 'c_' + Date.now();
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
  } catch (e) {
    toast('🎤 Camera/mic permission chahiye! (' + e.message + ')', 'error', 4000);
    return;
  }
  currentCall = { callId, type, with: currentChatUser.id, incoming: false };
  showCallUI(type, currentChatUser.username, 'Calling…');
  /* peer setup */
  await setupPeer(currentChatUser.id, null, 'caller');
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('call-user', { to: currentChatUser.id, callType: type, offer: { type: offer.type, sdp: offer.sdp, from: ME.id }, callId });
  toast(`📞 ${type === 'video' ? 'Video' : 'Voice'} call — ${currentChatUser.username}`, 'info');
}

function showCallUI(type, name, status) {
  $('callAvatar').innerHTML = currentChatUser && currentChatUser.profile_pic ? `<img src="${esc(currentChatUser.profile_pic)}" alt="">` : esc(initialOf(name));
  $('callName').textContent = name;
  $('callStatus').textContent = status;
  $('callModal').classList.add('open');
  $('btnCam').classList.toggle('hidden', type !== 'video');
  $('btnScreen').classList.toggle('hidden', type !== 'video');
  const swCamBtn = $('btnSwitchCam');
  if (swCamBtn) swCamBtn.classList.toggle('hidden', type !== 'video');
  facingMode = 'user';
  const vids = $('callVideos');
  if (vids) vids.classList.toggle('hidden', type !== 'video');
  const timerEl = $('callTimer');
  if (timerEl) { timerEl.classList.add('hidden'); timerEl.textContent = '00:00'; }
}

function hideCallUI() {
  const m = $('callModal');
  if (m) m.classList.remove('open');
}

function showIncomingCall(d) {
  incomingCallData = d;
  const from = d.fromUser || {};
  $('incAvatar').innerHTML = from.profile_pic ? `<img src="${esc(from.profile_pic)}" alt="">` : esc(initialOf(from.username || '?'));
  $('incName').textContent = from.username || 'Unknown';
  $('incType').textContent = (d.callType === 'video' ? '🎥 Incoming video call…' : '📞 Incoming voice call…');
  $('incomingCall').classList.add('show');
  startRingtone();
  startVibration();
  /* missed call notification if not answered in 30s */
  incomingCallData.missedTimer = setTimeout(() => rejectIncomingCall(true), 30000);
}

async function acceptIncomingCall() {
  if (!incomingCallData) return;
  stopRingtone();
  stopVibration();
  clearTimeout(incomingCallData.missedTimer);
  const d = incomingCallData;
  $('incomingCall').classList.remove('show');
  currentCall = { callId: d.callId, type: d.callType, with: d.from, incoming: true };
  showCallUI(d.callType, (d.fromUser?.username) || 'Caller', 'Connecting…');
  /* answerer: offer set hota hai webrtc-signal handler me */
  await setupPeer(d.from, d.offer, 'answerer');
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('accept-call', { to: d.from, answer: { type: answer.type, sdp: answer.sdp, from: ME.id }, callId: d.callId });
  $('callStatus').textContent = 'Connected ✅';
  startCallTimer();
}

function rejectIncomingCall(silent) {
  if (!incomingCallData) return;
  stopRingtone();
  stopVibration();
  clearTimeout(incomingCallData.missedTimer);
  socket.emit('reject-call', { to: incomingCallData.from, callId: incomingCallData.callId });
  $('incomingCall').classList.remove('show');
  if (!silent) toast('Call reject kar di', 'info', 1500);
  incomingCallData = null;
}

async function endCall() {
  if (currentCall) {
    socket.emit('end-call', { to: currentCall.with, callId: currentCall.callId });
  }
  stopRingtone();
  stopVibration();
  hideCallUI();
  cleanupCall();
}

async function onCallAccepted(d) {
  /* caller ko answer mila — remote desc set karo */
  try {
    if (peerConnection && d.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(d.answer));
      $('callStatus').textContent = 'Connected ✅';
      startCallTimer();
    }
  } catch (e) { console.error('onCallAccepted', e); }
}

async function setupPeer(remoteId, offer, role) {
  if (peerConnection) { try { peerConnection.close(); } catch {} }
  peerConnection = new RTCPeerConnection(RTC_CONFIG);
  /* local tracks */
  if (localStream) {
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  }
  /* local video preview */
  const lv = $('localVideo');
  if (lv && localStream && currentCall && currentCall.type === 'video') { lv.srcObject = localStream; }
  /* remote stream */
  remoteStream = new MediaStream();
  const rv = $('remoteVideo');
  const ra = $('remoteAudio');
  if (rv) rv.srcObject = remoteStream;
  if (ra) ra.srcObject = remoteStream;
  peerConnection.ontrack = (ev) => {
    remoteStream.addTrack(ev.track);
    if (currentCall && currentCall.type === 'video' && rv) { rv.srcObject = remoteStream; }
    if (ra) ra.srcObject = remoteStream;
  };
  /* ice candidates — bhejte jao */
  peerConnection.onicecandidate = (ev) => {
    if (ev.candidate) socket.emit('webrtc-signal', { to: remoteId, signal: { candidate: ev.candidate, from: ME.id } });
  };
  peerConnection.onconnectionstatechange = () => {
    const s = peerConnection ? peerConnection.connectionState : '';
    if (s === 'connected') { $('callStatus').textContent = 'Connected ✅'; startCallTimer(); }
    if (s === 'failed' || s === 'disconnected') { $('callStatus').textContent = '⚠️ Connection ' + s; }
  };
  /* answerer: offer apply */
  if (offer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  }
}

function toggleMute() {
  if (!localStream) return;
  const t = localStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  const b = $('btnMute');
  b.classList.toggle('unmute', !t.enabled);
  b.textContent = t.enabled ? '🎤' : '🔇';
  toast(t.enabled ? '🎤 Mic on' : '🔇 Muted', 'info', 1200);
}

function toggleCam() {
  if (!localStream) return;
  const t = localStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  const b = $('btnCam');
  b.textContent = t.enabled ? '🎥' : '🚫';
  toast(t.enabled ? '🎥 Camera on' : '🚫 Camera off', 'info', 1200);
}

async function toggleScreenShare() {
  if (!peerConnection) return;
  try {
    if (!screenTrack) {
      const ss = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenTrack = ss.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
      else peerConnection.addTrack(screenTrack, ss);
      screenTrack.onended = () => toggleScreenShare();
      $('btnScreen').textContent = '🖥️';
      toast('🖥️ Screen share ON', 'success', 1500);
    } else {
      /* back to camera */
      const camTrack = localStream.getVideoTracks()[0];
      const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && camTrack) sender.replaceTrack(camTrack);
      if (screenTrack.stop) screenTrack.stop();
      screenTrack = null;
      $('btnScreen').textContent = '🖥';
      toast('🖥️ Screen share OFF — camera back', 'info', 1500);
    }
  } catch (e) {
    if (String(e.message).includes('Permission')) toast('Screen share permission nahi mili', 'error');
    else toast('Screen share: ' + e.message, 'error');
  }
}

function startCallTimer() {
  if (callTimerInterval) return;
  callStartTs = Date.now();
  const el = $('callTimer');
  if (!el) return;
  el.classList.remove('hidden');
  callTimerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTs) / 1000);
    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }, 1000);
}

function cleanupCall() {
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (screenTrack) { try { screenTrack.stop(); } catch {} screenTrack = null; }
  if (peerConnection) { try { peerConnection.close(); } catch {} peerConnection = null; }
  remoteStream = null;
  currentCall = null;
  incomingCallData = null;
  const lv = $('localVideo'), rv = $('remoteVideo'), ra = $('remoteAudio');
  if (lv) lv.srcObject = null;
  if (rv) rv.srcObject = null;
  if (ra) ra.srcObject = null;
  const btnM = $('btnMute'), btnC = $('btnCam');
  if (btnM) { btnM.classList.remove('unmute'); btnM.textContent = '🎤'; }
  if (btnC) btnC.textContent = '🎥';
}

/* ---------------- SETTINGS ---------------- */
async function openSettings() {
  try { ME = (await api('/api/me')).user; } catch {}
  const p = ME.privacy || {};
  const themeDark = document.body.classList.contains('dark');
  $('settingsBody').innerHTML = `
  <div style="text-align:center;padding:4px 0 10px">
    <div style="width:76px;height:76px;border-radius:50%;background:var(--secondary);color:#fff;font-size:30px;font-weight:700;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:0 auto 8px">${ME.profile_pic ? `<img src="${esc(ME.profile_pic)}" style="width:100%;height:100%;object-fit:cover" alt="">` : esc(initialOf(ME.username))}</div>
    <div style="font-size:17px;font-weight:700">${esc(ME.username)} ${ME.isAdmin ? '👑' : ''}</div>
    <div class="small-note">${esc(ME.email || '')}</div>
  </div>

  <div class="divider-label">Edit profile</div>
  <div class="form-field"><label>Username</label><input id="setUsername" value="${esc(ME.username || '')}"></div>
  <div class="form-field"><label>Bio / About</label><input id="setBio" value="${esc(ME.bio || '')}"></div>
  <div class="form-field"><label>Phone</label><input id="setPhone" value="${esc(ME.phone || '')}"></div>
  <div class="form-field"><label>Profile photo</label><input type="file" id="setAvatar" accept="image/*"></div>
  <button class="btn btn-full btn-secondary" onclick="updateProfile()">💾 Save profile</button>

  <div class="divider-label">Appearance</div>
  <div class="settings-row" onclick="toggleTheme()">
    <span class="sr-ico">${themeDark ? '☀️' : '🌙'}</span>
    <span class="sr-label">${themeDark ? 'Light mode' : 'Dark mode'}</span>
    <span class="sr-sub">Tap to switch</span>
  </div>
  <div class="settings-row" onclick="openWallpaperPicker()">
    <span class="sr-ico">🎨</span><span class="sr-label">Chat wallpaper</span><span class="sr-sub">Solid + custom</span>
  </div>

  <div class="divider-label">Privacy</div>
  <div class="form-field"><label>Last seen</label><select id="prvLastSeen">${privOpts(p.last_seen)}</select></div>
  <div class="form-field"><label>Profile photo</label><select id="prvPic">${privOpts(p.profile_pic)}</select></div>
  <div class="form-field"><label>Status</label><select id="prvStatus">${privOpts(p.status)}</select></div>
  <div class="form-field"><label>About</label><select id="prvAbout">${privOpts(p.about)}</select></div>
  <button class="btn btn-full btn-secondary" onclick="savePrivacy()">🔒 Save privacy</button>

  <div class="divider-label">Security</div>
  <div class="settings-row" onclick="toggle2FA()">
    <span class="sr-ico">🔐</span>
    <span class="sr-label">Two-Factor Authentication</span>
    <span class="sr-sub">${ME.two_fa_enabled ? 'ENABLED ✔ — tap to disable' : 'OFF — tap to enable'}</span>
  </div>

  <div class="divider-label">Automation</div>
  <div class="form-field"><label>Auto-reply (jab offline ho)</label>
    <div class="switch"><input type="checkbox" id="setAutoReplyOn" ${ME.auto_reply_enabled ? 'checked' : ''}><label class="slider" for="setAutoReplyOn" onclick="event.preventDefault();toggleAutoReply()"></label></div>
  </div>
  <div class="form-field"><label>Auto-reply message</label><input id="setAutoReplyMsg" value="${esc(ME.auto_reply_message || '')}"></div>
  <button class="btn btn-full btn-secondary" onclick="saveAutoReply()">🤖 Save auto-reply</button>

  <div class="divider-label">Data</div>
  <div class="settings-row" onclick="downloadBackup()">
    <span class="sr-ico">📦</span><span class="sr-label">Export backup (JSON)</span><span class="sr-sub">Messages, groups, stories, polls</span>
  </div>

  <div class="divider-label">Account</div>
  <div class="settings-row" onclick="logout()">
    <span class="sr-ico">🚪</span><span class="sr-label">Logout</span><span class="sr-sub">${esc(ME.email || '')}</span>
  </div>
  <div class="mt-16"></div>`;
  openModal('settingsModal');
}

function privOpts(cur) {
  const opts = [['everyone', 'Everyone'], ['contacts', 'My contacts'], ['nobody', 'Nobody']];
  return opts.map(o => `<option value="${o[0]}" ${cur === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('');
}

async function updateProfile() {
  const fd = new FormData();
  fd.append('username', $('setUsername').value.trim());
  fd.append('bio', $('setBio').value.trim());
  fd.append('phone', $('setPhone').value.trim());
  const av = $('setAvatar').files ? $('setAvatar').files[0] : null;
  if (av) fd.append('profile', av);
  try {
    const data = await api('/api/profile', { method: 'POST', form: fd });
    ME = data.user;
    updateAdminOnlyUI();
    toast('💾 Profile saved!', 'success');
    renderChatList();
  } catch (e) { toast(e.message, 'error'); }
}

function toggleTheme() {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('csk4_theme', dark ? 'dark' : 'light');
  openSettings();
  toast(dark ? '🌙 Dark mode ON' : '☀️ Light mode ON', 'info', 1400);
}

async function savePrivacy() {
  try {
    const data = await api('/api/privacy', { method: 'POST', body: {
      last_seen: $('prvLastSeen').value,
      profile_pic: $('prvPic').value,
      status: $('prvStatus').value,
      about: $('prvAbout').value
    } });
    ME.privacy = data.privacy || ME.privacy;
    toast('🔒 Privacy saved!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function toggle2FA() {
  try {
    if (ME.two_fa_enabled) {
      if (!confirm('2FA disable karein?')) return;
      await api('/api/2fa/disable', { method: 'POST', body: {} });
      ME.two_fa_enabled = false;
      toast('2FA disabled', 'info');
      openSettings();
    } else {
      const data = await api('/api/2fa/enable', { method: 'POST', body: {} });
      /* Show QR code in a new tab so the user can scan it with Google Authenticator / Authy */
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`
          <div style="font-family:sans-serif;text-align:center;padding:24px;">
            <h2>C$K4 Chat — 2FA Setup</h2>
            <p>Google Authenticator ya Authy app se yeh QR code scan karein:</p>
            <img src="${data.qr}" style="width:220px;height:220px;" />
            <p>Ya manually yeh secret add karein:</p>
            <code style="font-size:16px;background:#eee;padding:6px 10px;border-radius:6px;">${data.secret}</code>
          </div>`);
      } else {
        toast('⚠️ Popup blocked — allow popups aur dobara try karein', 'error', 4000);
        return;
      }
      const code = prompt('QR scan karne ke baad app me jo 6-digit code aaya, wo yahan likhein:');
      if (!code) { toast('2FA setup cancel ho gaya', 'info'); openSettings(); return; }
      await api('/api/2fa/verify-enable', { method: 'POST', body: { code: code.trim() } });
      ME.two_fa_enabled = true;
      toast('🔐 2FA enabled ✅', 'success');
      openSettings();
    }
  } catch (e) { toast(e.message, 'error'); openSettings(); }
}

async function toggleAutoReply() {
  const on = !$('setAutoReplyOn').checked;
  $('setAutoReplyOn').checked = on;
  await saveAutoReply();
}

async function saveAutoReply() {
  try {
    const enabled = $('setAutoReplyOn').checked;
    const msg = $('setAutoReplyMsg').value.trim();
    await api('/api/auto-reply', { method: 'POST', body: { enabled, message: msg } });
    ME.auto_reply_enabled = !!enabled;
    ME.auto_reply_message = msg;
    toast(enabled ? '🤖 Auto-reply ON' : 'Auto-reply OFF', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

function downloadBackup() {
  fetch('/api/backup', { headers: { 'Authorization': 'Bearer ' + TOKEN } })
    .then(r => r.json())
    .then(bk => {
      const blob = new Blob([JSON.stringify(bk, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `csk4-backup-${ME.username}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('📦 Backup downloaded!', 'success');
    })
    .catch(e => toast('Backup failed: ' + e.message, 'error'));
}

async function logout() {
  if (!confirm('🚪 Logout karein?')) return;
  try { await api('/api/logout', { method: 'POST', body: {} }); } catch {}
  if (socket) { try { socket.disconnect(); } catch {} socket = null; }
  localStorage.removeItem('csk4_token');
  TOKEN = '';
  ME = null;
  location.reload();
}

/* ---------------- BOOT ---------------- */
async function boot() {
  /* auto-login if token saved */
  if (TOKEN) {
    try {
      ME = (await api('/api/me')).user;
      enterApp();
      return;
    } catch (e) {
      TOKEN = '';
      localStorage.removeItem('csk4_token');
    }
  }
  $('authScreen').classList.remove('hidden');
}

/* Request notifications permission when user interacts */
document.addEventListener('click', function askNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  document.removeEventListener('click', askNotifPerm);
}, { once: true });

/* keyboard: Esc se modals close */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      if (m.id !== 'callModal' && m.id !== 'storyViewer') m.classList.remove('open');
    });
  }
});

window.addEventListener('DOMContentLoaded', (e) => boot());

/* ============================================================
   Part 4: MOBILE RESPONSIVE ENHANCEMENTS (v5.1) — M1 to M10
   Har mobile screen par auto-adjust + touch UX
   ============================================================ */
(function () {
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  const isTouch = () => ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  /* M1: sidebar ↔ chat pane sync (WhatsApp-style) */
  function syncMobileLayout() {
    const c = $('appContainer'); if (!c) return;
    const chatActive = !($('chatUI') && $('chatUI').classList.contains('hidden'));
    if (isMobile()) c.classList.toggle('chat-open', !!chatActive);
    else c.classList.add('chat-open');
  }

  /* M2: resize/orientation par re-sync + messages bottom scroll */
  let rszT;
  window.addEventListener('resize', () => {
    syncMobileLayout();
    clearTimeout(rszT);
    rszT = setTimeout(() => { if (typeof scrollMsgsBottom === 'function' && !$('chatUI')?.classList.contains('hidden')) scrollMsgsBottom(false); }, 150);
  });
  window.addEventListener('orientationchange', () => {
    setTimeout(() => { syncMobileLayout(); if (typeof scrollMsgsBottom === 'function') scrollMsgsBottom(false); }, 300);
  });

  /* M3: message input focus (keyboard kholne par) → messages bottom */
  document.addEventListener('focusin', (e) => {
    if (e.target && (e.target.id === 'messageInput' || e.target.id === 'authEmail' || e.target.id === 'authPassword')) {
      setTimeout(() => { if (typeof scrollMsgsBottom === 'function' && !$('chatUI')?.classList.contains('hidden')) scrollMsgsBottom(false); }, 300);
    }
  });

  /* M4: tap outside → emoji/attach/chat menus band */
  document.addEventListener('click', (e) => {
    ['emojiPicker', 'attachMenu', 'chatMenu'].forEach(id => {
      const m = $(id); if (!m || !m.classList.contains('open')) return;
      const btns = document.querySelectorAll('[onclick*="toggleEmojiPicker"],[onclick*="toggleAttachMenu"],[onclick*="toggleChatMenu"]');
      let onBtn = false;
      btns.forEach(b => { if (b.contains(e.target)) onBtn = true; });
      if (!onBtn && !m.contains(e.target)) m.classList.remove('open');
    });
  });

  /* M5: swipe-back gesture (chat se sidebar wapas) */
  let touchX = 0, touchY = 0, tracking = false;
  const chatArea = document.querySelector('.chat-area');
  if (chatArea) {
    chatArea.addEventListener('touchstart', (e) => {
      if (!isMobile() || !e.touches[0]) return;
      touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    chatArea.addEventListener('touchend', (e) => {
      if (!tracking || !e.changedTouches[0]) { tracking = false; return; }
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      tracking = false;
      if (dx > 60 && Math.abs(dy) < 40 && touchX < 90 && typeof closeChat === 'function') {
        try { navigator.vibrate && navigator.vibrate(15); } catch (_) {}
        closeChat();
      }
    }, { passive: true });
  }

  /* M6: visualViewport — mobile keyboard kholne par height adjust */
  if (window.visualViewport) {
    let vvT;
    window.visualViewport.addEventListener('resize', () => {
      const app = $('app'); if (!app) return;
      app.style.height = window.visualViewport.height + 'px';
      clearTimeout(vvT);
      vvT = setTimeout(() => { if (typeof scrollMsgsBottom === 'function' && !$('chatUI')?.classList.contains('hidden')) scrollMsgsBottom(false); }, 120);
    });
  }

  /* M7: double-tap zoom prevent (inputs/textarea exclude) */
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const now = Date.now();
    if (now - lastTap < 320) {
      e.preventDefault();
      try { navigator.vibrate && navigator.vibrate(10); } catch (_) {}
    }
    lastTap = now;
  }, { passive: false });

  /* M8: long-press on message → contextmenu (reply/copy menu) */
  let lpTimer = null;
  document.addEventListener('touchstart', (e) => {
    if (!isTouch() || !e.touches[0]) return;
    const msgEl = e.target.closest ? e.target.closest('.message') : null;
    if (!msgEl) return;
    lpTimer = setTimeout(() => {
      try { navigator.vibrate && navigator.vibrate(20); } catch (_) {}
      msgEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }));
    }, 500);
  }, { passive: true });
  document.addEventListener('touchmove', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });
  document.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } }, { passive: true });

  /* M9: iOS auto-zoom fix — computed font-size < 16px → 16px */
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || !t.tagName) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(t.tagName) < 0) return;
    try {
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (fs && fs < 16) t.style.fontSize = '16px';
    } catch (_) {}
  });

  /* M10: modal open → body scroll lock (background scroll rokne ke liye) */
  const lockObserver = new MutationObserver(() => {
    const anyOpen = document.querySelector('.modal-overlay.open');
    const storyOpen = document.querySelector('#storyViewer.open');
    const callOpen = document.querySelector('#callModal.open, #incomingCall.show');
    const shouldLock = !!(anyOpen || storyOpen || callOpen);
    document.body.style.overflow = shouldLock ? 'hidden' : '';
  });
  function attachLockObserver() {
    document.querySelectorAll('.modal-overlay').forEach(mo => lockObserver.observe(mo, { attributes: true, attributeFilter: ['class'] }));
  }
  attachLockObserver();
  window.addEventListener('DOMContentLoaded', () => attachLockObserver());

  /* Boot: initial sync */
  syncMobileLayout();
  setTimeout(syncMobileLayout, 800);
  console.log('[C$K4 v5.1] Mobile enhancements active');
})();


/* ---------------- PULL-TO-REFRESH (mobile, smart — no full page reload) ---------------- */
(function setupPullToRefresh() {
  const REFRESH_THRESHOLD = 70;
  const containers = ['chatList', 'messagesContainer'];

  async function doSmartRefresh(id) {
    if (id === 'chatList') {
      await Promise.all([loadUsers(), loadGroups(), loadChannels()]);
    } else if (id === 'messagesContainer') {
      if (currentChatUser) await loadMessages(currentChatUser.id);
      else if (currentGroup) await loadGroupMessages(currentGroup.id);
      else if (currentChannel) await loadChannelMessages(currentChannel.id);
    }
  }

  containers.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    let startY = 0, pulling = false, refreshing = false, indicator = null;

    function ensureIndicator() {
      if (indicator) return indicator;
      indicator = document.createElement('div');
      indicator.className = 'ptr-indicator';
      indicator.style.cssText = 'text-align:center;font-size:12px;color:var(--text-secondary);padding:8px;display:flex;align-items:center;justify-content:center;gap:6px;';
      indicator.innerHTML = '<span class="ptr-icon" style="display:inline-block;transition:transform .15s;">↓</span><span class="ptr-label">Refresh ke liye chhodein</span>';
      el.prepend(indicator);
      return indicator;
    }

    el.addEventListener('touchstart', (e) => {
      if (refreshing) { pulling = false; return; }
      if (el.scrollTop <= 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      } else {
        pulling = false;
      }
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!pulling || refreshing) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 10 && el.scrollTop <= 0) {
        const ind = ensureIndicator();
        const icon = ind.querySelector('.ptr-icon');
        const label = ind.querySelector('.ptr-label');
        if (diff > REFRESH_THRESHOLD) {
          icon.style.transform = 'rotate(180deg)';
          label.textContent = 'Chhod dein — refresh hoga';
        } else {
          icon.style.transform = 'rotate(0deg)';
          label.textContent = 'Refresh ke liye chhodein';
        }
      }
    }, { passive: true });

    el.addEventListener('touchend', async (e) => {
      if (!pulling || refreshing) { pulling = false; return; }
      pulling = false;
      const diff = (e.changedTouches[0].clientY - startY);
      if (diff > REFRESH_THRESHOLD && el.scrollTop <= 0) {
        refreshing = true;
        const ind = ensureIndicator();
        ind.innerHTML = '<span class="ptr-icon" style="display:inline-block;animation:ptrSpin .7s linear infinite;">↻</span><span class="ptr-label">Refresh ho raha hai…</span>';
        try {
          await doSmartRefresh(id);
        } catch {}
        if (indicator) { indicator.remove(); indicator = null; }
        refreshing = false;
      } else if (indicator) {
        indicator.remove(); indicator = null;
      }
    }, { passive: true });
  });
})();
