/* ============================================================
   C$K4 Chat v5.2 — script.js (Client)
   50 Features | WhatsApp-style UI
   ============================================================ */

'use strict';

/* ---------------- STATE ---------------- */
let TOKEN = localStorage.getItem('csk4_token') || '';
let ME = null;
let socket = null;
let currentChatUser = null;      // direct chat target {id, username, ...}
let currentGroup = null;         // group chat target
let currentChannel = null;       // channel target
let messages = [];               // currently loaded direct messages
let groupMessages = [];
let users = [];                  // all users cache
let groups = [];
let channels = [];
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
  'objects': ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📞','☎️','📟','📠','📺','📻','🎙️','⏰','⌛','⏳','📡','🔋','🔌','💡','🔦','