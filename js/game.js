const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// ✨ إنشاء متحكم رئيسي للصوت (Master Volume)
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);

// ✨ استرجاع الإعدادات من الذاكرة (أو وضع الافتراضي)
let isMuted = localStorage.getItem('spy_muted') === 'true';
let isVibrationEnabled = localStorage.getItem('spy_vibe_enabled') !== 'false';
let globalVolume = localStorage.getItem('spy_volume') ? parseFloat(localStorage.getItem('spy_volume')) : 0.4;
let globalVibrationLevel = localStorage.getItem('spy_vibe_level') ? parseInt(localStorage.getItem('spy_vibe_level')) : 20;

// تطبيق مستوى الصوت فوراً عند التشغيل
masterGain.gain.value = isMuted ? 0 : globalVolume;
let isDarkMode = true;

// --- Premium Logic ---
let isPremium = false;

// --- إعدادات النسخة المجانية ---
// اكتب هنا أسماء الفئات التي تريدها أن تكون مجانية (مفتوحة للجميع)
// أي فئة غير مكتوبة هنا ستكون مغلقة بقفل 🔒
const FREE_CATEGORIES = ["خضروات", "فواكه", "عملات", "حيوانات", "عواصم", "دول", "مهن"];

// 💡 مفتاح التحكم في نظام اللعب الجماعي (أونلاين) 💡
// true = يجب أن يملك جميع اللاعبين النسخة الكاملة للعب الفئات المدفوعة.
// false = المضيف فقط يحتاج النسخة الكاملة، والبقية يلعبون مجاناً.
const STRICT_PREMIUM_MODE = false;

// التحقق عند تشغيل اللعبة
if (localStorage.getItem('isPremium') === 'true') {
  isPremium = true;
}

// دالة يستدعيها الأندرويد بصمت عند فتح التطبيق للتحقق من المشتريات
window.syncPremiumState = function (status) {
  isPremium = status === true; // ضمان أن القيمة هي Boolean

  if (isPremium) {
    // اللاعب يمتلك اللعبة: نحفظها في الذاكرة لسرعة الفتح مستقبلاً
    localStorage.setItem("isPremium", "true");
  } else {
    // اللاعب لا يمتلك اللعبة (أو قام بعمل Refund):
    localStorage.removeItem("isPremium");

    // 🛡️ طبقة الحماية: تنظيف أي فئة مدفوعة كان قد اختارها سابقاً
    state.allowedCategories = state.allowedCategories.filter(cat => FREE_CATEGORIES.includes(cat));
    if (state.selectedCategory !== 'عشوائي' && !FREE_CATEGORIES.includes(state.selectedCategory)) {
      state.selectedCategory = 'عشوائي';
    }
  }

  updatePremiumUI(); // إظهار/إخفاء زر الشراء

  // إعادة رسم الفئات فوراً لإغلاق/فتح الأقفال بصمت
  if (typeof renderCategorySelectionGrid === 'function') renderCategorySelectionGrid();
  if (typeof renderActiveCategoryGrid === 'function') renderActiveCategoryGrid();
  if (typeof updateCurrentCategoryUI === 'function') updateCurrentCategoryUI();
};

// دالة لتحديث واجهة المستخدم بناءً على حالة الشراء
function updatePremiumUI() {
  const btn = document.getElementById('btn-premium-offer');
  const restoreBtn = document.getElementById('btn-restore-purchases'); // ✅ جلب زر الاسترجاع

  // إذا اشترى النسخة، نخفي الزرين تماماً
  if (isPremium) {
    if (btn) btn.classList.add('hidden');
    if (restoreBtn) restoreBtn.classList.add('hidden');
  } else {
    if (btn) btn.classList.remove('hidden');
    if (restoreBtn) restoreBtn.classList.remove('hidden');
  }
}

// --- Online Mode Global Variables ---
let isOnline = false;
let myPeer = null;
let myConn = null;
let hostConnections = {};
let myPlayerId = null;
let roomCode = null;
let isHost = false;
let onlinePlayers = [];
let heartbeatInterval = null; // مؤقت نبضات القلب
let lastHostPing = 0; // آخر مرة استلم اللاعب إشارة من المضيف
let amIReady = false; // هل أنا جاهز؟
let isGameStarted = false; // هل بدأت اللعبة فعلياً؟
let votesReceived = 0; // للمضيف: عدد الأصوات المستلمة
let revealReadyCount = 0; // عداد اللاعبين الجاهزين بعد الكشف
//let myVoteTarget = null; // للاعب: لمن صوتت

// --- Mode Selection ---
// هذه الدالة ستكون نقطة البداية الجديدة بدلاً من الشاشة الرئيسية مباشرة
function initApp() {
  // ✅ استئناف الصوت عند أول تفاعل
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // إخفاء كل الشاشات وإظهار الشاشة الرئيسية الموحدة
  document.querySelectorAll('#app > div').forEach(div => div.classList.add('hidden'));
  showScreen('start');
}
// استدعاء هذه الدالة عند تحميل الصفحة بدلاً من showScreen('start')
window.addEventListener('load', () => {
  const intro = document.getElementById('intro-layer');
  const game = document.getElementById('game-container');

  // محاكاة وقت التحميل (أو وقت الانترو) - مثلاً 3 ثواني
  setTimeout(() => {

    // 1. إخفاء الانترو (Fade Out)
    intro.style.transition = "opacity 0.5s";
    intro.style.opacity = "0";

    // 2. بعد انتهاء حركة الاختفاء (نصف ثانية)
    setTimeout(() => {
      intro.remove(); // نحذف الانترو من الذاكرة

      // 3. ✨ إظهار اللعبة الآن ✨
      game.style.display = "block";

      // (اختياري) حركة ظهور ناعمة للعبة
      game.style.opacity = "0";
      game.style.transition = "opacity 0.5s";

      // طلب إطار رسم جديد لضمان تفعيل الترانزيشن
      requestAnimationFrame(() => {
        game.style.opacity = "1";
      });

    }, 500); // نفس مدة الـ transition

  }, 3000);

  // ... (الكود السابق الموجود في load)
  initApp();
  updatePremiumUI();
});

function selectMode(mode) {
  if (mode === 'offline') {
    isOnline = false;
    showScreen('setup'); // الدخول المباشر للإعدادات
    updateCurrentCategoryUI(); // تحديث النص
  } else {
    isOnline = true;
    showOnlineSetup();
  }
}

// تعبئة شبكة الصور في شاشات الإعداد
function renderAvatarGrid(containerId, inputId) {
  const container = document.getElementById(containerId);
  const input = document.getElementById(inputId);

  if (!container) {
    console.error(`Error: Element #${containerId} not found!`);
    return;
  }

  if (!input) {
    console.error(`Error: Element #${inputId} not found!`);
    return;
  }

  container.innerHTML = '';

  // نختار صورة عشوائية كافتراضي
  const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
  input.value = randomAvatar;

  avatars.forEach(av => {
    const btn = document.createElement('button');
    // تنسيق الزر: كبير وواضح
    btn.className = `text-3xl w-12 h-12 m-1 rounded-full bg-white/10 border border-white/20 hover:bg-white/30 transition-all flex items-center justify-center ${av === randomAvatar ? 'ring-2 ring-indigo-500 bg-indigo-500/30 scale-110' : ''}`;
    btn.innerText = av;

    // عند الضغط
    btn.onclick = (e) => {
      e.preventDefault(); // منع أي سلوك افتراضي
      // إزالة التحديد من الكل
      container.querySelectorAll('button').forEach(b => {
        b.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-500/30', 'scale-110');
      });
      // تحديد هذا الزر
      btn.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-500/30', 'scale-110');

      input.value = av;

      // تشغيل اهتزاز خفيف
      if (typeof triggerVibrate === 'function') triggerVibrate(10);
    };

    container.appendChild(btn);
  });
}

// دالة لتحديث الوقت في الأونلاين (للمضيف)
function updateOnlineTime(val) {
  state.timer = parseInt(val);
  state.initialTimer = parseInt(val);
  document.getElementById('online-time-display').innerText = formatTimeLabel(state.timer);

  // إرسال التحديث للجميع فوراً ليروا الوقت يتغير
  if (isHost) {
    broadcast({ type: 'SYNC_SETTINGS', timer: state.timer });
  }
}

function showOnlineSetup() {
  // استدعاء رسم الشبكة للمضيف
  renderAvatarGrid('host-avatar-grid', 'host-selected-avatar');
  showScreen('online-setup');
}

function showJoinScreen() {
  // استدعاء رسم الشبكة للاعب
  renderAvatarGrid('client-avatar-grid', 'client-selected-avatar');
  showScreen('join-room');
}

// --- Online Networking Logic ---

// توليد كود عشوائي للغرفة
function generateRoomCode() {
  //numbers and letters
  //return Math.random().toString(36).substring(2, 6).toUpperCase();
  //numbers only
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 1. إعداد المضيف (Host)
function initHost() {
  const avatar = document.getElementById('host-selected-avatar').value;

  isHost = true;
  myPlayerId = 0;
  roomCode = generateRoomCode();
  isGameStarted = false;

  myPeer = new Peer(`spygame-${roomCode}`, {
    debug: 0,
    serialization: 'json'
  });

  myPeer.on('open', (id) => {
    // تعيين اسم تلقائي للمضيف
    const autoName = "المحقق 1";

    onlinePlayers = [{
      id: 0, name: autoName, avatar: avatar, isHost: true, isReady: true, points: 0, lastSeen: Date.now()
    }];

    // 1. إضافة حالة للتاريخ لمنع الخروج المباشر بزر الرجوع
    history.pushState(null, document.title, location.href);

    // 2. الاستماع لحدث الرجوع
    window.onpopstate = function () {
      tryToExit(); // هذه الدالة تظهر النافذة المخصصة الجميلة
      // إعادة وضع القفل في حال قرر المستخدم البقاء
      history.pushState(null, document.title, location.href);
    };

    updateLobbyUI();
    showScreen('online-lobby');
    document.getElementById('host-controls').classList.remove('hidden');
    document.getElementById('client-controls').classList.add('hidden');
    document.getElementById('lobby-room-code').innerText = roomCode;
    updateOnlineTime(60);

    // --- تشغيل نظام نبضات القلب (Heartbeat) ---
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    // مراقبة الاتصال بذكاء
    heartbeatInterval = setInterval(() => {
      broadcast({ type: 'PING' });

      const now = Date.now();
      let hasUpdates = false; // لتجنب البث الزائد إذا لم يتغير شيء (اختياري، لكننا سنبث كل ثانية للأمان)

      // التكرار العكسي للحذف الآمن
      for (let i = onlinePlayers.length - 1; i >= 0; i--) {
        const p = onlinePlayers[i];
        if (p.isHost) continue;

        const diff = now - p.lastSeen;

        // 1. تحديد حالة الاتصال وتسجيلها في كائن اللاعب
        // هذه الخاصية ستنتقل للأعضاء الآخرين عندما نبث القائمة
        if (diff > 10000) {
          p.connectionState = 'lost'; // منقطع
        } else if (diff > 5000) {
          p.connectionState = 'weak'; // ضعيف
        } else {
          p.connectionState = 'good'; // جيد
        }

        // 2. الطرد النهائي (بعد 60 ثانية)
        if (diff >= 15000) {
          handleDisconnect(p.peerId);
          hasUpdates = true;
        }
      }

      // ✅✅✅ الإضافة الحاسمة هنا ✅✅✅
      // يجب إرسال القائمة المحدثة (التي تحتوي على حالات الاتصال) لجميع الأعضاء كل ثانية
      broadcast({ type: 'LOBBY_UPDATE', players: onlinePlayers });

      // تحديث واجهة المضيف
      updateLobbyUI();

    }, 1000);
    // ------------------------------------------
  });

  myPeer.on('connection', (conn) => {
    conn.on('data', (data) => handleHostData(data, conn));

    // التعامل مع الإغلاق الرسمي (إن وجد)
    conn.on('close', () => handleDisconnect(conn.peer));
  });

  myPeer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      showAlert("كود الغرفة مستخدم بالفعل، حاول مرة أخرى.");
    }
  });

  updateOnlineSettingsUI();
}

function handleDisconnect(peerId) {
  const pIdx = onlinePlayers.findIndex(p => p.peerId === peerId);

  if (pIdx > -1) {
    const leaverName = onlinePlayers[pIdx].name;

    // إزالة اللاعب
    onlinePlayers.splice(pIdx, 1);

    // محاولة تنظيف الاتصال إن وجد
    // ملاحظة: قد لا يكون الاتصال موجوداً إذا انقطع فجأة
    const connKey = Object.keys(hostConnections).find(key => hostConnections[key]?.peer === peerId);
    if (connKey) delete hostConnections[connKey];

    if (isGameStarted) {
      // إلغاء اللعبة إذا كانت جارية
      broadcast({ type: 'GAME_ABORTED', reason: `اللاعب (${leaverName}) فقد الاتصال! انتهت اللعبة.` });
      abortGame(`اللاعب (${leaverName}) فقد الاتصال! 🔌`);
    } else {
      // تحديث اللوبي
      updateLobbyUI();
      broadcast({ type: 'LOBBY_UPDATE', players: onlinePlayers });
    }
  }
}

function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  const avatar = document.getElementById('client-selected-avatar').value;

  if (!code) return showAlert("أدخل كود الغرفة!");

  isHost = false;
  roomCode = code;
  amIReady = false;

  myPeer = new Peer(undefined, { debug: 0, serialization: 'json' });

  myPeer.on('open', (id) => {
    const conn = myPeer.connect(`spygame-${code}`, { serialization: 'json' });

    conn.on('open', () => {
      myConn = conn;

      // إرسال طلب الانضمام (وننتظر رسالة WELCOME من المضيف للدخول)
      myConn.send({
        type: 'JOIN',
        avatar: avatar,
        isPremium: isPremium
      });

      // ✨ تم مسح كود الدخول للوبي الوهمي من هنا ✨
    });

    history.pushState(null, document.title, location.href);
    window.onpopstate = function () {
      tryToExit();
      history.pushState(null, document.title, location.href);
    };

    conn.on('data', (data) => handleClientData(data));

    conn.on('close', () => {
      // نتأكد أن الاتصال لم يتم تصفيره مسبقاً (مثل حالة الرفض بسبب الصورة)
      if (isOnline && myConn !== null) {
        abortGame("أغلق المضيف الغرفة! 🛑");
      }
    });

    conn.on('error', (err) => {
      console.error("Connection Error:", err);
      showAlert("فشل الاتصال بالغرفة. تأكد من الكود!");
    });
  });

  myPeer.on('error', (err) => {
    let msg = "حدث خطأ غير متوقع";
    if (err.type === 'peer-unavailable') msg = "الغرفة غير موجودة! تأكد من الكود.";
    if (err.type === 'network') msg = "مشكلة في الاتصال بالإنترنت.";
    showAlert(msg);
  });
}

// --- Data Handling (The Brain) ---

// أ) معالجة البيانات عند المضيف
function handleHostData(data, conn) {
  let player = null;
  if (conn) {
    player = onlinePlayers.find(p => p.peerId === conn.peer);
    if (player) {
      player.lastSeen = Date.now();
    }
  }

  if (data.type === 'PONG') {
    return; // مجرد إشارة بقاء، لا تفعل شيئاً آخر
  }

  if (data.type === 'JOIN') {
    // 1. التحقق: هل اللعبة بدأت؟ (القفل)
    if (isGameStarted) {
      conn.send({ type: 'ERROR', message: 'اللعبة بدأت بالفعل! لا يمكن الانضمام الآن 🚫' });
      setTimeout(() => conn.close(), 500);
      return;
    }

    // 2. التحقق: الحد الأقصى 15 لاعب
    if (onlinePlayers.length >= 15) {
      conn.send({ type: 'ERROR', message: 'الغرفة ممتلئة! (الحد الأقصى 15 لاعب) 🌕' });
      setTimeout(() => conn.close(), 500);
      return;
    }

    // ✨ التحقق من تكرار الأفاتار (أونلاين) ✨
    const requestedAvatar = data.avatar || "👤";
    const takenAvatars = onlinePlayers.map(p => p.avatar);

    // إذا كانت الصورة التي طلبها اللاعب مأخوذة
    if (takenAvatars.includes(requestedAvatar)) {
      // رفض الدخول وإرسال رسالة تنبيه للاعب
      conn.send({
        type: 'JOIN_REJECTED',
        reason: 'AVATAR_TAKEN',
        message: 'هذه الصورة مستخدمة 😅! الرجاء اختيار صورة أخرى.'
      });
      // إغلاق الاتصال الحالي حتى يحاول مجدداً
      setTimeout(() => conn.close(), 500);
      return; // إيقاف إكمال عملية الدخول
    }

    // 1. توليد اسم تلقائي فريد
    const newName = generateAutoName();

    const newId = onlinePlayers.length;

    const newPlayer = {
      id: newId,
      name: newName,
      avatar: requestedAvatar,
      peerId: conn.peer,
      isHost: false,
      isReady: false,
      isPremium: data.isPremium || false, // 👈 هذا هو السطر الناقص (المضيف يسجل حالة اللاعب في دفتره)
      points: 0,
      lastSeen: Date.now()
    };

    onlinePlayers.push(newPlayer);
    hostConnections[newId] = conn;

    // --- الإصلاح هنا: تحديث واجهة المضيف فوراً ---
    updateLobbyUI();

    // بما أن اللاعب الجديد يدخل وهو (غير جاهز)، هذا السطر سيقوم بتعطيل زر البدء فوراً
    checkAllReady();

    conn.send({
      type: 'WELCOME',
      id: newId,
      name: newName,
      players: onlinePlayers,
      timer: state.timer
    });

    // إخبار بقية اللاعبين بالتحديث
    broadcast({ type: 'LOBBY_UPDATE', players: onlinePlayers });

    // إرسال إعدادات الوقت للاعب الجديد
    conn.send({ type: 'SYNC_SETTINGS', timer: state.timer });

  } else if (data.type === 'REVEAL_READY') {
    revealReadyCount++;
    updateHostWaitingScreen();

    // --- معالجة طلب تغيير الاسم ---
  } else if (data.type === 'REQUEST_RENAME') {
    const requestedName = data.newName.trim();
    // ✨ تجهيز الاسم للمقارنة ✨
    const normalizedRequest = normalizeArabic(requestedName);

    // التحقق من صحة الاسم وتكراره
    if (!requestedName || requestedName.length > 15) {
      conn.send({ type: 'RENAME_ERROR', message: 'الاسم غير صالح (طويل جداً أو فارغ)' });
    } else if (onlinePlayers.some(p => normalizeArabic(p.name) === normalizedRequest)) { // ✨ المقارنة الذكية ✨
      conn.send({ type: 'RENAME_ERROR', message: 'الاسم مأخوذ أو مشابه لاسم موجود! اختر غيره.' });
    } else {
      // الاسم متاح -> التحديث
      if (player) {
        player.name = requestedName; // نحفظ الاسم بالشكل الأصلي
        updateLobbyUI();
        broadcast({ type: 'LOBBY_UPDATE', players: onlinePlayers });
        conn.send({ type: 'RENAME_SUCCESS' });
      }
    }
  } else if (data.type === 'PANIC_TRIGGER') {
    // ✅✅✅ تحديد اسم اللاعب الذي طلب ✅✅✅
    const triggerName = player ? player.name : "الضايع";

    // إرسال الاسم للجميع ليظهر لديهم
    broadcast({ type: 'GAME_PHASE', phase: 'panic', panicPlayerName: triggerName });

    // تنفيذ المرحلة عند المضيف أيضاً
    executePanicPhase(triggerName);

  } else if (data.type === 'GUESS_ATTEMPT') {
    // المضيف استلم تخمين الضايع
    processGuessVerification(data.word);

  } else if (data.type === 'PANIC_TIMEOUT') {
    // الضايع انتهى وقته -> المحققون فازوا
    handlePanicTimeout();
  } else if (data.type === 'PLAYER_LEFT') {
    // وصلتنا رسالة أن اللاعب خرج بإرادته -> احذفه فوراً
    handleDisconnect(conn.peer);
  } else if (data.type === 'READY_STATUS') {
    const p = onlinePlayers.find(player => player.peerId === conn.peer);
    if (p) {
      p.isReady = data.isReady;

      // تحديث واجهة المضيف
      updateLobbyUI();

      // إخبار الجميع بالتحديث (لكي يظهر الصح الأخضر عندهم)
      broadcast({ type: 'LOBBY_UPDATE', players: onlinePlayers });

      // التحقق من اكتمال الجاهزية
      checkAllReady();
    }
  } else if (data.type === 'REQUEST_NEXT_TURN') {
    hostPickNextTurn();
  } else if (data.type === 'VOTE') {
    votesReceived++;

    if (!state.votesHistory) state.votesHistory = [];
    state.votesHistory.push({ voter: data.voterId, target: data.targetId });

    if (votesReceived >= onlinePlayers.length) {
      calculateOnlineResults();
    }
  }
}

// ب) معالجة البيانات عند اللاعب
function handleClientData(data) {
  // إعادة لون عداد الوقت للطبيعي (في حال كان أصفر بسبب التحذير)
  const timerEl = document.getElementById('online-time-display');
  if (timerEl) {
    timerEl.classList.remove('text-yellow-500', 'animate-pulse');
    if (state.timer) timerEl.innerText = formatTimeLabel(state.timer);
  }

  // --- الرد على نبضات القلب ---
  if (data.type === 'PING') {
    if (myConn && myConn.open) {
      myConn.send({ type: 'PONG' });
      lastHostPing = Date.now(); // تسجيل أن المضيف موجود
    }
    return;
  }

  // --- استقبال الترحيب (الدخول الناجح) ---
  if (data.type === 'WELCOME') {
    myPlayerId = data.id;
    // حفظنا الاسم والبيانات
    onlinePlayers = data.players;
    state.timer = data.timer;
    state.initialTimer = data.timer;

    // الآن فقط نظهر الشاشة
    showScreen('online-lobby');
    document.getElementById('host-controls').classList.add('hidden');
    document.getElementById('client-controls').classList.remove('hidden');
    document.getElementById('lobby-room-code').innerText = roomCode;
    document.getElementById('online-time-display').innerText = formatTimeLabel(data.timer);

    updateLobbyUI();

    // بدء مراقبة المضيف (Heartbeat listener)
    lastHostPing = Date.now();
    if (heartbeatInterval) clearInterval(heartbeatInterval);

    // ✅✅✅ هذا هو التعديل المطلوب ✅✅✅
    // نستبدل العداد "الكسول" بعداد يقوم بتحديث الواجهة
    heartbeatInterval = setInterval(() => {
      const timeSinceLastPing = Date.now() - lastHostPing;
      const timerEl = document.getElementById('online-time-display');

      // 1. تحديث رسالة التنبيه العلوية
      if (timeSinceLastPing > 5000) {
        if (timerEl) {
          if (timeSinceLastPing < 15000) {
            timerEl.innerText = "⚠️ المضيف لا يستجيب...";
            timerEl.classList.add('text-yellow-500', 'animate-pulse');
          } else {
            abortGame("فقدنا الاتصال بالمضيف نهائياً 🔌");
          }
        }
      }

      // 2. تحديث القائمة لإظهار الأيقونات بجانب الاسم
      updateLobbyUI();

    }, 1000); // الفحص كل ثانية واحدة
    // ✅✅✅ -------------------------- ✅✅✅
  }
  // --- نتائج تغيير الاسم ---
  else if (data.type === 'RENAME_ERROR') {
    showAlert(data.message);
  }
  else if (data.type === 'RENAME_SUCCESS') {
    closeRenameModal(); // إغلاق النافذة بنجاح
  }
  // ... (بقية الشروط: LOBBY_UPDATE, START_GAME, الخ) ...
  else if (data.type === 'LOBBY_UPDATE') { onlinePlayers = data.players; updateLobbyUI(); }
  else if (data.type === 'RETURN_TO_LOBBY') {
    onlinePlayers = data.players;
    updateLobbyUI();

    // إعادة ضبط زر الجاهزية للاعب
    amIReady = false;
    const btn = document.getElementById('btn-client-ready');
    if (btn) {
      btn.innerText = "أنا جاهز! ✅";
      btn.className = "btn-secondary-theme w-full py-5 rounded-2xl font-black text-xl border-emerald-500/50";
    }

    // الانتقال للشاشة
    showScreen('online-lobby');
  }
  else if (data.type === 'ERROR') { showAlert(data.message); showScreen('join-room'); } else if (data.type === 'GAME_ABORTED') {
    // استقبال أمر الإلغاء من المضيف
    abortGame(data.reason || "تم إلغاء اللعبة من قبل المضيف");

  } else if (data.type === 'SYNC_SETTINGS') {
    // تحديث الوقت عند اللاعب
    document.getElementById('online-time-display').innerText = formatTimeLabel(data.timer);
    state.timer = data.timer;
    state.initialTimer = data.timer;

  } else if (data.type === 'JOIN_REJECTED') {
    // ✨ إذا رفض المضيف دخولنا بسبب الصورة ✨
    if (data.reason === 'AVATAR_TAKEN') {
      showAlert(data.message || "الصورة مستخدمة، الرجاء اختيار صورة أخرى.");

      // تصفير الاتصال بحذر لكي لا يظن النظام أن المضيف أغلق الغرفة
      if (myConn) {
        const tempConn = myConn;
        myConn = null; // نجعله null أولاً لمنع دالة abortGame من العمل
        tempConn.close();
      }

      // إعادة تفعيل زر الدخول لكي لا يعلق
      const btn = document.querySelector('#screen-join-room button.btn-gradient');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = "دخول الغرفة ✅";
        btn.classList.remove('opacity-50', 'cursor-not-allowed', 'animate-pulse');
      }
    }
  } else if (data.type === 'START_GAME') {
    // استلام إشارة البدء وبيانات الدور
    state.players = onlinePlayers;
    state.currentRoundCategory = data.category;
    state.secretData = data.secretData;
    state.currentUndercoverData = data.undercoverData;
    state.myRole = data.roleData;
    state.timer = data.timer;
    state.initialTimer = data.timer;
    state.customWords = data.customWords || [];

    // --- استقبال الإعدادات وتطبيقها ---
    if (data.settings) {
      state.panicModeAllowed = data.settings.panicModeAllowed;
      state.guessingEnabled = data.settings.guessingEnabled;
      state.blindModeActive = data.settings.blindModeActive;
      state.hintEnabled = data.settings.hintEnabled;
      state.smartTurnsActive = data.settings.smartTurnsActive;
    }

    // الانتقال لشاشة الكشف
    setupOnlineRevealScreen();

  } else if (data.type === 'SYNC_TIMER') {
    // تحديث العداد
    document.getElementById('game-timer').innerText = data.timeText;
    const progressEl = document.getElementById('timer-progress');
    if (progressEl) progressEl.style.strokeDashoffset = data.offset;

    // --- الإضافة الجديدة: منطق التوتر (آخر 10 ثواني) ---
    const gameScreen = document.getElementById('screen-game');
    const timeLeft = data.seconds; // القيمة التي أرسلناها من المضيف

    if (timeLeft <= 10 && timeLeft > 0) {
      // 1. تشغيل صوت القلب
      playHeartbeatSound();

      // 2. تفعيل تأثير النبض البصري
      gameScreen.classList.add('panic-pulse-active');

      // 3. تسريع النبض كلما قل الوقت (تعديل مدة الأنيميشن)
      // كلما قل الوقت، قلت مدة الأنيميشن (أسرع)
      const speed = Math.max(0.4, timeLeft / 10);
      gameScreen.style.animationDuration = `${speed}s`;

      // اهتزاز خفيف للجهاز مع كل دقة
      if (timeLeft % 2 === 0) triggerVibrate(50);

    } else {
      // إزالة التأثير إذا كان الوقت أكثر من 10 (أو انتهى)
      gameScreen.classList.remove('panic-pulse-active');
      gameScreen.style.animationDuration = '0s'; // إعادة تعيين

      // تشغيل صوت التكتكة العادية إذا لم نكن في وضع التوتر
      if (timeLeft > 10 && timeLeft <= 5) sounds.tick(); // (اختياري: يمكنك حذف هذا السطر لمنع تداخل الأصوات)
    }

  } else if (data.type === 'TURN_UPDATE') {
    updateTurnUI(data.askerId, data.targetId);
  } else if (data.type === 'GAME_PHASE') {
    if (data.phase === 'game') {
      showScreen('game');
      // إخفاء أزرار التحكم بالوقت للاعبين
      document.getElementById('btn-pause').classList.add('hidden');
      // زر "كشفت السالفة" يظهر فقط إذا كنت الضايع ومسموح
      const panicBtn = document.getElementById('btn-panic');
      if (panicBtn) {
        // يظهر فقط إذا كنت أنا الضايع
        if (state.myRole.role === 'out' && state.panicModeAllowed) panicBtn.classList.remove('hidden');
        else panicBtn.classList.add('hidden');
      }

    } else if (data.phase === 'panic') {
      // ✅ تمرير الاسم المستلم من المضيف إلى الدالة
      executePanicPhase(data.panicPlayerName);
    } else if (data.phase === 'caught_guessing') {
      executeCaughtGuessingPhase(data.panicPlayerName);
    } else if (data.phase === 'voting') {
      state.votingMode = 'group';
      showOnlineVotingScreen(); // شاشة تصويت خاصة باللاعب

    } else if (data.phase === 'result') {
      state.lastWinner = data.winner;
      state.secretData = data.secretData;
      state.currentRoles = data.roles;
      state.players = data.players; // تحديث النقاط

      // استخدام votesHistory المرسلة من المضيف لرسم الشبكة
      if (data.votesHistory) state.votesHistory = data.votesHistory;
      showFinalResults(data.winType, data.title);
    }
  }
}

// --- Ready System ---

function updateHostWaitingScreen() {
  // هذه الدالة تعمل فقط للمضيف وعندما يكون في شاشة الانتظار
  const screenReveal = document.getElementById('screen-reveal');
  // نتأكد أن المضيف وصل لمرحلة الانتظار (زر ابدأ الوقت موجود أو حاويته)
  const container = screenReveal.querySelector('.host-wait-container');

  if (container) {
    if (revealReadyCount >= onlinePlayers.length) {
      // الكل جاهز -> عرض زر البدء
      container.innerHTML = `
                <div class="text-6xl mb-6 animate-bounce">✅</div>
                <h1 class="text-2xl font-bold text-center mb-6">الجميع جاهز!</h1>
                <button onclick="hostStartTimer()" class="btn-gradient py-4 px-10 rounded-2xl font-black shadow-lg text-xl">ابدأ الوقت ⏱️</button>
            `;
    } else {
      // ليس الكل جاهزاً بعد -> عرض العداد
      container.innerHTML = `
                <div class="text-6xl mb-6 animate-pulse">⏳</div>
                <h1 class="text-2xl font-bold text-center mb-2">بانتظار جاهزية اللاعبين...</h1>
                <p class="text-theme-muted font-mono text-xl dir-ltr">${revealReadyCount} / ${onlinePlayers.length}</p>
            `;
    }
  }
}

function toggleReady() {
  amIReady = !amIReady;
  const btn = document.getElementById('btn-client-ready');

  if (amIReady) {
    btn.innerText = "في الانتظار... ⏳";
    btn.className = "btn-gradient w-full py-5 rounded-2xl font-black text-xl opacity-80";
  } else {
    btn.innerText = "أنا جاهز! ✅";
    btn.className = "btn-secondary-theme w-full py-5 rounded-2xl font-black text-xl border-emerald-500/50";
  }

  myConn.send({ type: 'READY_STATUS', isReady: amIReady });
}

function checkAllReady() {
  if (!isHost) return;

  const allReady = onlinePlayers.every(p => p.isReady);
  const btnStart = document.getElementById('btn-host-start');

  if (allReady && onlinePlayers.length >= 3) {
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
    btnStart.classList.add('animate-pulse');
    btnStart.innerText = "ابدأ اللعبة! 🚀";
  } else {
    btnStart.disabled = true;
    btnStart.classList.add('opacity-50', 'cursor-not-allowed');
    btnStart.classList.remove('animate-pulse');
    const count = onlinePlayers.length;
    if (count < 3) btnStart.innerText = "بانتظار لاعبين (3+)...";
    else btnStart.innerText = "بانتظار جاهزية الجميع...";
  }
}

let lastLobbyState = "";

function updateLobbyUI() {
  const list = document.getElementById('lobby-players-list');
  const count = document.getElementById('online-count');
  if (!list) return;

  // 1. حساب "بصمة" للحالة الحالية (JSON بسيط)
  // نضمن أننا نحدث الواجهة فقط إذا تغيرت الأسماء، الجاهزية، أو حالة الاتصال
  const currentState = JSON.stringify(onlinePlayers.map(p => ({
    id: p.id,
    name: p.name,
    isReady: p.isReady,
    conn: p.connectionState, // تأكدنا من تضمين حالة الاتصال
    isHost: p.isHost
  })));

  // تحديث العداد دائماً
  count.innerText = onlinePlayers.length;

  // 2. المقارنة: هل تغير شيء فعلاً؟
  // ملاحظة: المضيف يحتاج تحديث فوري لحالة الاتصال، لذا نستثني الشرط للمضيف إذا أردت دقة بالمللي ثانية، 
  // لكن للمستخدم العادي هذا التحسين ممتاز.
  if (currentState === lastLobbyState) return;

  // حفظ الحالة الجديدة
  lastLobbyState = currentState;

  list.innerHTML = '';
  count.innerText = onlinePlayers.length;

  const now = Date.now();

  onlinePlayers.forEach(p => {
    const statusIcon = p.isReady ? '<span class="text-emerald-400">✅</span>' : '<span class="text-slate-500">⏳</span>';
    const hostBadge = p.isHost ? '<span class="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded ml-2">👑</span>' : '';
    const meBadge = (myPlayerId === p.id) ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded ml-2">⭐</span>' : '';

    // زر التعديل
    let editBtn = '';
    if (p.id === myPlayerId) {
      editBtn = `<button onclick="openRenameModal('${p.name}')" class="w-8 h-8 rounded-full flex items-center justify-center mr-2 transition-colors">✏️</button>`;
    }

    // --- ✅ المنطق الموحد للتنبيهات ✅ ---
    let showWeak = false;
    let showLost = false;

    if (p.id === myPlayerId) {
      // لا تنبيه لنفسي
    }
    else if (p.isHost) {
      // إذا كنت أنظر للمضيف: أنا (العضو) أحسب حالته محلياً
      // لأن المضيف لا يرسل حالته لنفسه
      const diff = isHost ? 0 : (now - lastHostPing);
      if (diff > 10000) showLost = true;
      else if (diff > 5000) showWeak = true;
    }
    else {
      // إذا كنت أنظر لعضو آخر:
      // 1. إذا كنت أنا المضيف: أعتمد على حساباتي المحلية (التي خزنها initHost)
      // 2. إذا كنت عضواً: أعتمد على الحالة التي أرسلها المضيف لي (p.connectionState)
      if (p.connectionState === 'lost') showLost = true;
      else if (p.connectionState === 'weak') showWeak = true;
    }

    let connectionStatus = '';
    if (showLost) {
      connectionStatus = '<span class="text-red-500 text-[10px] font-bold animate-pulse mr-2">⛔ لا يستجيب</span>';
    } else if (showWeak) {
      connectionStatus = '<span class="text-yellow-500 text-[10px] font-bold animate-pulse mr-2">⚠️ شبكة ضعيفة</span>';
    }
    // ------------------------------------

    list.innerHTML += `
            <div class="flex items-center justify-between bg-white/5 p-3 rounded-2xl border">
                <div class="flex items-center gap-3">
                    <span class="text-3xl">${p.avatar}</span>
                    <div class="text-right flex-1">
                        <div class="flex items-center flex-wrap">
                            <p class="font-bold text-sm ml-2">
                                ${p.name}
                            </p>
                            ${editBtn}
                            ${connectionStatus}
                        </div>
                        <div class="flex mt-1">
                            ${hostBadge} ${meBadge}
                        </div>
                    </div>
                </div>
                <div class="text-xl">${statusIcon}</div>
            </div>
        `;
  });

  // ... (بقية كود زر العميل المزدوج كما هو)
  const doubleAgentCheckbox = document.getElementById('online-check-double-agent');
  if (doubleAgentCheckbox) {
    if (onlinePlayers.length < 5) {
      doubleAgentCheckbox.disabled = true;
      doubleAgentCheckbox.checked = false;
      doubleAgentCheckbox.parentElement.classList.add('opacity-50');
    } else {
      doubleAgentCheckbox.disabled = false;
      doubleAgentCheckbox.parentElement.classList.remove('opacity-50');
    }
  }
}

// --- Online Voting Logic ---

function showOnlineVotingScreen() {
  showScreen('voting');
  const grid = document.getElementById('voting-grid');
  grid.innerHTML = '';

  // إعادة تفعيل الشبكة إذا كانت معطلة
  grid.classList.remove('pointer-events-none', 'opacity-50');

  document.querySelector('#screen-voting h2').innerText = "حان وقت الاتهام! ⚖️";
  document.getElementById('voting-instruction').innerText = "اضغط على صورة المتهم لإرسال صوتك";
  document.getElementById('voter-indicator').classList.add('hidden');

  state.players.forEach(p => {
    // لا أصوت لنفسي
    if (p.id === myPlayerId) return;

    grid.innerHTML += `
          <button onclick="handleOnlineVoteClick(${p.id})" 
               class="p-4 bg-white/5 border hover:border-red-500 rounded-3xl flex flex-col items-center gap-2 active:bg-red-500/20 text-theme-main transition-all">
              <span class="text-4xl">${p.avatar}</span>
              <span class="font-bold text-xs">${p.name}</span>
          </button>`;
  });
}

function handleOnlineVoteClick(targetId) {
  // تجميد الواجهة
  const grid = document.getElementById('voting-grid');
  grid.classList.add('pointer-events-none', 'opacity-50');
  document.getElementById('voting-instruction').innerText = "تم إرسال صوتك.. بانتظار النتائج ⏳";

  // إرسال الصوت
  if (isHost) {
    // إذا كنت المضيف، أعالج صوتي محلياً
    handleHostData({ type: 'VOTE', voterId: myPlayerId, targetId: targetId }, null);
  } else {
    // إذا كنت لاعباً، أرسله للمضيف
    myConn.send({ type: 'VOTE', voterId: myPlayerId, targetId: targetId });
  }
}

function calculateOnlineResults() {
  // المضيف يحسب النتائج
  const voteCounts = {};
  state.votesHistory.forEach(v => {
    voteCounts[v.target] = (voteCounts[v.target] || 0) + 1;
  });

  let maxVotes = -1;
  let tiedVictims = []; // مصفوفة لحفظ المتعادلين
  for (const [pid, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      tiedVictims = [parseInt(pid)]; // قائمة جديدة
    } else if (count === maxVotes) {
      tiedVictims.push(parseInt(pid)); // إضافة المتعادل
    }
  }
  // ✨ قانون الأغلبية الصارمة: إذا تعادل أكثر من شخص، لا يوجد ضحية فعلية!
  let victimId = tiedVictims.length === 1 ? tiedVictims[0] : null;

  let winType = '';
  let title = '';
  let winner = '';

  // ✅✅✅ التعديل هنا: التحقق من التحدي الأعمى أولاً ✅✅✅
  if (state.blindRoundType) {
    // إذا كانت جولة عمياء (الكل ضايع أو الكل يعرف)
    winner = 'blind';
    winType = 'blind_win';
    title = "مقلب! 🤣 الكل أخذ نقطة!";
  }
  else {
    // المنطق العادي (فوز وخسارة)
    const isOut = state.outPlayerIds.includes(victimId);

    if (isOut) {
      // ✅✅✅ التعديل هنا: التحقق من "فرصة التخمين" قبل إنهاء اللعبة ✅✅✅
      if (state.guessingEnabled) {
        const victim = state.players.find(p => p.id === victimId);
        const victimName = victim ? victim.name : "الضايع";

        // إرسال أمر "تخمين بعد الكشف" للجميع
        broadcast({ type: 'GAME_PHASE', phase: 'caught_guessing', panicPlayerName: victimName });

        // تنفيذ المرحلة عند المضيف أيضاً
        executeCaughtGuessingPhase(victimName);
        return; // 🛑 توقف هنا ولا تذهب لشاشة النتائج
      }
      winType = 'group_win';
      title = "كفو! صدتوا الضايع 😶‍🌫️";
      winner = 'group';
    } else {
      winType = 'out_win';
      title = "خطأ! الضايع فاز 😈";
      winner = 'out';
    }
  }
  // ✅✅✅ -------------------------------------- ✅✅✅

  // تحديث النقاط محلياً عند المضيف
  state.lastWinner = winner;
  awardPoints(winner); // هذه الدالة موجودة مسبقاً وتحدث state.players

  // بث النتائج للجميع
  broadcast({
    type: 'GAME_PHASE',
    phase: 'result',
    winner: winner,
    winType: winType,
    title: title,
    secretData: state.secretData,
    roles: state.currentRoles,
    players: state.players, // إرسال اللاعبين مع النقاط الجديدة
    votesHistory: state.votesHistory // لإظهار تفاصيل التصويت
  });

  // إظهار النتائج للمضيف
  showFinalResults(winType, title);
}

// إرسال بيانات للجميع (للمضيف فقط)
function broadcast(msg) {
  Object.values(hostConnections).forEach(conn => {
    if (conn && conn.open) conn.send(msg);
  });
}

// Settings
function openSettingsModal() { document.getElementById('modal-settings').classList.remove('hidden'); document.getElementById('modal-settings').classList.add('flex'); updateSettingsUI(); }
function closeSettingsModal() { document.getElementById('modal-settings').classList.add('hidden'); document.getElementById('modal-settings').classList.remove('flex'); }

function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('light-mode', !isDarkMode);
  updateSettingsUI();

  // ✅ حفظ الخيار الجديد في ذاكرة المتصفح
  localStorage.setItem('spy_theme', isDarkMode ? 'dark' : 'light');
}

// ✨ دالة سحب شريط الصوت وتلوينه
function updateVolumeLevel() {
  const volInput = document.getElementById('input-volume');
  globalVolume = parseFloat(volInput.value);
  localStorage.setItem('spy_volume', globalVolume);

  if (globalVolume > 0 && isMuted) {
    isMuted = false;
    localStorage.setItem('spy_muted', false);
  } else if (globalVolume === 0 && !isMuted) {
    isMuted = true;
    localStorage.setItem('spy_muted', true);
  }

  masterGain.gain.value = isMuted ? 0 : globalVolume;
  updateSettingsUI();

  if (!isMuted) playTone(600, 0.1, 'sine', 0.05);
}

// ✨ دالة سحب شريط الاهتزاز وتلوينه
function updateVibrationLevel() {
  const vibeInput = document.getElementById('input-vibration');
  globalVibrationLevel = parseInt(vibeInput.value);
  localStorage.setItem('spy_vibe_level', globalVibrationLevel);

  if (globalVibrationLevel > 0 && !isVibrationEnabled) {
    isVibrationEnabled = true;
    localStorage.setItem('spy_vibe_enabled', true);
  } else if (globalVibrationLevel === 0 && isVibrationEnabled) {
    isVibrationEnabled = false;
    localStorage.setItem('spy_vibe_enabled', false);
  }

  updateSettingsUI();
  if (isVibrationEnabled) triggerVibrate(100);
}

// ✨ دالة تحديث الواجهة والتلوين (بعد إزالة الأزرار)
function updateSettingsUI() {
  // تحديث زر المظهر (داكن/فاتح)
  const btnTheme = document.getElementById('btn-toggle-theme');
  if (btnTheme) btnTheme.innerHTML = isDarkMode ? '<span class="text-slate-300">داكن 🌙</span>' : '<span class="text-amber-500">فاتح ☀️</span>';

  // تحديث الصوت وتلوين الشريط
  const volInput = document.getElementById('input-volume');
  if (volInput) {
    volInput.value = globalVolume;
    const volPercent = (globalVolume / 1) * 100;
    // إذا كان صفر، سيختفي اللون الأزرق ويصبح رمادياً بالكامل (مما يدل على الإيقاف)
    volInput.style.background = `linear-gradient(to right, #6366f1 ${volPercent}%, #334155 ${volPercent}%)`;
  }

  // تحديث الاهتزاز وتلوين الشريط
  const vibeInput = document.getElementById('input-vibration');
  if (vibeInput) {
    vibeInput.value = globalVibrationLevel;
    const vibePercent = globalVibrationLevel;
    // إذا كان صفر، سيختفي اللون الأخضر ويصبح رمادياً بالكامل (مما يدل على الإيقاف)
    vibeInput.style.background = `linear-gradient(to right, #10b981 ${vibePercent}%, #334155 ${vibePercent}%)`;
  }
}

// Helpers
// --- Premium Functions ---

// متغير جديد لمعرفة هل اللاعب ضغط على الزر بنفسه أم لا
let isManualRestoreRequest = false;

// دالة زر استرجاع المشتريات من الإعدادات
function restorePurchasesClick() {
  closeSettingsModal();

  if (typeof Android !== "undefined" && Android.restorePurchases) {
    isManualRestoreRequest = true; // 👈 تفعيل فلتر الحماية (الطلب يدوي)
    showAlert("جاري البحث عن مشترياتك السابقة... ⏳");
    Android.restorePurchases();
  } else {
    showAlert("هذه الميزة تعمل فقط على تطبيق الأندرويد الفعلي 📱");
  }
}

// الدالة التي سيرد عليها الأندرويد بعد فحص جوجل بلاي
window.onRestoreComplete = function (isSuccessful) {
  if (isSuccessful) {
    // تحديث البيانات وفتح الفئات بصمت دائماً لضمان عمل اللعبة
    isPremium = true;
    localStorage.setItem('isPremium', 'true');
    updatePremiumUI();

    if (typeof renderCategorySelectionGrid === 'function') {
      renderCategorySelectionGrid();
    }

    // 🛡️ التنبيه والاحتفال يظهر فقط إذا اللاعب طلب الاسترجاع يدوياً
    if (isManualRestoreRequest) {
      createConfetti();
      showAlert("💎 مبروك! تم استرجاع مشترياتك وتفعيل النسخة الكاملة بنجاح!", true);
    }
  } else {
    // تنبيه الفشل يظهر فقط للطلب اليدوي أيضاً
    if (isManualRestoreRequest) {
      sounds.wrong();
      showAlert("لم نتمكن من العثور على مشتريات سابقة لهذا الحساب ❌");
    }
  }

  // إعادة تصفير المتغير بعد الانتهاء
  isManualRestoreRequest = false;
};

function openPremiumModal() {
  document.getElementById('modal-premium').classList.remove('hidden');
  document.getElementById('modal-premium').classList.add('flex');
}

function closePremiumModal() {
  document.getElementById('modal-premium').classList.add('hidden');
  document.getElementById('modal-premium').classList.remove('flex');
}

// عند الضغط على زر "اشترِ الآن"
function buyPremiumClick() {
  if (typeof Android !== "undefined" && Android.buyPremium) {
    Android.buyPremium(); // استدعاء الأندرويد
  } else {
    // للتجربة على الكمبيوتر (يمكنك تفعيل هذا السطر لاختبار النجاح)
    // unlockPremiumContent(); 
    showAlert("هذه الميزة تعمل فقط على تطبيق الأندرويد الفعلي");
  }
}

// هذه الدالة يناديها الأندرويد عند نجاح الدفع (أو استعادة المشتريات)
window.unlockPremiumContent = function () {
  isPremium = true;
  localStorage.setItem('isPremium', 'true'); // حفظ الحالة للأبد

  updatePremiumUI(); // إخفاء الزر من الشاشة الرئيسية
  closePremiumModal(); // إغلاق النافذة إذا كانت مفتوحة

  // تشغيل احتفال بسيط
  createConfetti();
  showAlert("💎 مبروك! تم تفعيل النسخة الكاملة بنجاح!", true);

  // تحديث الفئات لفتح الأقفال (إذا كنت قد طبقت منطق الأقفال)
  if (typeof renderCategorySelectionGrid === 'function') renderCategorySelectionGrid();
};

// متغير لتذكر الشاشة التي جئنا منها
let returnScreenId = 'start';

// دالة لفتح الصدارة وحفظ المكان السابق
function openLeaderboard(fromScreen) {
  returnScreenId = fromScreen; // حفظ المصدر
  showScreen('leaderboard');
}

// دالة لإغلاق الصدارة والعودة للمكان الصحيح
function closeLeaderboard() {
  showScreen(returnScreenId); // العودة

  // ✨ النزول التلقائي لأسفل الشاشة إذا كنا عائدين لصفحة النتائج ✨
  if (returnScreenId === 'final') {
    setTimeout(() => {
      const finalScreen = document.getElementById('screen-final');
      if (finalScreen) {
        finalScreen.scrollTo({ top: finalScreen.scrollHeight, behavior: 'smooth' });
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);
  }
}

// دالة لتصفير واجهة المؤقت فوراً
function resetTimerUI() {
  const timerEl = document.getElementById('game-timer');
  const progressEl = document.getElementById('timer-progress');

  // 1. إعادة النص للوقت الأصلي
  if (timerEl) {
    const m = Math.floor(state.initialTimer / 60);
    const s = state.initialTimer % 60;
    timerEl.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // 2. تصفير دائرة التقدم (جعلها ممتلئة)
  if (progressEl) {
    progressEl.style.transition = 'none'; // إيقاف الأنيميشن لحظياً لمنع "الرجوع البطيء"
    progressEl.style.strokeDashoffset = '0';

    // خدعة لإجبار المتصفح على تطبيق التغيير فوراً
    void progressEl.offsetWidth;

    // إعادة الأنيميشن للعمل الطبيعي
    progressEl.style.transition = 'stroke-dashoffset 1s linear';
  }
}

function generateAutoName() {
  let i = 1;
  // البحث عن أول رقم متاح: المحقق 1، المحقق 2، ...
  while (onlinePlayers.some(p => p.name === `المحقق ${i}`)) {
    i++;
  }
  return `المحقق ${i}`;
}

function updateOnlineSettingsUI() {
  const blindChk = document.getElementById('online-check-blind');
  const panicChk = document.getElementById('online-check-panic');
  const probContainer = document.getElementById('online-blind-probability-container');

  if (!blindChk || !panicChk) return;

  const panicCard = panicChk.closest('label');

  if (blindChk.checked) {
    panicChk.checked = false;
    panicChk.disabled = true;
    if (panicCard) panicCard.classList.add('opacity-40', 'pointer-events-none', 'grayscale');
    if (probContainer) { probContainer.classList.remove('hidden'); probContainer.classList.add('flex'); }
  } else {
    panicChk.disabled = false;
    if (panicCard) panicCard.classList.remove('opacity-40', 'pointer-events-none', 'grayscale');
    if (probContainer) { probContainer.classList.add('hidden'); probContainer.classList.remove('flex'); }
  }
}

// 🛠️ دالة مساعدة لضمان بناء شاشة الكشف (تعالج التعارض بين الأونلاين والأوفلاين)
function ensureRevealScreenExists() {
  const screenReveal = document.getElementById('screen-reveal');
  if (screenReveal && !document.getElementById('reveal-role-text')) {
    screenReveal.innerHTML = `
      <div class="text-7xl sm:text-8xl mb-6"></div>
      <p id="reveal-pass-text" class="text-theme-muted mb-2 text-xl font-bold">مرر الجهاز إلى المحقق:</p>
      <h2 id="reveal-player-name" class="text-4xl sm:text-6xl font-black mb-8 text-indigo-500"></h2>

      <div class="card-scene w-full max-w-sm mx-auto mb-8 h-[400px] sm:h-[420px]">
        <div class="card-object w-full h-full" id="role-card">
          
          <div class="card-face card-face-front absolute inset-0 w-full h-full overflow-hidden bg-gradient-to-br from-slate-900 to-black border-2 border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.2)] rounded-[2.5rem]">
            <div class="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,#4f46e5_90deg,#8b5cf6_180deg,transparent_270deg,#4f46e5_360deg)] animate-border-spin opacity-80"></div>
            
            <div class="absolute inset-[3px] bg-gradient-to-br from-slate-950 to-black rounded-[calc(2.5rem-3px)] z-10">
              <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTTAgNDBoNDBNNDAgMHY0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=')] opacity-30"></div>
              <div class="absolute -top-20 -left-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
            </div>
            
            <div class="absolute inset-0 z-20 flex flex-col items-center justify-center p-4">
              <h3 class="text-theme-muted font-bold text-sm mb-6 animate-pulse">ضع إصبعك للكشف</h3>
              <div id="fingerprint-scanner" class="relative w-32 h-32 flex items-center justify-center cursor-pointer group active:scale-95 transition-transform duration-200" onmousedown="startScan(event)" ontouchstart="startScan(event)" onmouseup="cancelScan()" ontouchend="cancelScan()" onmouseleave="cancelScan()">
                <svg class="w-14 h-14 text-indigo-500/50 transition-all duration-300 z-10 group-hover:text-indigo-500/80" id="scanner-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M17.81 4.47c-.08 0-.16-.02-.23-.06C15.66 3.42 14 3 12.01 3c-1.98 0-3.86.47-5.57 1.41-.24.13-.54.04-.68-.2-.13-.24-.04-.55.2-.68C7.82 2.52 9.86 2 12.01 2c2.13 0 3.99.47 6.03 1.52.25.13.34.43.21.67-.09.18-.26.28-.44.28zM3.5 9.72c-.1 0-.2-.03-.29-.09-.23-.16-.28-.47-.12-.7.99-1.4 2.25-2.5 3.75-3.27C9.98 4.04 14 4.03 17.15 5.65c1.5.77 2.76 1.86 3.75 3.25.16.22.11.54-.12.7-.23.16-.54.11-.7-.12-.9-1.26-2.04-2.25-3.39-2.93-2.85-1.45-6.45-1.45-9.28.01-1.36.7-2.5 1.7-3.4 2.96-.08.14-.23.2-.41.2zm6.27 12c-.25 0-.48-.19-.5-.45-.09-1.39-.03-2.79.16-4.18.36-2.59 2.05-4.43 4.54-4.93.27-.05.53.12.59.39.05.27-.12.53-.39.59-1.89.38-3.17 1.78-3.44 3.73-.18 1.3-.23 2.6-.15 3.9.02.28-.19.52-.47.54-.11.01-.23 0-.34-.49zM9.6 20.3c-.27 0-.5-.21-.52-.49-.1-2.18.23-4.52.95-6.73.53-1.63 1.46-3.08 2.7-4.21.21-.19.53-.18.72.03.19.21.18.53-.03.72-1.07 1-1.87 2.24-2.33 3.66-.66 2.03-.96 4.17-.87 6.17.02.27-.2.5-.47.52-.05 0-.1 0-.15-.17zm6 1.4c-.26 0-.49-.2-.51-.46-.14-2.18.17-4.4.89-6.42.54-1.51 1.44-2.82 2.6-3.79.22-.18.53-.15.72.06.18.22.15.53-.06.72-1 1.05-1.77 2.18-2.24 3.5-.66 1.84-.94 3.86-.81 5.86.02.28-.19.52-.47.54-.04-.01-.08-.01-.12-.01z" /></svg>
                        <div class="absolute inset-0 rounded-full overflow-hidden z-20 pointer-events-none">
                          <div id="scan-beam" class="absolute w-full h-1 bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,1)] top-0 hidden opacity-80"></div>
                        </div>
                        <svg class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none z-30" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="48" stroke="rgba(99, 102, 241, 0.2)" stroke-width="2" fill="none"></circle>
                          <circle cx="50" cy="50" r="48" stroke="#10b981" stroke-width="2" fill="none" stroke-linecap="round" class="opacity-0" id="scan-progress" stroke-dasharray="301.6" stroke-dashoffset="301.6"></circle>
                        </svg>
                      </div>
                      <p id="scan-status" class="text-xs text-indigo-400 mt-6 font-mono h-4">انتظار البيانات...</p>
                    </div>
                  </div>
                  
                  <div class="card-face card-face-back absolute inset-0 w-full h-full overflow-hidden bg-gradient-to-tl from-slate-900 via-slate-800 to-black border-2 border-emerald-500/40 shadow-[0_0_40px_rgba(16,185,129,0.3)] rounded-[2.5rem]">
                    <div class="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent_0deg,#10b981_90deg,#34d399_180deg,transparent_270deg,#10b981_360deg)] animate-border-spin opacity-80"></div>
                    <div class="absolute inset-[3px] bg-gradient-to-tl from-slate-950 via-slate-900 to-black rounded-[calc(2.5rem-3px)] z-10">
                      <div class="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none"></div>
                    </div>
                    <div class="absolute inset-0 z-20 flex flex-col items-center justify-center p-4">
                      <p id="reveal-role-text" class="text-xl sm:text-2xl font-bold mb-4"></p>
                      <div id="reveal-img-placeholder" class="text-7xl sm:text-8xl mb-4 drop-shadow-2xl"></div>
                      <p id="reveal-secret-word" class="text-3xl sm:text-5xl font-black text-emerald-400 mb-6 tracking-wider break-words w-full px-2 leading-tight drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]" style="direction: rtl; unicode-bidi: embed;"></p>
                      <p id="reveal-word-desc" class="text-sm sm:text-base text-blue-400 mt-4 font-bold bg-blue-500/10 p-2 rounded-xl border border-blue-500/20 relative z-10"></p>
                    </div>
                  </div>
                  
                </div>
              </div>
              <button id="btn-reveal-action" onclick="toggleReveal()" class="btn-gradient w-full py-6 rounded-3xl font-black text-2xl text-white hidden">كشف الدور</button>
              <button id="btn-next-player" onclick="nextPlayerAction()" class="btn-gradient w-full py-6 rounded-3xl font-black text-2xl text-white hidden">التالي ⏭️</button>
            `;
  }
}

// دالة نسخ كود الغرفة
function copyCode() {
  const codeElement = document.getElementById('lobby-room-code');
  if (!codeElement) return;

  const code = codeElement.innerText;

  // 🛡️ درع الحماية: إذا كان النص الحالي هو "تم النسخ"، أوقف الدالة فوراً!
  if (code.includes('تم')) return;

  // استخدام API الحافظة
  navigator.clipboard.writeText(code).then(() => {
    const originalText = code;

    codeElement.innerText = "تم النسخ";

    // ✅✅✅ التعديل هنا: تصغير الخط مؤقتاً ✅✅✅
    codeElement.classList.remove("text-5xl"); // إزالة الخط العملاق
    codeElement.classList.add("text-2xl", "scale-110"); // استخدام خط أصغر (2xl) ومناسب للجوال
    // ✅✅✅ -------------------------------- ✅✅✅

    if (typeof sounds !== 'undefined' && sounds.tick) sounds.tick();
    if (typeof triggerVibrate === 'function') triggerVibrate(50);

    setTimeout(() => {
      codeElement.innerText = originalText;

      // ✅✅✅ إعادة الخط الكبير للأرقام ✅✅✅
      codeElement.classList.remove("text-2xl", "scale-110");
      codeElement.classList.add("text-5xl");
      // ✅✅✅ ---------------------------- ✅✅✅
    }, 1500);
  }).catch(err => {
    console.error('فشل النسخ:', err);
    showAlert("لم يتم النسخ، يرجى النسخ يدوياً");
  });
}

// محاولة الخروج (يتم استدعاؤها من زر الخروج أو زر الرجوع)
function tryToExit() {
  // إذا كنا أونلاين
  if (isOnline) {
    const descElement = document.getElementById('exit-modal-desc');

    // الحالة 1: أنا المضيف + يوجد لاعبون آخرون معي (العدد الكلي 2 أو أكثر)
    if (isHost && onlinePlayers.length >= 2) {
      descElement.innerText = "الخروج الآن سيؤدي لإلغاء اللعبة وإخراج جميع اللاعبين معك!";
      descElement.classList.add('text-red-400'); // لون أحمر للتحذير
    }
    // الحالة 2: أنا عضو (أو مضيف وحيد)
    else {
      descElement.innerText = "هل أنت متأكد أنك تريد مغادرة الغرفة؟";
      descElement.classList.remove('text-red-400'); // لون عادي
    }

    // إظهار النافذة
    document.getElementById('modal-exit-confirm').classList.remove('hidden');
    document.getElementById('modal-exit-confirm').classList.add('flex');
    sounds.wrong();
  } else {
    // في الأوفلاين خروج مباشر
    confirmExit();
  }
}

function closeExitModal() {
  document.getElementById('modal-exit-confirm').classList.add('hidden');
  document.getElementById('modal-exit-confirm').classList.remove('flex');
  // إعادة وضع "قفل" زر الرجوع
  history.pushState(null, document.title, location.href);
}

// تنفيذ الخروج الفعلي
function confirmExit() {
  // 1. إخفاء نافذة التأكيد فوراً وبدون أي انتظار
  const exitModal = document.getElementById('modal-exit-confirm');
  if (exitModal) {
    exitModal.classList.add('hidden');
    exitModal.classList.remove('flex');
  }

  if (isOnline) {
    // 👈 السطر السحري: نخبر النظام أننا نخرج بإرادتنا لمنع إطلاق تنبيه الانقطاع المفاجئ
    isOnline = false;

    // إرسال رسالة وداع فورية قبل قطع الاتصال
    if (isHost) {
      // المضيف يخبر الجميع أنه خارج
      broadcast({ type: 'GAME_ABORTED', reason: 'المضيف أغلق الغرفة.' });
    } else {
      // اللاعب يخبر المضيف أنه خارج
      if (myConn && myConn.open) {
        myConn.send({ type: 'PLAYER_LEFT', id: myPlayerId });
      }
    }

    // تأخير بسيط جداً لضمان وصول الرسالة قبل التدمير
    setTimeout(() => {
      if (myPeer) { myPeer.destroy(); myPeer = null; }
      if (myConn) { myConn.close(); myConn = null; }

      // التنظيف والعودة
      cleanupAndReload();
    }, 100);
    return;
  }

  cleanupAndReload();
}

function cleanupAndReload() {
  // 1. إيقاف كل المؤقتات الحية (المسؤولة عن 90% من الأخطاء)
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  if (state.interval) { clearInterval(state.interval); state.interval = null; }
  if (state.guessInterval) { clearInterval(state.guessInterval); state.guessInterval = null; }
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }

  // 2. تدمير اتصالات الأونلاين (WebRTC)
  if (myConn) { myConn.close(); myConn = null; }
  Object.values(hostConnections).forEach(conn => { if (conn && conn.open) conn.close(); });
  if (myPeer) { myPeer.destroy(); myPeer = null; }

  // 3. تصفير المتغيرات العامة
  isOnline = false;
  isHost = false;
  isGameStarted = false;
  amIReady = false;
  onlinePlayers = [];
  hostConnections = {};
  myPlayerId = null;
  roomCode = null;
  lastLobbyState = "";
  votesReceived = 0;
  revealReadyCount = 0;

  // 4. تصفير كائن الجولة بالكامل (مع الاحتفاظ بالفئات التي اختارها اللاعب مسبقاً)
  state = {
    players: [], currentRoles: [], secretData: null, timer: 60, initialTimer: 60, interval: null,
    revealIndex: 0, isPaused: false, doubleAgentActive: false, undercoverActive: false, guessingEnabled: false,
    outPlayerIds: [], agentPlayerId: null, undercoverPlayerId: null, selectedCategory: "عشوائي",
    allowedCategories: state.allowedCategories,
    usedWords: JSON.parse(localStorage.getItem('spy_used_words') || '[]'),
    customWords: state.customWords, lastWinner: null, votingMode: 'individual', voterIndex: 0,
    votesAccumulated: {}, panicMode: false, smartDistractors: true,
    blindModeActive: false, blindRoundType: null, guessInterval: null, panicModeAllowed: false, hintEnabled: false
  };

  // 5. 🧹 تصفير بقايا الواجهة (Inputs & Buttons & Checkboxes) 🧹
  const roomInput = document.getElementById('room-code-input');
  if (roomInput) roomInput.value = ''; // مسح كود الغرفة القديم

  const readyBtn = document.getElementById('btn-client-ready');
  if (readyBtn) {
    readyBtn.innerText = "أنا جاهز! ✅";
    readyBtn.className = "btn-secondary-theme w-full py-5 rounded-2xl font-black text-xl border-emerald-500/50";
  }

  // 1. شريط اللاعبين (أوفلاين)
  const inputPlayers = document.getElementById('input-players');
  if (inputPlayers) inputPlayers.value = '3';

  // 2. شريط الوقت (أوفلاين)
  const inputTime = document.getElementById('input-time');
  if (inputTime) inputTime.value = '60';

  // 3. شريط الوقت (أونلاين)
  const onlineTimeInput = document.getElementById('online-time-input');
  if (onlineTimeInput) onlineTimeInput.value = '60';

  // إطفاء جميع أزرار التفعيل (Checkboxes) للأوفلاين والأونلاين
  const checkboxes = [
    'check-double-agent', 'check-undercover', 'check-panic-mode', 'check-guessing', 'check-blind-mode', 'check-hint', 'check-smart-turns',
    'online-check-panic', 'online-check-guessing', 'online-check-blind', 'online-check-double-agent', 'online-check-undercover', 'online-check-hint', 'online-check-smart-turns'
  ];

  checkboxes.forEach(id => {
    const chk = document.getElementById(id);
    if (chk) chk.checked = false; // نضعها كلها على "مغلق"
  });

  // تحديث النصوص المرتبطة بالوقت والأزرار لكي ينعكس الإغلاق على الشاشة (مرة واحدة تكفي)
  if (typeof updateSetupInfo === 'function') updateSetupInfo();
  if (typeof updateOnlineTime === 'function') updateOnlineTime('60'); // تحديث نص وقت الأونلاين
  if (typeof updateOnlineSettingsUI === 'function') updateOnlineSettingsUI();

  // 6. إزالة حمايات الخروج
  window.onbeforeunload = null;
  window.onpopstate = null;

  // 7. العودة السلسة للبداية
  initApp();
}

function abortGame(reason) {
  // 1. إيقاف المؤقتات فوراً
  if (state.interval) clearInterval(state.interval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (state.guessInterval) clearInterval(state.guessInterval);

  // 2. إزالة حمايات الخروج
  window.onbeforeunload = null;
  window.onpopstate = null;

  // 3. التنظيف الشامل للبيانات والرجوع للشاشة الرئيسية
  cleanupAndReload();

  // 4. إظهار التنبيه (بدون تمرير دالة إضافية لكي يظهر كخطأ باللون الأحمر)
  setTimeout(() => {
    showAlert("🛑 " + reason);
  }, 100);
}

function formatTimeLabel(s) {
  const m = Math.floor(s / 60);
  const sc = s % 60;
  let mText = "";

  // تحديد صيغة الدقائق
  if (m === 1) mText = "دقيقة";
  else if (m === 2) mText = "دقيقتان";
  else if (m >= 3 && m <= 10) mText = `${m} دقائق`;
  else mText = `${m} دقيقة`; // من 11 فما فوق (وأيضاً الصفر إذا وجد)

  // إرجاع النص النهائي (مع الثواني أو بدونها)
  return sc === 0 ? mText : `${mText} و${sc} ثانية`;
}

function triggerVibrate(ms) {
  if (!isVibrationEnabled || globalVibrationLevel === 0) return;

  setTimeout(() => {
    try {
      const timeFactor = globalVibrationLevel / 100;
      let webPattern = Array.isArray(ms) ? ms.map(val => Math.floor(val * timeFactor)) : Math.floor(ms * timeFactor);

      const trueAmplitude = Math.max(1, Math.floor((globalVibrationLevel / 100) * 255));

      if (typeof Android !== "undefined") {
        if (Array.isArray(ms)) {
          // إذا كان المطلوب نمط اهتزاز (مصفوفة)
          if (Android.vibratePattern) {
            Android.vibratePattern(ms.join(','), trueAmplitude);
          } else if (Android.vibrate) {
            Android.vibrate(ms[0], trueAmplitude); // حل بديل لو الدالة غير موجودة
          }
        } else {
          // إذا كان اهتزازاً مفرداً
          if (Android.vibrate) {
            Android.vibrate(ms, trueAmplitude);
          }
        }
      } else if (navigator.vibrate) {
        navigator.vibrate(webPattern);
      }
    } catch (err) {
      console.warn("Vibration failed ignored:", err);
    }
  }, 0);
}

function playTone(f, d, t = 'sine', v = 0.1) { if (isMuted) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(masterGain); o.type = t; o.frequency.setValueAtTime(f, audioCtx.currentTime); g.gain.setValueAtTime(v, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + d); o.start(); o.stop(audioCtx.currentTime + d); }
function playFlipSound() { if (isMuted) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(masterGain); o.type = 'triangle'; o.frequency.setValueAtTime(400, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2); g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2); o.start(); o.stop(audioCtx.currentTime + 0.2); }
function playFunnySound() { if (isMuted) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(masterGain); o.type = 'sawtooth'; o.frequency.setValueAtTime(300, audioCtx.currentTime); o.frequency.linearRampToValueAtTime(150, audioCtx.currentTime + 0.2); o.frequency.linearRampToValueAtTime(300, audioCtx.currentTime + 0.4); o.frequency.linearRampToValueAtTime(150, audioCtx.currentTime + 0.6); g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6); o.start(); o.stop(audioCtx.currentTime + 0.6); }

const sounds = {
  tick: () => { playTone(800, 0.05, 'sine', 0.03); triggerVibrate(15); },
  win: () => { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(783, 0.3), 200); triggerVibrate([100, 50, 100]); },
  lose: () => { playTone(150, 0.6, 'sawtooth', 0.15); triggerVibrate([200, 100, 200]); },
  wrong: () => { playTone(100, 0.5, 'square', 0.2); triggerVibrate(300); },
  flip: () => { playFlipSound(); triggerVibrate(40); },
  funny: () => { playFunnySound(); triggerVibrate([50, 50, 50, 50, 50]); }
};

// دالة لتوليد نبضة واحدة (Thud)
function createHeartThud(time, frequency, decay) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(masterGain);

  // استخدام موجة مثلثة ومفلترة لتعطي صوت مكتوم وقوي
  osc.type = 'triangle';

  // انحناء التردد: يبدأ عالياً وينخفض بسرعة (محاكاة الضربة)
  osc.frequency.setValueAtTime(frequency, time);
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, time + decay);

  // التحكم في الصوت (Envelope)
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(1, time + 0.01); // Attack سريع
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay); // Decay سريع

  osc.start(time);
  osc.stop(time + decay + 0.1);
}

// دالة دقات القلب الكاملة (Lub-Dub)
function playHeartbeatSound() {
  if (isMuted) return;
  const t = audioCtx.currentTime;

  // النبضة الأولى "لُب" (أقوى وأعمق)
  createHeartThud(t, 80, 0.15);

  // النبضة الثانية "دُب" (أسرع وأعلى قليلاً) - تأتي بعد 150 ملي ثانية
  createHeartThud(t + 0.15, 90, 0.12);
}

function triggerRevealEffects() {
  if (!isMuted) {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square'; // صوت رقمي
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.setValueAtTime(1200, t + 0.1);
    osc.frequency.setValueAtTime(600, t + 0.2);
    osc.frequency.setValueAtTime(1400, t + 0.3);

    gain.gain.setValueAtTime(0.1, t);
    gain.gain.setValueAtTime(0, t + 0.05);
    gain.gain.setValueAtTime(0.1, t + 0.1);
    gain.gain.setValueAtTime(0, t + 0.15);
    gain.gain.setValueAtTime(0.1, t + 0.2);
    gain.gain.linearRampToValueAtTime(0, t + 0.4);

    osc.connect(gain); gain.connect(masterGain);
    osc.start(t); osc.stop(t + 0.4);
  }

  if (typeof triggerVibrate === 'function') triggerVibrate([20, 20, 20, 20]);
  document.body.classList.add('force-cyber-reveal');
  setTimeout(() => document.body.classList.remove('force-cyber-reveal'), 500);
}

// صوت درامي لبدء التصويت (جرس عميق)
function playVotingSound() {
  if (isMuted) return;
  const t = audioCtx.currentTime;

  // 1. الطبقة العميقة (The Boom)
  const oscLow = audioCtx.createOscillator();
  const gainLow = audioCtx.createGain();
  oscLow.connect(gainLow);
  gainLow.connect(masterGain);

  oscLow.type = 'sine';
  oscLow.frequency.setValueAtTime(100, t);
  oscLow.frequency.exponentialRampToValueAtTime(30, t + 1); // انخفاض عميق

  gainLow.gain.setValueAtTime(0.5, t);
  gainLow.gain.exponentialRampToValueAtTime(0.01, t + 1.5); // صدى طويل

  oscLow.start(t);
  oscLow.stop(t + 1.5);

  // 2. الطبقة المعدنية (The Clang) - لتعطي إحساس الجرس
  const oscHigh = audioCtx.createOscillator();
  const gainHigh = audioCtx.createGain();
  oscHigh.connect(gainHigh);
  gainHigh.connect(masterGain);

  oscHigh.type = 'triangle'; // موجة حادة قليلاً
  oscHigh.frequency.setValueAtTime(500, t);
  oscHigh.frequency.linearRampToValueAtTime(200, t + 0.3); // انخفاض سريع

  gainHigh.gain.setValueAtTime(0.3, t);
  gainHigh.gain.exponentialRampToValueAtTime(0.01, t + 0.5); // تلاشي سريع

  oscHigh.start(t);
  oscHigh.stop(t + 0.5);

  // اهتزاز قوي لتنبيه اللاعبين
  triggerVibrate([100, 50, 100]);
}

// دالة خاصة لصوت تكتكة العجلة (صوت خشبي/بلاستيكي)
function playWheelTick() {
  if (isMuted) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(masterGain);

  // إعدادات تجعل الصوت يشبه احتكاك المؤشر البلاستيكي
  o.type = 'triangle';
  o.frequency.setValueAtTime(600, t); // تردد البداية
  o.frequency.exponentialRampToValueAtTime(100, t + 0.05); // انخفاض سريع للتردد

  g.gain.setValueAtTime(0.15, t); // مستوى الصوت
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.05); // تلاشي سريع

  o.start(t);
  o.stop(t + 0.05);
}

let state = {
  players: [], currentRoles: [], secretData: null, timer: 60, initialTimer: 60, interval: null,
  revealIndex: 0, isPaused: false, doubleAgentActive: false, undercoverActive: false, guessingEnabled: false,
  outPlayerIds: [], agentPlayerId: null, undercoverPlayerId: null, selectedCategory: "عشوائي",
  allowedCategories: [], usedWords: [], customWords: [], lastWinner: null, votingMode: 'individual', voterIndex: 0,
  votesAccumulated: {}, panicMode: false, smartDistractors: true, blindModeActive: false, blindRoundType: null,
  guessInterval: null, panicModeAllowed: false, hintEnabled: false
};

function showScreen(screenId) {
  document.querySelectorAll('#app > div').forEach(div => div.classList.add('hidden'));
  const target = document.getElementById(`screen-${screenId}`);

  if (screenId === 'game') {
    const endBtn = document.getElementById('btn-end-round');
    if (endBtn) {
      if (isOnline && !isHost) {
        endBtn.classList.add('hidden'); // إخفاء للاعبين
      } else {
        endBtn.classList.remove('hidden'); // إظهار للمضيف والأوفلاين
      }
    }
    const panicBtn = document.getElementById('btn-panic');
    if (panicBtn) {
      panicBtn.innerText = "🕵️‍♂️ كشفت السالفة!"; // إعادة النص الأصلي
      panicBtn.disabled = false; // إعادة التفعيل
      panicBtn.classList.remove('opacity-50', 'cursor-not-allowed'); // إزالة تأثير التعطيل إن وجد
    }
    const turnContainer = document.getElementById('online-turn-container');
    if (turnContainer) {
      if (state.smartTurnsActive) {
        // إذا كانت الميزة مفعلة، نتركه كما هو
      } else {
        // إذا كانت الميزة مطفأة، نفرض عليه الاختفاء فوراً!
        turnContainer.classList.add('hidden');
      }
    }
  }

  if (target) { target.classList.remove('hidden'); target.scrollTop = 0; window.scrollTo(0, 0); }

  if (screenId === 'category-select') renderCategorySelectionGrid();
  if (screenId === 'setup') renderActiveCategoryGrid();
  if (screenId === 'leaderboard') { updateLeaderboardUI(); checkResetButtonVisibility(); }
  if (screenId === 'final') updateFinalResultsUI();

  if (screenId === 'online-setup') renderAvatarGrid('host-avatar-grid', 'host-selected-avatar');
  if (screenId === 'join-room') renderAvatarGrid('client-avatar-grid', 'client-selected-avatar');
}

function goHome() {
  if (isOnline) {
    // --- وضع الأونلاين ---
    isGameStarted = false;

    if (isHost) {
      // 1. إعادة تعيين حالة الجاهزية
      onlinePlayers.forEach(p => {
        if (p.isHost) {
          p.isReady = true; // المضيف جاهز تلقائياً
        } else {
          p.isReady = false; // الأعضاء يجب أن يضغطوا مرة أخرى
        }
      });

      // 2. تحديث واجهة المضيف
      updateLobbyUI();

      // 3. إرسال أمر لجميع اللاعبين بالعودة للوبي (مهم جداً ليرجعوا معك)
      broadcast({ type: 'RETURN_TO_LOBBY', players: onlinePlayers });

      // 4. إعادة ضبط زر البدء
      const btnStart = document.getElementById('btn-host-start');
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.classList.add('opacity-50', 'cursor-not-allowed');
        btnStart.classList.remove('animate-pulse');
        btnStart.innerText = "بانتظار جاهزية الجميع...";
      }

      // 5. الذهاب للوبي
      showScreen('online-lobby');

    } else {
      // (احتياط) إذا ضغط اللاعب زر خروج
      showScreen('online-lobby');
    }
  } else {
    // --- وضع الأوفلاين ---
    showScreen('setup');
    updateCurrentCategoryUI(); // تحديث واجهة الفئة للتأكد أنها تعكس آخر اختيار
  }
}

function closeModal() {
  ['modal-stats', 'modal-alert', 'modal-confirm', 'modal-category', 'modal-settings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
  });
}
function closeStatsModal() { document.getElementById('modal-stats').classList.add('hidden'); }
function closeAlert() { document.getElementById('modal-alert').classList.add('hidden'); }

//Render Quick Category Selection ---
function renderQuickCategorySelection(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';

  // 1. خيار عشوائي (يظهر فقط إذا كان هناك أكثر من فئة أو صفر/الكل)
  if (state.allowedCategories.length !== 1) {
    const isRandomActive = state.selectedCategory === 'عشوائي';
    const label = state.allowedCategories.length === 0 ? "جميع الفئات" : "عشوائي";
    grid.innerHTML += `
        <div onclick="selectCategory('عشوائي', '${gridId}')" class="category-card ${isRandomActive ? 'active' : ''}">
             <span class="text-2xl">🎲</span>
             <span class="text-xs">${label}</span>
        </div>`;
  }

  // 2. عرض الفئات المختارة فقط
  state.allowedCategories.forEach(cat => {
    if (cat === "كلمات خاصة" && state.customWords.length < 4) return;

    let emoji = "❓";
    for (const group of Object.values(categoryGroups)) {
      const foundItem = group.find(item => item.id === cat);
      if (foundItem) { emoji = foundItem.emoji; break; }
    }

    const isActive = state.selectedCategory === cat;
    const isLocked = !isPremium && !FREE_CATEGORIES.includes(cat);
    const lockIcon = isLocked ? '🔒 ' : '';

    grid.innerHTML += `
        <div onclick="selectCategory('${cat}', '${gridId}')" class="category-card ${isActive ? 'active' : ''} ${isLocked ? 'opacity-50 grayscale' : ''}">
             <span class="text-2xl">${emoji}</span>
             <span class="text-xs">${lockIcon}${cat}</span>
        </div>`;
  });
}

function openCategoryModal() {
  const modal = document.getElementById('modal-category');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    renderQuickCategorySelection('modal-categories-grid'); // Call new function
  }
}
function closeCategoryModal() { const m = document.getElementById('modal-category'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); } }

let categoryOriginScreen = 'setup'; // ذاكرة لحفظ الشاشة التي جئنا منها

// دالة ذكية تكتشف مكانك الحالي قبل فتح القائمة الشاملة
function openComprehensiveCategory() {
  if (!document.getElementById('screen-final').classList.contains('hidden')) {
    categoryOriginScreen = 'final';
  } else if (!document.getElementById('screen-online-lobby').classList.contains('hidden')) {
    categoryOriginScreen = 'online-lobby';
  } else if (!document.getElementById('screen-setup').classList.contains('hidden')) {
    categoryOriginScreen = 'setup';
  } else {
    categoryOriginScreen = 'start';
  }

  showScreen('category-select');
  closeCategoryModal();
}

function checkResetButtonVisibility() {
  const trigger = document.getElementById('btn-reset-points-trigger');
  if (!trigger) return;

  // ✅✅✅ التعديل: إخفاء الزر إجبارياً في وضع الأونلاين ✅✅✅
  if (isOnline) {
    trigger.classList.add('hidden');
    return; // توقف هنا ولا تكمل بقية الكود
  }
  // ✅✅✅ ---------------------------------------------- ✅✅✅

  // الكود الأصلي للأوفلاين (يبقى كما هو)
  const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  const hasData = saved.some(p => (p.points || 0) > 0);
  trigger.classList.toggle('hidden', !hasData);
}

function confirmReset() {
  const modal = document.getElementById('modal-confirm');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  sounds.wrong();
}

// دالة إظهار التنبيهات 
function showAlert(message, isSuccess = false) {
  const modal = document.getElementById('modal-alert');
  const msgEl = document.getElementById('alert-message');
  const titleEl = modal.querySelector('h3'); // لكي نغير العنوان أيضاً

  msgEl.innerText = message;

  if (isSuccess) {
    // حالة النجاح
    titleEl.innerText = "عملية ناجحة! ✨";
    titleEl.className = "text-2xl font-black mb-4 text-emerald-500"; // لون أخضر
    sounds.win(); // نشغل صوت النجاح من هنا
  } else {
    // حالة الخطأ (الافتراضية)
    titleEl.innerText = "تنبيه! ⚠️";
    titleEl.className = "text-2xl font-black mb-4 text-yellow-500"; // لون أصفر
    sounds.wrong(); // نشغل صوت الخطأ
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

// --- Category Selection Logic (Grouped) ---
function renderCategorySelectionGrid() {
  const grid = document.getElementById('selection-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const [groupName, cats] of Object.entries(categoryGroups)) {
    const header = document.createElement('div');
    header.className = "section-header";
    header.innerText = groupName;
    grid.appendChild(header);

    const subGrid = document.createElement('div');
    subGrid.className = "grid grid-cols-3 gap-2 text-center mb-4";

    cats.forEach(catItem => {
      const catName = catItem.id;
      const catEmoji = catItem.emoji;

      if (wordBank[catName] || catName === "كلمات خاصة") {
        const isSelected = state.allowedCategories.includes(catName);

        const isLocked = !isPremium && !FREE_CATEGORIES.includes(catName);
        const lockIcon = isLocked ? '<span class="absolute top-1 left-1 text-xs px-1">🔒</span>' : '';
        const lockedClass = isLocked ? 'opacity-60 grayscale cursor-not-allowed' : '';
        const clickAction = isLocked ? `openPremiumModal()` : `toggleCategorySelection('${catName}')`;

        subGrid.innerHTML += `
            <div onclick="${clickAction}" class="category-card relative ${isSelected ? 'selected active' : ''} ${lockedClass}">
                ${lockIcon}
                <div class="check-badge">✓</div>
                <span class="text-2xl">${catEmoji}</span>
                <span class="text-xs font-bold">${catName}</span>
            </div>
        `;
      }
    });
    grid.appendChild(subGrid);
  }
  updateCatCounter();

  // ✅ التعديل الذكي: إظهار مربع إدخال الكلمات فور تحديد فئة "كلمات خاصة"
  const customUI = document.getElementById('custom-words-ui');
  if (customUI) {
    if (state.allowedCategories.includes('كلمات خاصة')) {
      customUI.classList.remove('hidden');
    } else {
      customUI.classList.add('hidden');
    }
  }
}

function toggleCategorySelection(cat) {
  // 🔒 حماية: إذا لم يكن بريميوم والفئة ليست مجانية -> افتح نافذة الشراء
  if (!isPremium && !FREE_CATEGORIES.includes(cat)) {
    openPremiumModal();
    return;
  }

  if (state.allowedCategories.includes(cat)) {
    state.allowedCategories = state.allowedCategories.filter(c => c !== cat);
  } else {
    if (state.allowedCategories.length < 12) {
      state.allowedCategories.push(cat);
    } else {
      showAlert("الحد الأقصى 12 فئة!");
    }
  }
  sounds.tick();
  renderCategorySelectionGrid();
}

function updateCurrentCategoryUI() {
  let text = state.selectedCategory;
  let emoji = "🎲";

  if (text !== "عشوائي") {
    for (const group of Object.values(categoryGroups)) {
      const found = group.find(item => item.id === text);
      if (found) { emoji = found.emoji; break; }
    }
  }

  // تحديث شاشة الأوفلاين
  const offlineText = document.getElementById('setup-current-cat-text');
  if (offlineText) {
    if (state.allowedCategories.length === 0 && text === 'عشوائي') {
      offlineText.innerText = `جميع الفئات 🎲`;
    } else if (text === 'عشوائي') {
      offlineText.innerText = `عشوائي (من المختار) 🎲`;
    } else {
      offlineText.innerText = `${text} ${emoji}`;
    }
  }

  // تحديث زر المضيف في الأونلاين
  const hostEmoji = document.getElementById('host-current-cat-emoji');
  const hostText = document.getElementById('host-current-cat-text');
  if (hostEmoji && hostText) {
    hostEmoji.innerText = emoji;
    if (state.allowedCategories.length === 0 && text === 'عشوائي') hostText.innerText = 'جميع الفئات';
    else hostText.innerText = text;
  }
}

// تعديل دالة الاختيار لتقوم بتحديث النصوص
function selectCategory(cat, gridId) {
  if (cat === 'كلمات خاصة' && !isPremium) return openPremiumModal();
  if (!isPremium && !FREE_CATEGORIES.includes(cat) && cat !== 'عشوائي') return openPremiumModal();

  state.selectedCategory = cat;
  if (gridId === 'modal-categories-grid') renderQuickCategorySelection('modal-categories-grid');
  sounds.tick();

  updateCurrentCategoryUI();
}

function updateCatCounter() {
  const count = state.allowedCategories.length;
  const counter = document.getElementById('cat-counter');
  counter.innerText = count === 0 ? "الكل" : count;
  counter.classList.add('text-primary');
}

// دالة تأكيد الفئات (النسخة النهائية المفتوحة)
function confirmCategories() {
  // 🛡️ حماية: منع التأكيد إذا اختار "كلمات خاصة" ولم يضف كلمات كافية
  if (state.allowedCategories.includes('كلمات خاصة') && state.customWords.length < 4) {
    showAlert("الرجاء إضافة 4 كلمات خاصة على الأقل للبدء! ✍️");
    return; // توقف ولا تخرج من الشاشة
  }

  if (state.allowedCategories.length === 1) {
    state.selectedCategory = state.allowedCategories[0];
  } else {
    state.selectedCategory = 'عشوائي';
  }

  showScreen(categoryOriginScreen);
  updateCurrentCategoryUI();

  // ✨ النزول التلقائي لأسفل الشاشة إذا كنا عائدين لصفحة النتائج ✨
  if (categoryOriginScreen === 'final') {
    setTimeout(() => {
      const finalScreen = document.getElementById('screen-final');
      if (finalScreen) {
        // النزول بنعومة لأسفل الشاشة
        finalScreen.scrollTo({ top: finalScreen.scrollHeight, behavior: 'smooth' });
      }
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50); // تأخير بسيط جداً لضمان تحميل الشاشة أولاً
  }
}

// --- Setup Logic ---
function renderActiveCategoryGrid() {
  const grid = document.getElementById('active-category-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // خيار "عشوائي" (دائماً في البداية)
  grid.innerHTML += `
    <div onclick="selectCategory('عشوائي', 'active-category-grid')" 
         class="category-card ${state.selectedCategory === 'عشوائي' ? 'active' : ''}">
         <span class="text-2xl">🎲</span>
         <span class="text-xs">عشوائي</span>
    </div>`;

  // عرض الفئات المختارة
  state.allowedCategories.forEach(cat => {
    let emoji = "❓"; // إيموجي افتراضي

    // البحث عن الإيموجي الصحيح داخل هيكلية المجموعات الجديدة
    // نلف على كل مجموعة (قيم الكائن categoryGroups)
    for (const group of Object.values(categoryGroups)) {
      // نبحث داخل المصفوفة عن الكائن الذي يملك نفس الـ id
      const foundItem = group.find(item => item.id === cat);
      if (foundItem) {
        emoji = foundItem.emoji;
        break; // وجدناه، نوقف البحث
      }
    }

    grid.innerHTML += `
        <div onclick="selectCategory('${cat}', 'active-category-grid')" 
             class="category-card ${state.selectedCategory === cat ? 'active' : ''}">
             <span class="text-2xl">${emoji}</span>
             <span class="text-xs font-bold">${cat}</span>
        </div>`;
  });
}

// --- Main Functions ---
// دالة لتنظيف النص العربي
function normalizeArabic(text) {
  return text.replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').trim();
}

// دالة لتنظيف النصوص من الأكواد الخبيثة
function sanitizeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag]));
}

function addCustomWord() {
  const input = document.getElementById('custom-word-input');
  const word = input.value.trim();
  if (word) {
    // التحقق باستخدام النص المنظف
    const normalizedNewWord = normalizeArabic(word);
    if (state.customWords.some(w => normalizeArabic(w.word) === normalizedNewWord)) {
      showAlert("هذه الكلمة مضافة بالفعل!");
      return;
    }
    state.customWords.push({ word });
    localStorage.setItem('spy_custom_words', JSON.stringify(state.customWords));
    input.value = ''; renderCustomWords();
  }
}

function renderCustomWords() {
  const list = document.getElementById('custom-words-list');
  if (!list) return; list.innerHTML = '';

  state.customWords.forEach((w, i) => {
    // تحسين شكل زر الحذف ليكون أوضح
    list.innerHTML += `<span class="bg-indigo-500/20 px-3 py-1.5 rounded-full border border-indigo-500/30 shadow-sm text-xs font-bold text-theme-main flex items-center gap-2">${w.word} <button onclick="removeCustomWord(${i})" class="text-red-400 hover:text-red-500 text-base leading-none">&times;</button></span>`;
  });
}

// ✨ دالة جديدة لحذف الكلمة وتحديث الذاكرة ✨
function removeCustomWord(index) {
  state.customWords.splice(index, 1);
  localStorage.setItem('spy_custom_words', JSON.stringify(state.customWords));
  renderCustomWords();
}

function setVotingMode(mode) {
  state.votingMode = mode;
  const groupBtn = document.getElementById('btn-vote-group');
  const indivBtn = document.getElementById('btn-vote-individual');

  // التصميمات الجديدة للأزرار المليئة بالعرض
  const activeClass = "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all bg-indigo-600 text-white shadow-lg";
  const inactiveClass = "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all text-slate-400 hover:text-white";

  if (mode === 'group') {
    groupBtn.className = activeClass;
    indivBtn.className = inactiveClass;
  } else {
    indivBtn.className = activeClass;
    groupBtn.className = inactiveClass;
  }
  sounds.tick();
}

// دالة لتغيير ألوان أزرار نسبة التحدي الأعمى وتخزين قيمتها
function setBlindProbability(value, context) {
  // تحديد العناصر بناءً على هل نحن في الأونلاين أم الأوفلاين
  const prefix = context === 'online' ? 'btn-online-prob-' : 'btn-prob-';
  const inputId = context === 'online' ? 'online-blind-probability-select' : 'blind-probability-select';

  // 1. تحديث قيمة الحقل المخفي لكي يقرأها النظام
  document.getElementById(inputId).value = value;

  // 2. تحديث تصميم الأزرار (إضاءة الزر المختار وإطفاء البقية)
  const activeClass = "flex-1 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-lg";
  const inactiveClass = "flex-1 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white";

  ['0.05', '0.15', '0.25'].forEach(val => {
    const btn = document.getElementById(prefix + val);
    if (btn) {
      btn.className = (val === value) ? activeClass : inactiveClass;
    }
  });

  // تشغيل صوت "تكة" خفيف
  try { sounds.tick(); } catch (e) { }
}

function updateSetupInfo() {
  const pVal = document.getElementById('input-players').value;
  const tVal = document.getElementById('input-time').value;
  document.getElementById('val-players').innerText = pVal;
  document.getElementById('val-time-label').innerText = formatTimeLabel(tVal);

  const avail = parseInt(pVal) >= 5;

  // Double Agent Logic: < 5 players -> Shaded & Uncheckable
  const daContainer = document.getElementById('double-agent-container');
  const daCheckbox = document.getElementById('check-double-agent');
  if (parseInt(pVal) < 5) {
    daContainer.classList.add('opacity-50', 'pointer-events-none');
    daCheckbox.checked = false;
    daCheckbox.disabled = true;
  } else {
    daContainer.classList.remove('opacity-50', 'pointer-events-none');
    daCheckbox.disabled = false;
  }

  // Blind Mode vs Panic Button Logic
  const blindMode = document.getElementById('check-blind-mode').checked;
  const panicContainer = document.getElementById('panic-container');
  const panicCheckbox = document.getElementById('check-panic-mode');
  const probContainer = document.getElementById('blind-probability-container');

  if (blindMode) {
    panicContainer.classList.add('opacity-50', 'pointer-events-none');
    panicCheckbox.checked = false;
    panicCheckbox.disabled = true;
    if (probContainer) { probContainer.classList.remove('hidden'); probContainer.classList.add('flex'); } // ✨ إظهار
  } else {
    panicContainer.classList.remove('opacity-50', 'pointer-events-none');
    panicCheckbox.disabled = false;
    if (probContainer) { probContainer.classList.add('hidden'); probContainer.classList.remove('flex'); } // ✨ إخفاء
  }
}

function checkAndNext() {
  // Validate if "Custom Words" is selected but not enough words
  if (state.selectedCategory === 'كلمات خاصة' && state.customWords.length < 4) {
    showAlert("أضف 4 كلمات خاصة على الأقل للبدء!");
    return;
  }
  initPlayerNames();
}

function initPlayerNames() {
  const count = parseInt(document.getElementById('input-players').value);
  const container = document.getElementById('names-container');
  if (!container) return; container.innerHTML = '';
  const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');

  let usedAvatars = [];

  for (let i = 0; i < count; i++) {
    let p = saved[i];

    // إذا لم يكن هناك لاعب محفوظ، أو إذا كانت صورته مستخدمة بالفعل، نعطيه صورة جديدة
    if (!p || usedAvatars.includes(p.avatar)) {
      const availableAvatars = avatars.filter(a => !usedAvatars.includes(a));
      const newAvatar = availableAvatars.length > 0 ? availableAvatars[0] : avatars[i % avatars.length];
      p = { name: p ? p.name : `المحقق ${i + 1}`, avatar: newAvatar };
    }

    usedAvatars.push(p.avatar);

    container.innerHTML += `
        <div class="player-input-container">
            <div>
                <label class="player-label">اسم اللاعب ${i + 1}</label>
                <input type="text" id="name-${i}" value="${p.name}" maxlength="15" class="player-input" placeholder="اكتب الاسم...">
            </div>
            <input type="hidden" id="avatar-${i}" value="${p.avatar}">
            <div class="avatars-grid">
                ${avatars.map(a => `<button onclick="setAvatar(${i}, '${a}')" id="av-${i}-${a}" class="avatar-btn ${a === p.avatar ? 'selected' : ''}">${a}</button>`).join('')}
            </div>
        </div>`;
  }
  showScreen('names');
  refreshOfflineAvatarsUI(); // ✨ تشغيل دالة التضليل فوراً عند فتح الشاشة
}

// ✨ دالة جديدة تقوم بتضليل (إخفاء جزئي) للصور المحجوزة
function refreshOfflineAvatarsUI() {
  const count = parseInt(document.getElementById('input-players').value);

  // 1. جمع كل الصور المحجوزة حالياً
  let currentlyTaken = [];
  for (let i = 0; i < count; i++) {
    const hiddenInput = document.getElementById(`avatar-${i}`);
    if (hiddenInput) currentlyTaken.push(hiddenInput.value);
  }

  // 2. المرور على جميع الأزرار لتضليل المأخوذ منها
  for (let i = 0; i < count; i++) {
    const myAvatar = document.getElementById(`avatar-${i}`).value;

    avatars.forEach(a => {
      const btn = document.getElementById(`av-${i}-${a}`);
      if (btn) {
        // إذا كانت الصورة مأخوذة، وليست صورتي الحالية!
        if (currentlyTaken.includes(a) && myAvatar !== a) {
          // تضليل وإلغاء تفعيل الضغط (شفافية 30% وأبيض وأسود)
          btn.classList.add('opacity-30', 'grayscale', 'cursor-not-allowed', 'pointer-events-none');
        } else {
          // إرجاعها لشكلها الطبيعي (متاحة أو خاصة بي)
          btn.classList.remove('opacity-30', 'grayscale', 'cursor-not-allowed', 'pointer-events-none');
        }
      }
    });
  }
}

function setAvatar(pIdx, av) {
  const count = parseInt(document.getElementById('input-players').value);

  // حماية إضافية: التأكد أن الصورة ليست مأخوذة
  for (let i = 0; i < count; i++) {
    if (i !== pIdx) {
      const otherAv = document.getElementById(`avatar-${i}`).value;
      if (otherAv === av) return; // رفض التغيير
    }
  }

  // إعطائي الصورة الجديدة
  updateAvatarUI(pIdx, av);
  triggerVibrate(10);

  // ✨ تحديث التضليل للجميع بعد أن قمت بتغيير صورتي
  refreshOfflineAvatarsUI();
}

function updateAvatarUI(pIdx, av) {
  const container = document.getElementById(`names-container`).children[pIdx];
  if (!container) return;
  const buttons = container.querySelectorAll('.avatar-btn');
  buttons.forEach(btn => btn.classList.remove('selected'));

  const selectedBtn = document.getElementById(`av-${pIdx}-${av}`);
  if (selectedBtn) selectedBtn.classList.add('selected');

  const hiddenInput = document.getElementById(`avatar-${pIdx}`);
  if (hiddenInput) hiddenInput.value = av;
}

function startOnlineGame() {
  if (onlinePlayers.length < 3) return showAlert("3 لاعبين على الأقل!");

  // هذا يمنع المضيف من البدء إذا دخل شخص فجأة ولم يضغط جاهز
  const notReadyPlayer = onlinePlayers.find(p => !p.isReady);
  if (notReadyPlayer) {
    // إذا وجدنا لاعباً غير جاهز
    showAlert(`انتظر! اللاعب (${notReadyPlayer.name}) غير جاهز بعد ⏳`);

    // نقوم بتحديث حالة الزر ليعكس الواقع (يعطله)
    checkAllReady();
    return;
  }

  // 👇🚨 كود التحقق من النسخة المدفوعة 🚨👇
  if (typeof STRICT_PREMIUM_MODE !== 'undefined' && STRICT_PREMIUM_MODE) {
    // إذا كانت الفئة "عشوائي"، نسمح ببدء اللعبة، لأن النظام سيفلتر الفئات تلقائياً لاحقاً.
    // نتحقق فقط إذا اختار المضيف فئة محددة بعينها.
    if (state.selectedCategory !== 'عشوائي') {
      let isUsingPremium = !FREE_CATEGORIES.includes(state.selectedCategory);

      if (isUsingPremium) {
        const freePlayers = onlinePlayers.filter(p => !p.isHost && p.isPremium !== true);
        if (freePlayers.length > 0) {
          const names = freePlayers.map(p => p.name).join('، ');
          showAlert(`الفئة المحددة (${state.selectedCategory}) تحتاج للنسخة الكاملة 💎.\nاللاعبون: (${names}) يملكون النسخة المجانية فقط.`);
          checkAllReady();
          return;
        }
      }
    }
  }
  // 👆🚨 نهاية كود التحقق 🚨👆

  isGameStarted = true;

  // تصفير عدادات الأونلاين
  votesReceived = 0;
  state.votesHistory = [];

  state.players = onlinePlayers;
  state.timer = state.initialTimer;

  revealReadyCount = 0;

  // --- التعديل هنا: قراءة الإعدادات من واجهة الأونلاين الجديدة ---
  state.panicModeAllowed = document.getElementById('online-check-panic').checked;
  state.guessingEnabled = document.getElementById('online-check-guessing').checked;
  state.blindModeActive = document.getElementById('online-check-blind').checked;
  state.blindProbability = parseFloat(document.getElementById('online-blind-probability-select').value) || 0.15;

  // تفعيل العميل المزدوج والمموه
  state.doubleAgentActive = document.getElementById('online-check-double-agent').checked;
  state.undercoverActive = document.getElementById('online-check-undercover').checked;
  // -------------------------------------------------------------

  state.hintEnabled = document.getElementById('online-check-hint') ? document.getElementById('online-check-hint').checked : false;
  state.smartTurnsActive = document.getElementById('online-check-smart-turns').checked;

  setupRoles();

  state.players.forEach(p => {
    const roleData = state.currentRoles.find(r => r.id === p.id);

    const packet = {
      type: 'START_GAME',
      category: state.currentRoundCategory,
      secretData: state.secretData,
      undercoverData: state.currentUndercoverData,
      roleData: roleData,
      timer: state.timer,
      customWords: state.customWords,
      settings: {
        panicModeAllowed: state.panicModeAllowed,
        guessingEnabled: state.guessingEnabled,
        blindModeActive: state.blindModeActive,
        hintEnabled: state.hintEnabled,
        smartTurnsActive: state.smartTurnsActive
      }
    };

    if (p.id === 0) {
      state.myRole = roleData;
      setupOnlineRevealScreen();
    } else {
      if (hostConnections[p.id]) hostConnections[p.id].send(packet);
    }
  });
}

function setupOnlineRevealScreen() {
  // 1. إعادة بناء الشاشة إذا كانت ممسوحة
  ensureRevealScreenExists();

  // تصفير الماسح
  resetScanner();

  const passText = document.getElementById('reveal-pass-text');
  if (passText) passText.classList.add('hidden');

  const nextBtnEl = document.getElementById('btn-next-player');
  if (nextBtnEl) nextBtnEl.classList.add('hidden');

  const p = state.players.find(pl => pl.id === myPlayerId);
  if (p) {
    const nameEl = document.getElementById('reveal-player-name');
    if (nameEl) nameEl.innerText = "هويتك السرية";
  }

  // تعبئة البيانات
  if (state.myRole) {
    const roleData = state.myRole;
    const txt = document.getElementById('reveal-role-text');
    const word = document.getElementById('reveal-secret-word');
    const img = document.getElementById('reveal-img-placeholder');
    const desc = document.getElementById('reveal-word-desc');

    if (txt && word && img && desc) {

      const getCatEmoji = (cat) => {
        for (const group of Object.values(categoryGroups)) {
          const found = group.find(item => item.id === cat);
          if (found && found.emoji) return found.emoji;
        }
        return "🏷️";
      };

      const catEmoji = getCatEmoji(state.currentRoundCategory);

      // تصميم صندوق الفئة
      desc.classList.remove('hidden');
      desc.innerText = `${catEmoji} ${state.currentRoundCategory}`;
      desc.className = "text-sm sm:text-base text-indigo-300 mt-4 font-bold bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20 relative z-10 inline-block shadow-lg shadow-indigo-500/10";

      if (roleData.role === 'in') {
        txt.innerText = "أنت تعرف السالفة!";
        word.innerText = state.secretData.word;
        img.innerText = "🕵️‍♂️";
        txt.className = "text-xl font-bold mb-4 text-emerald-500";
      } else if (roleData.role === 'out') {
        txt.innerText = "أنت الضايع!";
        word.innerText = "؟؟؟؟؟";
        img.innerText = "😶‍🌫️";

        if (state.hintEnabled && state.secretData) {
          const wordLength = state.secretData.word.replace(/\s/g, '').length;
          desc.innerText = `${catEmoji} ${state.currentRoundCategory} - ${wordLength} حروف`;
          desc.className = "text-sm sm:text-base text-blue-400 mt-4 font-bold bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 relative z-10 inline-block shadow-lg shadow-blue-500/10";
        } else {
          desc.innerText = "؟؟؟؟؟";
          desc.className = "text-sm sm:text-base text-blue-400 mt-4 font-bold bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 relative z-10 inline-block shadow-lg shadow-blue-500/10";
        }
        txt.className = "text-xl font-bold mb-4 text-red-500 relative z-10";
      } else if (roleData.role === 'agent') {
        txt.innerText = "أنت العميل!";
        word.innerText = state.secretData.word;
        img.innerText = "🎭";
        txt.className = "text-xl font-bold mb-4 text-orange-500";
      } else if (roleData.role === 'undercover') {
        txt.innerText = "أنت المموه!";
        const ucWord = state.currentUndercoverData ? state.currentUndercoverData.word : "موضوع قريب";
        word.innerText = ucWord;
        img.innerText = "🤫";
        txt.className = "text-xl font-bold mb-4 text-yellow-500";
      }
    }
  }

  const actionBtn = document.getElementById('btn-reveal-action');
  if (actionBtn) actionBtn.classList.add('hidden');

  showScreen('reveal');

  // --- التعديل الجوهري: منطق زر التالي الجديد ---
  if (nextBtnEl) {
    nextBtnEl.onclick = () => {
      const screenReveal = document.getElementById('screen-reveal');
      if (screenReveal) {

        // 1. إرسال إشارة الجاهزية
        if (!isHost) {
          // إذا كنت لاعباً، أخبر المضيف أني جاهز
          myConn.send({ type: 'REVEAL_READY' });
          // عرض شاشة انتظار اللاعب
          screenReveal.innerHTML = '<div class="flex flex-col h-full justify-center items-center"><div class="text-6xl mb-6 animate-bounce">⏳</div><h1 class="text-2xl font-bold text-center">بانتظار بدء الوقت...</h1></div>';
        } else {
          // إذا كنت المضيف، أنا جاهز أيضاً
          revealReadyCount++;

          // تجهيز حاوية الانتظار للمضيف
          screenReveal.innerHTML = '<div class="flex flex-col h-full justify-center items-center host-wait-container"></div>';

          // تحديث الشاشة فوراً
          updateHostWaitingScreen();
        }
      }
    };
  }
}

function startGame() {
  // هذا الكود يمسح البيانات القديمة تلقائياً إذا كانت فاسدة
  try {
    const testData = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players'));
    if (testData && testData.length > 0 && !testData[0].stats) {
      // إذا وجدنا بيانات قديمة لا تحتوي على الإحصائيات الجديدة
      localStorage.removeItem('out_loop_tablet_v4_players');
      console.log("تم إعادة تعيين البيانات لعدم التوافق");
    }
  } catch (e) {
    localStorage.removeItem('out_loop_tablet_v4_players');
  }

  const count = parseInt(document.getElementById('input-players').value);

  // --- بداية التعديل: التحقق من الفراغات والتكرار ---
  const enteredNames = new Set(); // نستخدم Set لتخزين الأسماء المفلترة

  for (let i = 0; i < count; i++) {
    const nameInp = document.getElementById(`name-${i}`);
    const nameVal = nameInp ? nameInp.value.trim() : "";

    // 1. التحقق من أن الاسم ليس فارغاً
    if (nameVal === "") {
      showAlert("الرجاء كتابة أسماء جميع اللاعبين!");
      return;
    }

    // ✨ التعديل الجديد: التحقق من طول الاسم (للاحتياط) ✨
    if (nameVal.length > 15) {
      showAlert(`الاسم "${nameVal}" طويل جداً! (الحد الأقصى 15 حرف)`);
      return;
    }

    // 2. التحقق من التكرار عبر تنظيف الاسم
    const normalizedName = normalizeArabic(nameVal);

    if (enteredNames.has(normalizedName)) {
      showAlert(`الاسم "${nameVal}" مكرر أو مشابه! يرجى تغييره.`);
      return;
    }

    enteredNames.add(normalizedName);
  }
  // --- نهاية التعديل ---

  state.players = [];
  const savedData = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  for (let i = 0; i < count; i++) {
    const nameInp = document.getElementById(`name-${i}`);
    const name = sanitizeHTML(nameInp.value.trim());
    const avatar = document.getElementById(`avatar-${i}`).value;
    const existing = savedData[i];
    state.players.push({
      id: i, name, avatar,
      points: existing ? (existing.points || 0) : 0,
      stats: existing?.stats || { det: { w: 0, l: 0 }, out: { w: 0, l: 0 }, agt: { w: 0, l: 0 }, und: { w: 0, l: 0 } }
    });
  }
  localStorage.setItem('out_loop_tablet_v4_players', JSON.stringify(state.players));

  state.revealOrder = state.players.map((_, i) => i).sort(() => Math.random() - 0.5);

  state.timer = parseInt(document.getElementById('input-time').value);
  state.initialTimer = state.timer;
  state.doubleAgentActive = document.getElementById('check-double-agent').checked;
  state.undercoverActive = document.getElementById('check-undercover').checked;

  // "Kashaft Al Salfa" toggle logic
  state.panicModeAllowed = document.getElementById('check-panic-mode').checked;
  state.guessingEnabled = document.getElementById('check-guessing').checked;

  state.blindModeActive = document.getElementById('check-blind-mode').checked;
  state.blindProbability = parseFloat(document.getElementById('blind-probability-select').value) || 0.15;
  state.hintEnabled = document.getElementById('check-hint').checked;
  state.smartTurnsActive = document.getElementById('check-smart-turns').checked;

  // Smart Distractors is ALWAYS active
  state.smartDistractors = true;

  setupRoles();
  state.revealIndex = 0; state.panicMode = false;

  const panicBtn = document.getElementById('btn-panic');
  if (panicBtn) {
    // Show button if allowed AND not blind mode
    if (state.panicModeAllowed && !state.blindModeActive) panicBtn.classList.remove('hidden');
    else panicBtn.classList.add('hidden');
  }
  startRevealSequence();
}

function setupRoles() {
  if (state.customWords.length > 0) wordBank["كلمات خاصة"] = state.customWords;

  let cat = state.selectedCategory;
  let pool;

  if (cat === "عشوائي") {
    let availableCats = [];
    if (state.allowedCategories.length === 0) {
      for (const group of Object.values(categoryGroups)) {
        availableCats.push(...group.map(item => item.id));
      }
    } else {
      availableCats = [...state.allowedCategories];
    }

    let restrictToFree = !isPremium;
    if (isOnline && isHost && typeof STRICT_PREMIUM_MODE !== 'undefined' && STRICT_PREMIUM_MODE) {
      const hasFreePlayers = onlinePlayers.some(p => !p.isHost && p.isPremium !== true);
      if (hasFreePlayers) restrictToFree = true;
    }

    if (restrictToFree) {
      availableCats = availableCats.filter(c => FREE_CATEGORIES.includes(c));
    }

    if (state.customWords.length >= 4 && (state.allowedCategories.length === 0 || state.allowedCategories.includes("كلمات خاصة"))) {
      if (!availableCats.includes("كلمات خاصة")) availableCats.push("كلمات خاصة");
      wordBank["كلمات خاصة"] = state.customWords;
    }

    availableCats = availableCats.filter(c => wordBank[c] && wordBank[c].length > 0);
    if (availableCats.length === 0) availableCats = ["طعام"];
    cat = availableCats[Math.floor(Math.random() * availableCats.length)];
  }

  state.currentRoundCategory = cat;
  pool = wordBank[cat] || wordBank["طعام"];

  if (!isPremium) {
    if (pool.length > 7) pool = pool.slice(0, 7);
  }

  if (!pool || pool.length === 0) { cat = "طعام"; state.currentRoundCategory = "طعام"; pool = wordBank["طعام"]; }

  // 3. اختيار السالفة
  let candidates = pool.filter(w => !state.usedWords.includes(w.word));

  // ✨ التعديل الذكي: إذا لعبت كل كلمات الفئة، نصفر كلمات هذه الفئة فقط من الذاكرة ✨
  if (candidates.length === 0) {
    state.usedWords = state.usedWords.filter(used => !pool.some(p => p.word === used));
    candidates = pool;
  }

  const selectedSecret = candidates[Math.floor(Math.random() * candidates.length)];

  // تعيين السالفة
  state.secretData = { ...selectedSecret };

  // إضافة السالفة للسجل
  state.usedWords.push(state.secretData.word);

  // ✨ حفظ السجل في الذاكرة للأبد (بدون مسح القديم) ✨
  localStorage.setItem('spy_used_words', JSON.stringify(state.usedWords));

  // 4. منطق المموه (باستخدام كلمة الربط related)
  let ucData = null;
  if (cat === "كلمات خاصة") {
    const others = pool.filter(w => w.word !== state.secretData.word);
    if (others.length > 0) ucData = { ...others[Math.floor(Math.random() * others.length)] };
  } else {
    if (typeof state.secretData.related === 'string' && state.secretData.related.trim() !== '') {
      const relatedGroup = pool.filter(w => w.related === state.secretData.related && w.word !== state.secretData.word);
      if (relatedGroup.length > 0) {
        const randomRelatedWord = relatedGroup[Math.floor(Math.random() * relatedGroup.length)];
        ucData = { ...randomRelatedWord };
      } else {
        const others = pool.filter(w => w.word !== state.secretData.word);
        if (others.length > 0) ucData = { ...others[Math.floor(Math.random() * others.length)] };
      }
    } else {
      const others = pool.filter(w => w.word !== state.secretData.word);
      if (others.length > 0) ucData = { ...others[Math.floor(Math.random() * others.length)] };
    }
  }

  // ✨ احتياط للمموه بدون إيموجي للكلمة ✨
  if (!ucData) ucData = { word: "موضوع قريب" };
  state.currentUndercoverData = ucData;

  // 5. توزيع الأدوار
  state.outPlayerIds = [];
  state.agentPlayerId = null;
  state.undercoverPlayerId = null;
  state.blindRoundType = null;

  const selectFairPlayer = (availableIds, statKey, lastPlayerId) => {
    const counts = availableIds.map(id => {
      const p = state.players.find(x => x.id === id);
      const s = p.stats || {};
      const count = (s[statKey]?.w || 0) + (s[statKey]?.l || 0);
      return { id: id, count: count };
    });
    const min = Math.min(...counts.map(c => c.count));
    let candidates = counts.filter(c => c.count === min).map(c => c.id);
    if (candidates.length === availableIds.length && candidates.length > 1) {
      if (lastPlayerId !== undefined && lastPlayerId !== null) {
        candidates = candidates.filter(id => id !== lastPlayerId);
      }
    }
    if (candidates.length === 0) candidates = availableIds;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  if (state.blindModeActive && Math.random() < (state.blindProbability || 0.15)) {
    if (state.lastBlindType === 'all_in') state.blindRoundType = 'all_out';
    else if (state.lastBlindType === 'all_out') state.blindRoundType = 'all_in';
    else state.blindRoundType = (Math.random() < 0.5) ? 'all_in' : 'all_out';
    state.lastBlindType = state.blindRoundType;
    if (state.blindRoundType === 'all_out') state.outPlayerIds = state.players.map(p => p.id);
  } else {
    let remainingIds = state.players.map(p => p.id);
    const outID = selectFairPlayer(remainingIds, 'out', state.lastOutPlayerId);
    state.outPlayerIds = [outID];
    state.lastOutPlayerId = outID;
    remainingIds = remainingIds.filter(id => id !== outID);

    if (state.doubleAgentActive && remainingIds.length > 0) {
      const agentID = selectFairPlayer(remainingIds, 'agent', state.lastAgentPlayerId);
      state.agentPlayerId = agentID;
      state.lastAgentPlayerId = agentID;
      remainingIds = remainingIds.filter(id => id !== agentID);
    }
    if (state.undercoverActive && remainingIds.length > 0) {
      const ucID = selectFairPlayer(remainingIds, 'undercover', state.lastUndercoverPlayerId);
      state.undercoverPlayerId = ucID;
      state.lastUndercoverPlayerId = ucID;
      remainingIds = remainingIds.filter(id => id !== ucID);
    }
  }

  state.currentRoles = state.players.map(p => {
    let role = 'in';
    if (state.blindRoundType === 'all_out') role = 'out';
    else if (state.blindRoundType === 'all_in') role = 'in';
    else {
      if (state.outPlayerIds.includes(p.id)) role = 'out';
      else if (p.id === state.agentPlayerId) role = 'agent';
      else if (p.id === state.undercoverPlayerId) role = 'undercover';
    }
    return { id: p.id, role: role };
  });
}

function startRevealSequence() {
  // 1. إعادة بناء الشاشة إذا كانت ممسوحة (تعالج تعارض الأونلاين/الأوفلاين)
  ensureRevealScreenExists();

  // ✅ إضافة: تصفير واجهة المؤقت مسبقاً لمنع ظهور الوقت القديم
  resetTimerUI();

  const passText = document.getElementById('reveal-pass-text');
  if (passText) passText.classList.remove('hidden');

  if (state.revealIndex >= state.players.length) {
    showScreen('game');

    // ✨ تشغيل نظام الأدوار للأوفلاين (فقط إذا كان مفعلاً) ✨
    if (!isOnline && state.smartTurnsActive) {
      offlineAvailableAskers = [];
      offlinePickNextTurn();
    }

    startTimer();
    return;
  }

  // تصفير الماسح قبل عرض اللاعب
  resetScanner();

  // --- الإصلاح هنا: التحقق من وجود الزر قبل استخدامه ---
  const nextBtn = document.getElementById('btn-next-player');
  if (nextBtn) {
    nextBtn.classList.add('hidden');
  }
  // ---------------------------------------------------

  const progressEl = document.getElementById('scan-progress');
  const scannerEl = document.getElementById('fingerprint-scanner');
  const statusEl = document.getElementById('scan-status');

  if (progressEl) {
    progressEl.style.transition = 'none';
    progressEl.style.strokeDashoffset = '301.6';
    progressEl.style.opacity = '0';
    void progressEl.offsetWidth;
    progressEl.style.transition = '';
  }

  if (scannerEl) {
    scannerEl.classList.remove('scanning-active');
    scannerEl.style.pointerEvents = "auto";
  }

  if (statusEl) {
    statusEl.innerText = "ضع إصبعك للكشف";
    statusEl.className = "text-xs text-indigo-400 mt-4 font-mono h-4";
  }

  const playerIndex = state.revealOrder[state.revealIndex];
  const p = state.players[playerIndex];

  document.getElementById('reveal-player-name').innerText = `${p.avatar} ${p.name}`;
  const cardObj = document.getElementById('role-card');
  if (cardObj) cardObj.classList.remove('is-flipped');

  const revealBtn = document.getElementById('btn-reveal-action');
  if (revealBtn) revealBtn.innerText = 'كشف الدور';

  populateCardBack(p);
  showScreen('reveal');
}

// دالة تأثير فك التشفير (Matrix Style)
function scrambleText(elementId, finalText, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;

  // الحروف العشوائية التي ستظهر (عربية ورموز)
  const chars = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي?!@#$%&';
  let start = null;

  function update(timestamp) {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);

    // عدد الحروف التي تم كشفها
    const revealedLength = Math.floor(finalText.length * progress);

    // بناء النص: الجزء المكشوف + رموز عشوائية
    let output = finalText.substring(0, revealedLength);

    // إضافة الرموز العشوائية للباقي
    for (let i = revealedLength; i < finalText.length; i++) {
      // الحفاظ على المسافات كما هي
      if (finalText[i] === ' ') output += ' ';
      else output += chars[Math.floor(Math.random() * chars.length)];
    }

    el.innerText = output;

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.innerText = finalText; // التأكد من النص النهائي
    }
  }

  requestAnimationFrame(update);
}

function populateCardBack(player) {
  const roleData = state.currentRoles.find(r => r.id === player.id);
  const txt = document.getElementById('reveal-role-text');
  const word = document.getElementById('reveal-secret-word');
  const img = document.getElementById('reveal-img-placeholder');
  const desc = document.getElementById('reveal-word-desc');

  if (!state.secretData) {
    state.secretData = { word: "خطأ", related: [] };
  }

  // ✨ سحب الإيموجي مباشرة من قاعدة البيانات (categoryGroups) ✨
  const getCatEmoji = (cat) => {
    for (const group of Object.values(categoryGroups)) {
      const found = group.find(item => item.id === cat);
      if (found && found.emoji) return found.emoji;
    }
    return "🏷️"; // إيموجي افتراضي لو لم يجد الفئة
  };

  const catEmoji = getCatEmoji(state.currentRoundCategory);

  // ✨ تصميم صندوق الفئة للجميع (مثل صندوق التلميح) ✨
  desc.classList.remove('hidden');
  desc.innerText = `${catEmoji} ${state.currentRoundCategory}`;
  desc.className = "text-sm sm:text-base text-indigo-300 mt-4 font-bold bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-500/20 relative z-10 inline-block shadow-lg shadow-indigo-500/10";

  if (roleData.role === 'in') {
    txt.innerText = "أنت تعرف السالفة!";
    word.innerText = state.secretData.word;
    img.innerText = "🕵️‍♂️";
    txt.className = "text-xl font-bold mb-4 text-emerald-500";
  } else if (roleData.role === 'agent') {
    txt.innerText = "أنت العميل! احمِ الضايع:";
    word.innerText = state.secretData.word;
    img.innerText = "🎭";
    txt.className = "text-xl font-bold mb-4 text-orange-500";
  } else if (roleData.role === 'undercover') {
    txt.innerText = "أنت المموه! كلمتك:";
    word.innerText = state.currentUndercoverData.word;
    img.innerText = "🤫";
    txt.className = "text-xl font-bold mb-4 text-yellow-500";
  } else {
    txt.innerText = "أنت الضايع!";
    word.innerText = "؟؟؟؟؟";
    img.innerText = "😶‍🌫️";

    // ✨ صندوق التلميح الخاص بالضايع (مدمج معه إيموجي الفئة) ✨
    if (state.hintEnabled && state.secretData) {
      const wordLength = state.secretData.word.replace(/\s/g, '').length;
      desc.innerText = `${catEmoji} ${state.currentRoundCategory} - ${wordLength} حروف`;
      desc.className = "text-sm sm:text-base text-blue-400 mt-4 font-bold bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 relative z-10 inline-block shadow-lg shadow-blue-500/10";
    } else {
      desc.innerText = "؟؟؟؟؟";
      desc.className = "text-sm sm:text-base text-blue-400 mt-4 font-bold bg-blue-500/10 px-4 py-2 rounded-xl border border-blue-500/20 relative z-10 inline-block shadow-lg shadow-blue-500/10";
    }

    txt.className = "text-xl font-bold mb-4 text-red-500";
  }
}

// 2. الدالة الموحدة للكشف (تستخدمها البطاقة والزر)
function performRevealLogic() {
  const cardObj = document.getElementById('role-card');
  const btn = document.getElementById('btn-reveal-action');

  // الحالة 1: البطاقة مغلقة -> نريد كشف الدور
  if (!cardObj.classList.contains('is-flipped')) {
    const roleTxt = document.getElementById('reveal-role-text').innerText;
    const secretWord = document.getElementById('reveal-secret-word').innerText;

    scrambleText('reveal-role-text', roleTxt);
    scrambleText('reveal-secret-word', secretWord);

    triggerRevealEffects();
    cardObj.classList.add('is-flipped');

    // في الأونلاين، لا نغير النص إلى "التالي" بل نتركه أو نخفيه لاحقاً
    if (!isOnline) {
      if (btn) btn.innerText = "التالي";
    }
  }

  // الحالة 2: البطاقة مكشوفة -> إغلاقها
  else {
    cardObj.classList.remove('is-flipped');
    if (btn) btn.innerText = "كشف الدور";

    if (sounds && sounds.flip) sounds.flip();

    setTimeout(() => {
      // الفرق الجوهري هنا:
      if (isOnline) {
        // في الأونلاين: عند إغلاق البطاقة، نخفي زر الكشف ونظهر زر الانتظار
        document.getElementById('btn-reveal-action').classList.add('hidden');
        document.getElementById('btn-next-player').classList.remove('hidden'); // زر الانتظار الذي جهزناه
      } else {
        // في الأوفلاين: ننتقل للاعب التالي
        state.revealIndex++;
        startRevealSequence();
      }
    }, 300);
  }
}

// 3. ربط الزر (Button) بالمنطق الموحد
// سيقوم بمسح الدالة القديمة واستبدالها بهذه
window.toggleReveal = function () {
  performRevealLogic();
};

// 4. ربط البطاقة (Card) بالمنطق الموحد
// سيقوم بمسح الدالة القديمة واستبدالها بهذه
window.flipCard = function () {
  const cardObj = document.getElementById('role-card');

  // عند الضغط على البطاقة:
  // إذا كانت مغلقة -> اكشفها (شغل الغليتش)
  // إذا كانت مفتوحة -> لا تفعل شيئاً (نترك زر "التالي" يقوم بالمهمة لتجنب الخطأ)
  if (!cardObj.classList.contains('is-flipped')) {
    performRevealLogic();
  }
};

function hostStartTimer() {
  broadcast({ type: 'GAME_PHASE', phase: 'game' });
  showScreen('game');
  const panicBtn = document.getElementById('btn-panic');
  if (panicBtn) {
    // نتأكد أن الدور "ضايع" وأن الميزة مفعلة
    if (state.myRole && state.myRole.role === 'out' && state.panicModeAllowed) {
      panicBtn.classList.remove('hidden');
    } else {
      panicBtn.classList.add('hidden');
    }
  }
  startTimer();

  // ✨ الإضافة هنا: تصفير القائمة وبدء أول دور (فقط إذا كان مفعلاً)
  availableAskers = [];
  if (state.smartTurnsActive) {
    setTimeout(() => {
      hostPickNextTurn();
    }, 1000);
  }
}

// دالة المؤقت (تم دمج الأونلاين والأوفلاين هنا)
function startTimer() {
  state.isPaused = false;
  clearInterval(state.interval);

  // ✅ إضافة: تأكيد التصفير عند بدء العد
  resetTimerUI();

  state.interval = setInterval(() => {
    if (state.isPaused) return;
    state.timer--;

    // التحديث المحلي
    const circumference = 565.48;
    const progressEl = document.getElementById('timer-progress');
    // حماية من الأخطاء في حالة عدم وجود العنصر
    if (progressEl && state.initialTimer > 0) {
      const offset = circumference * (1 - (state.timer / state.initialTimer));
      progressEl.style.strokeDashoffset = offset;
    }

    const m = Math.floor(state.timer / 60), s = state.timer % 60;
    const timeText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    const timerEl = document.getElementById('game-timer');
    if (timerEl) timerEl.innerText = timeText;

    // البث للأونلاين (كل ثانية) للمضيف فقط
    if (isOnline && isHost) {
      const offset = circumference * (1 - (state.timer / state.initialTimer));
      broadcast({
        type: 'SYNC_TIMER',
        timeText: timeText,
        offset: offset,
        seconds: state.timer
      });
    }

    // --- الإضافة الجديدة: منطق التوتر (آخر 10 ثواني) ---
    const gameScreen = document.getElementById('screen-game');

    if (state.timer <= 10 && state.timer > 0) {
      // 1. تشغيل صوت القلب
      playHeartbeatSound();

      // 2. تفعيل تأثير النبض البصري
      gameScreen.classList.add('panic-pulse-active');

      // 3. تسريع النبض كلما قل الوقت (تعديل مدة الأنيميشن)
      // كلما قل الوقت، قلت مدة الأنيميشن (أسرع)
      const speed = Math.max(0.4, state.timer / 10);
      gameScreen.style.animationDuration = `${speed}s`;

      // اهتزاز خفيف للجهاز مع كل دقة
      if (state.timer % 2 === 0) triggerVibrate(50);

    } else {
      // إزالة التأثير إذا كان الوقت أكثر من 10 (أو انتهى)
      gameScreen.classList.remove('panic-pulse-active');
      gameScreen.style.animationDuration = '0s'; // إعادة تعيين

      // تشغيل صوت التكتكة العادية إذا لم نكن في وضع التوتر
      if (state.timer > 10 && state.timer <= 5) sounds.tick(); // (اختياري: يمكنك حذف هذا السطر لمنع تداخل الأصوات)
    }

    if (state.timer <= 0) {
      clearInterval(state.interval);
      gameScreen.classList.remove('panic-pulse-active');
      if (isOnline) {
        broadcast({ type: 'GAME_PHASE', phase: 'voting' });
        showOnlineVotingScreen();
      } else {
        startVoting();
      }
    }
  }, 1000);
}

function pauseTimer() { state.isPaused = !state.isPaused; document.getElementById('btn-pause').innerText = state.isPaused ? "استئناف" : "إيقاف مؤقت"; }

function endGameEarly() {
  clearInterval(state.interval);

  if (isOnline && isHost) {
    // في الأونلاين: نرسل أمر الانتقال للتصويت للجميع (بما فيهم المضيف عبر البث)
    broadcast({ type: 'GAME_PHASE', phase: 'voting' });

    // المضيف أيضاً يجب أن ينتقل للتصويت
    state.votingMode = 'group'; // ضمان نمط الجماعي
    showOnlineVotingScreen();
  } else {
    // في الأوفلاين: السلوك الطبيعي
    startVoting();
  }
}

function triggerPanic() {
  document.getElementById('screen-guess').classList.remove('panic-pulse-active');
  if (isOnline) {
    if (!isHost) {
      // أنا لاعب عادي (الضايع) -> أرسل طلب للمضيف
      myConn.send({ type: 'PANIC_TRIGGER' });

      // تعطيل الزر مؤقتاً لمنع التكرار
      const btn = document.getElementById('btn-panic');
      if (btn) {
        btn.innerText = "جاري الإرسال...";
        btn.disabled = true;
      }
    } else {
      const myName = onlinePlayers.find(p => p.id === 0)?.name || "المضيف";

      broadcast({ type: 'GAME_PHASE', phase: 'panic', panicPlayerName: myName });
      executePanicPhase(myName);
    }
  } else {
    // أوفلاين
    executePanicPhase();
  }
}

// ✅ تعديل: استقبال اسم إجباري (يأتي من السيرفر/المضيف)
function executePanicPhase(forcedName = null) {
  clearInterval(state.interval);
  state.panicMode = true;

  state.votesHistory = [];
  state.votesAccumulated = {};

  // 1. تحديد الاسم: الأولوية للاسم المرسل من المضيف
  let name = forcedName;

  // إذا لم يتم إرسال اسم (كما في حالة الأوفلاين)، نستخدم المنطق القديم
  if (!name) {
    if (state.blindRoundType === 'all_out') name = "الكل";
    else if (state.outPlayerIds.length > 0) {
      const p = state.players.find(x => x.id === state.outPlayerIds[0]);
      if (p) name = p.name;
    } else {
      name = "الضايع"; // اسم افتراضي
    }
  }

  if (isOnline) {
    // في الأونلاين:
    if (state.myRole.role === 'out') {
      // أنا الضايع -> اذهب للتخمين (مع تمرير اسمي ليظهر لي "لديك شجاعة يا فلان")
      startGuessingPhase(name, true);
    } else {
      // أنا لست الضايع -> شاشة انتظار (سيظهر لي اسم الضايع هنا)
      showPanicWaitScreen(name);
    }
  } else {
    // أوفلاين -> اذهب للتخمين فوراً
    startGuessingPhase(name, true);
  }
}

// دالة لتشغيل مرحلة التخمين بعد التصويت (بدون نقاط مضاعفة)
function executeCaughtGuessingPhase(forcedName) {
  state.panicMode = false; // تأكيد أننا لسنا في وضع "كشفت السالفة" الإرادي

  let name = forcedName;

  if (isOnline) {
    if (state.myRole.role === 'out') {
      // أنا الضايع -> اذهب للتخمين (false تعني عناوين "لقد كشفوك")
      startGuessingPhase(name, false);
    } else {
      // أنا لست الضايع -> شاشة انتظار
      showPanicWaitScreen(name, false);
    }
  } else {
    startGuessingPhase(name, false);
  }
}

// شاشة انتظار لبقية اللاعبين أثناء تخمين الضايع
function showPanicWaitScreen(name, isPanic = true) {
  showScreen('guess');

  // 1. تنظيف المؤثرات السابقة (إيقاف المؤقت وإزالة النبض)
  if (state.guessInterval) {
    clearInterval(state.guessInterval);
    state.guessInterval = null;
  }

  const screenGuess = document.getElementById('screen-guess');
  if (screenGuess) {
    screenGuess.classList.remove('panic-pulse-active');
    screenGuess.style.animationDuration = '0s';
  }

  document.getElementById('guess-options').innerHTML = ''; // إخفاء الأزرار

  const titleEl = document.getElementById('guess-title');

  // استخدام المتغير لتحديد العنوان واللون
  if (isPanic) {
    // حالة "كشفت السالفة" (المضيف/الضايع ضغط الزر)
    titleEl.innerText = "⚠️ كشفت السالفة!";
    titleEl.className = "text-3xl font-black mb-6 text-orange-500 animate-pulse";
  } else {
    // حالة "صادوه" (تصويت المحققين)
    titleEl.innerText = "🔥 فرصة أخيرة!";
    titleEl.className = "text-3xl font-black mb-6 text-red-500";
  }

  document.getElementById('guess-subtitle').innerText = `انتظر! ${name} يحاول تخمين السالفة الآن...`;
  document.getElementById('guess-timer-container').classList.add('hidden');
}

// ==========================================
// 🗳️ نظام التصويت المتقدم + شبكة الأكاذيب
// ==========================================

let votesHistory = []; // مصفوفة لتخزين تاريخ التصويت (للرسم)

function startVoting() {
  playVotingSound();
  state.voterIndex = 0;
  state.votesHistory = []; // تصفير السجل

  if (state.votingMode === 'individual') {
    // نمط الفردي: نبدأ سلسلة التصويت السري
    showIndividualVotingStep();
  } else {
    // نمط الجماعي: شاشة واحدة للجميع
    showGroupVotingScreen();
  }
}

// 2. عرض شاشة التصويت الفردي (خطوة بخطوة)
function showIndividualVotingStep() {
  if (state.voterIndex >= state.players.length) {
    calculateIndividualResults();
    return;
  }

  const voter = state.players[state.voterIndex];
  showScreen('voting');

  const title = document.querySelector('#screen-voting h2');
  const subtitle = document.getElementById('voting-instruction');
  const indicator = document.getElementById('voter-indicator');

  title.innerText = "تحقيق سري 🕵️";
  indicator.classList.remove('hidden');
  indicator.innerText = `الدور على: ${voter.avatar} ${voter.name}`;
  subtitle.innerHTML = `يا <span class="text-indigo-400 font-black">${voter.name}</span>، من هو الضايع برأيك؟`;

  const grid = document.getElementById('voting-grid');
  grid.innerHTML = '';

  // 🔓 فك التجميد لكي يتمكن اللاعب الحالي من التصويت
  grid.classList.remove('pointer-events-none', 'opacity-50');

  state.players.forEach(p => {
    if (p.id !== voter.id) {
      grid.innerHTML += `
        <button onclick="castIndividualVote('${voter.id}', '${p.id}')" 
             class="p-4 bg-white/5 border hover:border-indigo-500 rounded-3xl flex flex-col items-center gap-2 active:bg-indigo-500/20 text-theme-main transition-all">
            <span class="text-4xl">${p.avatar}</span>
            <span class="font-bold text-xs">${p.name}</span>
        </button>`;
    }
  });
}

// 3. تسجيل الصوت الفردي (أوفلاين)
function castIndividualVote(voterId, targetId) {
  // 1. تجميد الشاشة فوراً لمنع النقرات المزدوجة السريعة
  const grid = document.getElementById('voting-grid');
  if (grid) {
    if (grid.classList.contains('pointer-events-none')) return;
    grid.classList.add('pointer-events-none', 'opacity-50');
  }

  voterId = parseInt(voterId);
  targetId = parseInt(targetId);

  if (!state.votesHistory) state.votesHistory = [];

  // 2. الحماية الحديدية: إذا كان هذا اللاعب قد صوت مسبقاً، نرفض نقرته فوراً!
  if (state.votesHistory.some(v => v.voter === voterId)) return;

  // 3. إضافة الصوت بأمان
  state.votesHistory.push({ voter: voterId, target: targetId });
  sounds.tick();
  state.voterIndex++;

  // 4. الانتقال للاعب التالي بعد جزء من الثانية
  setTimeout(() => {
    showIndividualVotingStep();
  }, 150);
}

// 4. عرض شاشة التصويت الجماعي (الكل في شاشة واحدة)
function showGroupVotingScreen() {
  showScreen('voting');

  const title = document.querySelector('#screen-voting h2');
  const subtitle = document.getElementById('voting-instruction');
  const indicator = document.getElementById('voter-indicator');

  title.innerText = "قرار المجموعة ⚖️";
  indicator.classList.add('hidden');
  subtitle.innerText = "من هو الضايع؟ اضغطوا على صورته!";

  const grid = document.getElementById('voting-grid');
  grid.innerHTML = '';

  // 🔓 فك التجميد لكي يتمكن اللاعبون من التصويت في الجولة الجديدة
  grid.classList.remove('pointer-events-none', 'opacity-50');

  state.players.forEach(p => {
    grid.innerHTML += `
      <button onclick="handleVoteClick(${p.id})" 
           class="p-4 bg-white/5 border hover:border-red-500 rounded-3xl flex flex-col items-center gap-2 active:bg-red-500/20 text-theme-main transition-all">
          <span class="text-4xl">${p.avatar}</span>
          <span class="font-bold text-xs">${p.name}</span>
      </button>`;
  });
}

// 5. حساب نتائج التصويت الفردي
function calculateIndividualResults() {
  // حساب تكرار الأصوات
  const voteCounts = {};

  state.votesHistory.forEach(v => {
    voteCounts[v.target] = (voteCounts[v.target] || 0) + 1;
  });

  let maxVotes = -1;
  let tiedVictims = []; // مصفوفة لحفظ المتعادلين
  for (const [pid, count] of Object.entries(voteCounts)) {
    if (count > maxVotes) {
      maxVotes = count;
      tiedVictims = [parseInt(pid)]; // قائمة جديدة
    } else if (count === maxVotes) {
      tiedVictims.push(parseInt(pid)); // إضافة المتعادل
    }
  }
  // ✨ قانون الأغلبية الصارمة: إذا تعادل أكثر من شخص، لا يوجد ضحية فعلية!
  let victimId = tiedVictims.length === 1 ? tiedVictims[0] : null;

  // إرسال الضحية للمعالجة
  processVoteResult(victimId);
}

// 6. معالجة النتيجة النهائية (مشترك) + التحكم بظهور الشبكة
function processVoteResult(id) {
  const webContainer = document.getElementById('web-container');
  if (webContainer) {
    webContainer.classList.remove('hidden'); // إظهار الحاوية دائماً
    setTimeout(drawWebOfLies, 200); // رسم الشبكة
  }
  // ------------------------------------------

  // المنطق الأصلي الخاص بك (كما هو في ملفك)
  if (state.blindRoundType) {
    const p = state.players.find(x => x.id === id);
    sounds.funny();
    showFinalResults('blind_win', `مقلب! 🤣 ${p ? p.name : ''} بريء! ما كان فيه ضايع!`);
    return;
  }

  if (isOnline && isHost) {
    broadcast({
      type: 'GAME_PHASE',
      phase: 'result',
      winner: state.lastWinner, // out, group, etc.
      winType: '...', // النص الذي يظهر
      title: '...', // العنوان
      secretData: state.secretData,
      roles: state.currentRoles,
      players: state.players // النقاط المحدثة
    });
  }

  const isOut = state.outPlayerIds.includes(id);

  if (isOut) {
    if (state.guessingEnabled) {
      const p = state.players.find(x => x.id === id);
      startGuessingPhase(p ? p.name : null);
    } else showFinalResults('group_win', "كفو! صدتوا الضايع 😶‍🌫️");
  } else if (id === state.undercoverPlayerId) {
    showFinalResults('out_win', "المموه خدعكم! 🤫 فاز الضايع");
  } else if (id === state.agentPlayerId) {
    showFinalResults('out_win', "العميل ضحى بنفسه! 🎭 فاز الضايع");
  } else {
    sounds.wrong();
    document.body.classList.add('wrong-flash-active');
    setTimeout(() => { document.body.classList.remove('wrong-flash-active'); showFinalResults('out_win', "خطأ! الضايع فاز 😈"); }, 600);
  }
}

// 7. دالة عرض النتائج بنظام البطاقات (بديل الكانفاس)
function drawWebOfLies() {
  const container = document.getElementById('voting-results-grid');
  if (!container) return;
  container.innerHTML = '';

  // ✅✅✅ 1. إضافة شرط خاص لـ "كشفت السالفة" ✅✅✅
  if (state.panicMode && (!state.votesHistory || state.votesHistory.length === 0)) {
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center w-full p-4 bg-orange-500/10 rounded-2xl border border-orange-500/30">
            <div class="text-4xl mb-2 animate-bounce">🚨</div>
            <p class="text-orange-300 text-sm font-bold">تم إلغاء التصويت!</p>
            <p class="text-xs text-theme-muted opacity-80 mt-1">بسبب تفعيل "كشفت السالفة"</p>
        </div>
      `;
    return;
  }

  // التحقق من وجود بيانات تصويت
  if (!state.votesHistory || state.votesHistory.length === 0) {
    // محاولة استخدام البيانات المجمعة للأوفلاين إذا لم يوجد سجل تاريخي
    if (!isOnline && state.votesAccumulated) {
      container.innerHTML = '<p class="text-theme-muted text-sm">التصويت كان سرياً (بدون سجل تفصيلي) 🕵️‍♂️</p>';
      return;
    }
    container.innerHTML = '<p class="text-theme-muted text-sm">لم يصوت أحد! 🕊️</p>';
    return;
  }

  // 1. تجميع الأصوات
  const results = {};
  state.votesHistory.forEach(v => {
    // حماية: التأكد من أن voter و target أرقام صحيحة
    const targetId = parseInt(v.target);
    const voterId = parseInt(v.voter);

    if (!results[targetId]) {
      results[targetId] = { targetId: targetId, voters: [] };
    }
    results[targetId].voters.push(voterId);
  });

  // ترتيب النتائج (الأكثر أصواتاً أولاً)
  const sortedResults = Object.values(results).sort((a, b) => b.voters.length - a.voters.length);

  // 2. بناء البطاقات
  sortedResults.forEach(group => {
    const targetPlayer = state.players.find(p => p.id === group.targetId);
    if (!targetPlayer) return; // تخطي إذا لم يوجد اللاعب

    const targetRoleData = state.currentRoles.find(r => r.id === group.targetId);

    // تحديد ألوان ودور المتهم
    let roleLabel = "المحقق";
    let roleColorClass = "bg-indigo-500/20 text-indigo-300 border-indigo-500/30";
    let borderColor = "border-indigo-500/30";

    if (targetRoleData) {
      if (targetRoleData.role === 'out') {
        roleLabel = "الضايع";
        roleColorClass = "bg-red-500/20 text-red-300 border-red-500/30";
        borderColor = "border-red-500/50";
      } else if (targetRoleData.role === 'agent') {
        roleLabel = "العميل";
        roleColorClass = "bg-orange-500/20 text-orange-300 border-orange-500/30";
        borderColor = "border-orange-500/50";
      } else if (targetRoleData.role === 'undercover') {
        roleLabel = "المموه";
        roleColorClass = "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
        borderColor = "border-yellow-500/50";
      }
    }

    // HTML المصوتين
    let votersHTML = '';
    group.voters.forEach(voterId => {
      const voter = state.players.find(p => p.id === voterId);
      if (voter) {
        let borderClass = 'border-wrong'; // أحمر (خطأ)
        if (targetRoleData) {
          if (targetRoleData.role === 'out') borderClass = 'border-correct'; // أخضر (صحيح)
          else if (targetRoleData.role === 'agent') borderClass = 'border-wrong';
          else if (targetRoleData.role === 'undercover') borderClass = 'border-wrong';
        }
        votersHTML += `<div class="voter-bubble ${borderClass}" title="${voter.name}">${voter.avatar}</div>`;
      }
    });

    const cardHTML = `
            <div class="vote-card ${borderColor}">
                <div class="vote-card-header">
                    <div class="text-4xl mb-1">${targetPlayer.avatar}</div>
                    <div class="font-bold text-sm truncate max-w-[140px]">${targetPlayer.name}</div>
                    <span class="role-badge border ${roleColorClass}">${roleLabel}</span>
                </div>
                <div class="w-full border-t border-white/10 my-2"></div>
                <div class="text-[10px] text-theme-muted mb-1">المصوتون (${group.voters.length}):</div>
                <div class="voters-container">${votersHTML}</div>
            </div>`;

    container.innerHTML += cardHTML;
  });
}

// دالة رسم السهم المساعدة
function drawArrow(ctx, fromX, fromY, toX, toY, color, width) {
  const headlen = 15;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const offset = 40; // مسافة التوقف قبل الدائرة

  const startX = fromX + offset * Math.cos(angle);
  const startY = fromY + offset * Math.sin(angle);
  const endX = toX - offset * Math.cos(angle);
  const endY = toY - offset * Math.sin(angle);

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
  ctx.fillStyle = color;
  ctx.fill();
}

function updateVotingGrid() {
  const grid = document.getElementById('voting-grid');
  grid.innerHTML = '';

  // 🔓 فك التجميد هنا كإجراء احترازي لكي يستطيع اللاعب التالي التصويت
  grid.classList.remove('pointer-events-none', 'opacity-50');

  if (state.votingMode === 'individual') {
    const voter = state.players[state.voterIndex];
    document.getElementById('voter-indicator').innerText = `دور: ${voter.avatar} ${voter.name}`;
    document.getElementById('voter-indicator').classList.remove('hidden');
  } else {
    document.getElementById('voter-indicator').classList.add('hidden');
  }

  state.players.forEach(p => {
    if (state.votingMode === 'individual' && state.players[state.voterIndex].id === p.id) return;
    grid.innerHTML += `<button onclick="handleVoteClick(${p.id})" class="p-4 bg-white/5 border rounded-3xl flex flex-col items-center gap-2 active:bg-indigo-500/20 text-theme-main transition-all hover:border-indigo-500 hover:scale-[1.02]"><span class="text-4xl">${p.avatar}</span><span class="font-bold text-xs">${p.name}</span></button>`;
  });
}

// تسجيل الصوت (للجماعي والأونلاين)
function handleVoteClick(id) {
  const grid = document.getElementById('voting-grid');

  // 1. تجميد الشاشة فوراً
  if (grid) {
    if (grid.classList.contains('pointer-events-none')) return;
    grid.classList.add('pointer-events-none', 'opacity-50');
  }

  // الحالة 1: أنا لاعب (Client) في الأونلاين
  if (isOnline && !isHost) {
    myConn.send({ type: 'VOTE', voterId: myPlayerId, targetId: id });
    document.getElementById('voting-instruction').innerText = "تم إرسال صوتك.. بانتظار النتائج ⏳";
    return;
  }

  // الحالة 2: أنا المضيف (Host) في الأونلاين
  if (isOnline && isHost) {
    // 🛡️ حماية للمضيف: هل صوت المضيف مسبقاً؟
    if (state.votesHistory && state.votesHistory.some(v => v.voter === myPlayerId)) return;

    votesReceived++;
    if (!state.votesHistory) state.votesHistory = [];
    state.votesHistory.push({ voter: myPlayerId, target: id });

    document.getElementById('voting-instruction').innerText = "تم تسجيل صوتك.. بانتظار باقي اللاعبين ⏳";

    if (votesReceived >= onlinePlayers.length) {
      calculateOnlineResults();
    }
    return;
  }

  // الحالة 3: اللعب أوفلاين (جهاز واحد - نمط جماعي)
  if (state.votingMode === 'group') {
    state.votesHistory = [];
    state.players.forEach(p => {
      if (p.id !== id) {
        state.votesHistory.push({ voter: p.id, target: id });
      }
    });
    processVoteResult(id);
  }
}

function startGuessingPhase(caughtName, isPanic = false) {
  const container = document.getElementById('guess-options');
  if (!container) return;
  container.innerHTML = '';

  // تحديث العنوان باسم الضايع
  const titleElement = document.getElementById('guess-title');
  const subtitleElement = document.getElementById('guess-subtitle');

  if (titleElement) {
    if (isPanic) {
      // Panic Mode
      titleElement.innerText = `لديك بعض الشجاعة يا ${caughtName}! 😎`;
      titleElement.className = "text-2xl sm:text-3xl font-black mb-6 text-orange-500";
      subtitleElement.innerText = "خمن السالفة من الخيارات التالية..";
    } else {
      // Caught Mode
      document.getElementById('screen-guess').classList.remove('panic-pulse-active');
      titleElement.innerText = caughtName ? `لقد كشفوك يا ${caughtName}! 🎯` : 'لقد كشفوك يا ضايع! 🎯';
      titleElement.className = "text-xl sm:text-2xl font-black mb-4 text-red-400 leading-normal";
      if (subtitleElement) {
        subtitleElement.innerText = caughtName ? `لديك فرصة أخيرة لتسرق الفوز يا ${caughtName}!\nخمن السالفة من الخيارات التالية..` : '..خمن السالفة من الخيارات التالية!';
      }
    }
  }

  // Handle Timer for Panic Mode
  const timerContainer = document.getElementById('guess-timer-container');
  const timerEl = document.getElementById('guess-timer');

  if (state.guessInterval) clearInterval(state.guessInterval);

  if (isPanic) {
    timerContainer.classList.remove('hidden');
    let timeLeft = 10;
    timerEl.innerText = timeLeft;

    state.guessInterval = setInterval(() => {
      timeLeft--;
      timerEl.innerText = timeLeft;
      const screenGuess = document.getElementById('screen-guess');

      if (timeLeft <= 10 && timeLeft > 0) {
        // 1. تشغيل صوت القلب
        playHeartbeatSound();

        // 2. تفعيل تأثير النبض البصري
        screenGuess.classList.add('panic-pulse-active');

        // 3. تسريع النبض كلما قل الوقت (تعديل مدة الأنيميشن)
        // كلما قل الوقت، قلت مدة الأنيميشن (أسرع)
        const speed = Math.max(0.4, timeLeft / 10);
        screenGuess.style.animationDuration = `${speed}s`;

        // اهتزاز خفيف للجهاز مع كل دقة
        if (timeLeft % 2 === 0) triggerVibrate(50);

      } else {
        // إزالة التأثير إذا كان الوقت أكثر من 10 (أو انتهى)
        screenGuess.classList.remove('panic-pulse-active');
        screenGuess.style.animationDuration = '0s'; // إعادة تعيين

        // تشغيل صوت التكتكة العادية إذا لم نكن في وضع التوتر
        if (timeLeft > 10 && timeLeft <= 5) sounds.tick(); // (اختياري: يمكنك حذف هذا السطر لمنع تداخل الأصوات)
      }

      // --- التعديل هنا: عند انتهاء الوقت ---
      if (timeLeft <= 0) {
        clearInterval(state.guessInterval);

        if (isOnline) {
          if (isHost) {
            // إذا كنت أنا المضيف (والضايع)، أنهي اللعبة للجميع فوراً
            handlePanicTimeout();
          } else {
            // إذا كنت لاعباً عادياً، أبلغ المضيف بانتهاء وقتي
            myConn.send({ type: 'PANIC_TIMEOUT' });
            // عرض رسالة انتظار مؤقتة حتى تأتي النتائج من المضيف
            document.getElementById('guess-options').innerHTML = '<div class="text-red-500 font-bold animate-pulse mt-10 text-2xl">انتهى الوقت! ⌛</div>';
          }
        } else {
          // أوفلاين: عرض النتائج مباشرة
          showFinalResults('group_win', "انتهى الوقت! (عقاب مضاعف) ⏳");
        }
      }
      // -----------------------------------
    }, 1000);
  } else {
    timerContainer.classList.add('hidden');
  }

  // تحديد مصفوفة الكلمات الحالية
  let pool = wordBank[state.currentRoundCategory] || wordBank["طعام"];

  // ============================================================
  // التعديل الذكي: جلب الخيارات من الكلمات التي تشارك نفس الـ related
  // ============================================================
  let distinctDistractors = [];

  if (typeof state.secretData.related === 'string' && state.secretData.related.trim() !== '') {
    let relatedGroup = pool.filter(w => w.related === state.secretData.related && w.word !== state.secretData.word);
    relatedGroup = relatedGroup.sort(() => 0.5 - Math.random());

    // ✨ التعديل الأول: سحب 4 خيارات خاطئة بدلاً من 3 ✨
    let selectedObjects = relatedGroup.slice(0, 4);

    distinctDistractors = selectedObjects.map(obj => ({ word: obj.word }));
  }

  // ✨ التعديل الثاني: إكمال العدد إلى 4 إذا كانت المجموعة أقل ✨
  if (distinctDistractors.length < 4) {
    let remainder = pool.filter(w => w.word !== state.secretData.word && !distinctDistractors.find(d => d.word === w.word));
    remainder = remainder.sort(() => 0.5 - Math.random());
    while (distinctDistractors.length < 4 && remainder.length > 0) {
      let popped = remainder.pop();
      distinctDistractors.push({ word: popped.word });
    }
  }

  // دمج الخيارات (4 خطأ + 1 صحيح = المجموع 5)
  let options = [...distinctDistractors, { word: state.secretData.word }];
  options = options.sort(() => 0.5 - Math.random());

  options.forEach(opt => {
    // ✨ التعديل الثالث: تغيير py-5 إلى py-4 لتتسع الخمسة أزرار في الشاشة براحة ✨
    container.innerHTML += `<button onclick="checkGuess('${opt.word}')" class="w-full py-4 options-bg rounded-3xl text-xl sm:text-2xl font-black active:bg-indigo-500/20 transition-all shadow-xl border-2 border-white/5 text-white break-word-custom text-center hover:scale-[1.02]">${opt.word}</button>`;
  });

  showScreen('guess');
}

function checkGuess(word) {
  // إيقاف العداد فوراً عند الضغط على أي خيار
  if (state.guessInterval) {
    clearInterval(state.guessInterval);
    state.guessInterval = null; // ضمان عدم عمله مجدداً
  }

  // إذا كنت لاعباً أونلاين ولست المضيف
  if (isOnline && !isHost) {
    // أرسل التخمين للمضيف
    myConn.send({ type: 'GUESS_ATTEMPT', word: word });

    // إظهار رسالة انتظار
    const container = document.getElementById('guess-options');
    container.innerHTML = '<div class="text-2xl font-bold text-white animate-pulse mt-10">جاري التحقق من الإجابة... ⏳</div>';
    return;
  }

  // إذا كنت المضيف أو أوفلاين -> افحص مباشرة
  processGuessVerification(word);
}

// دالة الفحص الفعلية (مفصولة لاستخدامها من قبل المضيف)
function processGuessVerification(word) {
  if (state.guessInterval) clearInterval(state.guessInterval);

  let winType = '';
  let title = '';
  let winner = '';

  // 1. تحديد الفائز
  if (word === state.secretData.word) {
    // تخمين صحيح
    winner = 'out';
    winType = 'out_win';
    if (state.panicMode) {
      title = "تخمين أسطوري! (نقاط مضاعفة) 🔥";
    } else {
      title = "تخمين صح! الضايع فاز 🧠";
    }
  } else {
    // تخمين خاطئ
    winner = 'group';
    winType = 'group_win';
    title = "تخمين خطأ! المحققون فازوا ⚖️";
  }

  state.lastWinner = winner;
  if (isOnline && isHost) {
    awardPoints(winner);
  }

  // 3. ✅✅✅ الجزء الناقص: بث النتيجة لجميع اللاعبين ✅✅✅
  if (isOnline && isHost) {
    broadcast({
      type: 'GAME_PHASE',
      phase: 'result',
      winner: winner,
      winType: winType,
      title: title,
      secretData: state.secretData,
      roles: state.currentRoles,
      players: state.players, // نرسل اللاعبين مع نقاطهم الجديدة
      votesHistory: state.votesHistory || [] // نرسل سجل التصويت (حتى لو كان فارغاً)
    });
  }

  // 4. إظهار النتائج للمضيف
  showFinalResults(winType, title);
}

function handlePanicTimeout() {
  const winType = 'group_win';
  const title = "انتهى الوقت! (عقاب مضاعف) ⏳";
  const winner = 'group';

  // تحديث النقاط محلياً
  state.lastWinner = winner;

  if (isOnline && isHost) {
    awardPoints(winner);
  }

  // بث النتائج للجميع
  broadcast({
    type: 'GAME_PHASE',
    phase: 'result',
    winner: winner,
    winType: winType,
    title: title,
    secretData: state.secretData,
    roles: state.currentRoles,
    players: state.players,
    votesHistory: state.votesHistory
  });

  // إظهار النتائج للمضيف
  showFinalResults(winType, title);
}

function showFinalResults(type, title) {
  state.lastWinner = type === 'group_win' ? 'group' : (type === 'blind_win' ? 'blind' : 'out');

  const titleEl = document.getElementById('final-result-title');
  const emojiEl = document.getElementById('final-status-emoji');

  if (isOnline && state.myRole) {
    const myRole = state.myRole.role;
    const amISpySide = ['out', 'agent', 'undercover'].includes(myRole);
    let didIWin = false;

    if (state.lastWinner === 'group' && !amISpySide) didIWin = true;
    if (state.lastWinner === 'out' && amISpySide) didIWin = true;
    if (state.lastWinner === 'blind') didIWin = true;

    if (didIWin) {
      titleEl.innerText = "🎉 لقد فزت!";
      titleEl.className = "text-4xl sm:text-6xl font-black mb-6 text-emerald-400 animate-bounce";
      emojiEl.innerText = "😎";
      sounds.win();
      createConfetti();
    } else {
      titleEl.innerText = "😢 لقد خسرت!";
      titleEl.className = "text-4xl sm:text-6xl font-black mb-6 text-red-500";
      emojiEl.innerText = "💔";
      sounds.lose();
    }

    if (!document.getElementById('final-subtitle')) {
      const sub = document.createElement('p');
      sub.id = 'final-subtitle';
      sub.className = "text-theme-muted text-lg font-bold mb-4";
      titleEl.after(sub);
    }
    document.getElementById('final-subtitle').innerText = `(النتيجة العامة: ${title})`;

  } else {
    titleEl.innerText = title;
    titleEl.className = "text-3xl sm:text-5xl font-black mb-6 text-theme-main";
    emojiEl.innerText = type === 'blind_win' ? '🤡' : (type === 'group_win' ? '🏆' : '😈');

    if (type === 'group_win') { sounds.win(); createConfetti(); }
    else if (type === 'blind_win') { createConfetti(true); }
    else sounds.lose();
  }

  // ✨ تعبئة بيانات السالفة (الكلمة فقط بدون إيموجي أو وصف) ✨
  document.getElementById('final-secret-word').innerText = state.secretData.word;

  if (!isOnline) {
    awardPoints(state.lastWinner);
  }

  showScreen('final');
  generateRoast(type);

  const webContainer = document.getElementById('web-container');
  if (webContainer) {
    webContainer.classList.remove('hidden');
    drawWebOfLies();
  }

  let playedCount = parseInt(localStorage.getItem('games_played_count') || '0');
  playedCount++;
  localStorage.setItem('games_played_count', playedCount.toString());

  let hasRated = localStorage.getItem('has_rated_app') === 'true';
  if (!hasRated && (playedCount === 3 || playedCount === 10 || playedCount === 25)) {
    setTimeout(() => {
      showRatingModal();
    }, 2500);
  }
}

function awardPoints(winner) {
  // 1. تحديد مصدر البيانات (أونلاين أو أوفلاين)
  let playersList = isOnline ? state.players : JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  const roleToStatKey = { 'in': 'det', 'out': 'out', 'agent': 'agt', 'undercover': 'und' };

  // 2. 🔍 حساب الضحية الحقيقية (الأكثر تصويتاً) لضمان دقة التوزيع
  let victimId = null;

  if (state.votesHistory && state.votesHistory.length > 0) {
    const voteCounts = {};
    state.votesHistory.forEach(v => { voteCounts[v.target] = (voteCounts[v.target] || 0) + 1; });
    let maxVotes = -1;
    let tiedVictims = []; // مصفوفة لحفظ المتعادلين
    for (const [pid, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        tiedVictims = [parseInt(pid)]; // قائمة جديدة
      } else if (count === maxVotes) {
        tiedVictims.push(parseInt(pid)); // إضافة المتعادل
      }
    }
    // ✨ قانون الأغلبية الصارمة: إذا تعادل أكثر من شخص، لا يوجد ضحية فعلية!
    victimId = tiedVictims.length === 1 ? tiedVictims[0] : null;
  }
  // جلب دور الضحية
  const victimRole = victimId !== null ? state.currentRoles.find(r => r.id === victimId)?.role : null;

  // 3. توزيع النقاط
  playersList = playersList.map((p) => {
    if (typeof p.points !== 'number') p.points = 0;
    const roleData = state.currentRoles.find(r => r.id === p.id);
    if (!roleData) return p;

    if (!p.stats) p.stats = { det: { w: 0, l: 0 }, out: { w: 0, l: 0 }, agt: { w: 0, l: 0 }, und: { w: 0, l: 0 } };
    const statKey = roleToStatKey[roleData.role];
    const isOutSide = (roleData.role === 'out' || roleData.role === 'agent' || roleData.role === 'undercover');

    if (winner === 'blind') {
      p.points += 1;
      if (statKey) p.stats[statKey].w++;
    }
    else if (winner === 'group') {
      if (!isOutSide) {
        p.points += (state.panicMode ? 2 : 1);
        p.stats.det.w++;
      } else {
        if (statKey) p.stats[statKey].l++;
      }
    }
    else if (winner === 'out' || winner === 'out_win') {
      if (isOutSide) {
        let pointsToAdd = 0;

        if (roleData.role === 'out') {
          if (state.panicMode) pointsToAdd = 4;
          else if (victimRole === 'out' || victimRole === 'in' || !victimRole) pointsToAdd = 2;
          else pointsToAdd = 1;
        }
        else if (roleData.role === 'agent') {
          pointsToAdd = (victimRole === 'agent') ? 2 : 1;
        }
        else if (roleData.role === 'undercover') {
          pointsToAdd = (victimRole === 'undercover') ? 2 : 1;
        }

        p.points += pointsToAdd;
        if (statKey) p.stats[statKey].w++;
      }
      else {
        p.stats.det.l++;
      }
    }
    return p;
  });

  // 4. حفظ النتائج في المكان الصحيح
  if (isOnline) {
    state.players = playersList;
  } else {
    localStorage.setItem('out_loop_tablet_v4_players', JSON.stringify(playersList));
    state.players = playersList;
  }
}

function updateFinalResultsUI() {
  const list = document.getElementById('final-leaderboard');
  if (!list) return;
  list.innerHTML = '';

  // 1. رسم جدول النتائج (الكود القديم)
  state.players.forEach(p => {
    const roleData = state.currentRoles.find(r => r.id === p.id);
    if (!roleData) return;
    let didWin = false;
    const isOutSide = ['out', 'agent', 'undercover'].includes(roleData.role);
    if (state.lastWinner === 'group' && !isOutSide) didWin = true;
    if ((state.lastWinner === 'out') && isOutSide) didWin = true;
    if (state.lastWinner === 'blind') didWin = true;

    const colorClass = didWin ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500' : 'bg-red-500/20 border-red-500/40 text-red-500';
    list.innerHTML += `<div class="flex items-center justify-between p-3 rounded-2xl border ${colorClass} mb-2 shadow-inner text-right"><div class="flex items-center gap-3"><span class="text-2xl">${p.avatar}</span><div class="text-right"><p class="font-black text-theme-main text-sm text-right">${p.name}</p><p class="text-[9px] uppercase opacity-60 text-theme-main text-right">${roleNamesMap[roleData.role] || roleData.role}</p></div></div><span class="font-mono text-xs font-black text-theme-main">${p.points}</span></div>`;
  });

  // 2. منطق إخفاء الأزرار عن الأعضاء (الكود الجديد)
  const buttonsToControl = [
    'btn-final-wheel',
    'btn-final-restart',
    'btn-final-category',
    'btn-final-home'
  ];

  buttonsToControl.forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (btn) {
      if (isOnline && !isHost) {
        // إذا كنت أونلاين ولست المضيف -> إخفاء
        btn.classList.add('hidden');
      } else {
        // إذا كنت المضيف أو أوفلاين -> إظهار
        btn.classList.remove('hidden');
      }
    }
  });

  // إضافة رسالة انتظار للأعضاء ليعرفوا أن المضيف يتحكم
  if (isOnline && !isHost) {
    // نتأكد من عدم تكرار الرسالة
    if (!document.getElementById('client-wait-msg')) {
      const msg = document.createElement('div');
      msg.id = 'client-wait-msg';
      msg.className = 'text-center mt-6 animate-pulse text-indigo-400 font-bold';
      msg.innerHTML = '<p>بانتظار المضيف لبدء جولة جديدة... ⏳</p>';
      list.parentElement.appendChild(msg);
    }
  } else {
    // إزالة الرسالة للمضيف أو الأوفلاين
    const msg = document.getElementById('client-wait-msg');
    if (msg) msg.remove();
  }
}

function updateLeaderboardUI() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '';

  let dataToShow = [];
  const titleEl = document.querySelector('#screen-leaderboard h2');

  // ✅ 1. تحديد مصدر البيانات
  if (isOnline) {
    // أونلاين: نأخذ البيانات من الذاكرة الحالية (onlinePlayers)
    // ننسخ المصفوفة لكي لا نؤثر على الترتيب الأصلي في اللعبة
    dataToShow = [...onlinePlayers];
    if (titleEl) titleEl.innerText = "🏆 صدارة الجلسة الحالية";

    // إخفاء زر التصفير في الأونلاين (لأنه يحدث تلقائياً عند الخروج)
    const resetBtn = document.getElementById('btn-reset-points-trigger');
    if (resetBtn) resetBtn.classList.add('hidden');

  } else {
    // أوفلاين: نأخذ البيانات من التخزين الدائم
    dataToShow = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
    if (titleEl) titleEl.innerText = "🏆 أبطال السوالف";

    // إظهار زر التصفير
    checkResetButtonVisibility();
  }

  // ✅ 2. الترتيب (الأكثر نقاطاً أولاً)
  const sorted = dataToShow.sort((a, b) => (b.points || 0) - (a.points || 0));

  if (sorted.length === 0) {
    list.innerHTML = '<p class="text-center text-theme-muted mt-10 font-bold">لا يوجد بيانات لعرضها 🕸️</p>';
    return;
  }

  // ✅ 3. الرسم
  sorted.forEach((p, idx) => {
    // نحدد اللقب بناءً على النقاط
    const title = funnyTitles[Math.min(Math.floor((p.points || 0) / 3), 4)] || "مبتدئ";

    // تمييز اللاعب نفسه في الأونلاين
    let borderClass = "border-white/10";
    if (isOnline && p.id === myPlayerId) borderClass = "border-emerald-500/50 bg-emerald-500/10";

    list.innerHTML += `
    <div onclick="openStatsModal(${p.id})" 
         class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border ${borderClass} hover:bg-white/10 cursor-pointer text-right transition-transform">
        <div class="flex items-center gap-4 text-right">
            <span class="text-3xl">${p.avatar}</span>
            <div class="text-right">
                <p class="font-black text-theme-main text-right">
                    ${p.name} ${isOnline && p.isHost ? '👑' : ''}
                </p>
                <p class="text-[10px] text-indigo-400 font-bold text-right">${title}</p>
            </div>
        </div>
        <span class="bg-indigo-500/20 px-3 py-1 rounded-full font-mono text-sm font-black text-indigo-300">
            ${p.points || 0}
        </span>
    </div>`;
  });
}

function openStatsModal(id) {
  let p = null;

  // ✅ تحديد المصدر بناءً على النمط
  if (isOnline) {
    // البحث في مصفوفة الأونلاين
    p = onlinePlayers.find(player => player.id === id);
  } else {
    // البحث في التخزين المحلي
    const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
    p = saved.find(player => player.id === id); // نستخدم find بدلاً من index المباشر للأمان
  }

  if (!p) return;

  document.getElementById('player-stat-avatar').innerText = p.avatar;
  document.getElementById('player-stat-name').innerText = p.name;
  document.getElementById('stat-total-points').innerText = p.points || 0;

  const s = p.stats || { det: { w: 0, l: 0 }, out: { w: 0, l: 0 }, agt: { w: 0, l: 0 }, und: { w: 0, l: 0 } };
  const wins = (s.det.w || 0) + (s.out.w || 0) + (s.agt.w || 0) + (s.und.w || 0);
  const loss = (s.det.l || 0) + (s.out.l || 0) + (s.agt.l || 0) + (s.und.l || 0);

  document.getElementById('stat-total-games').innerText = wins + loss;
  document.getElementById('stat-total-wins').innerText = wins;
  document.getElementById('stat-total-losses').innerText = loss;

  document.getElementById('stat-det-w').innerText = s.det.w || 0; document.getElementById('stat-det-l').innerText = s.det.l || 0;
  document.getElementById('stat-out-w').innerText = s.out.w || 0; document.getElementById('stat-out-l').innerText = s.out.l || 0;
  document.getElementById('stat-agt-w').innerText = s.agt.w || 0; document.getElementById('stat-agt-l').innerText = s.agt.l || 0;
  document.getElementById('stat-und-w').innerText = s.und.w || 0; document.getElementById('stat-und-l').innerText = s.und.l || 0;

  document.getElementById('modal-stats').classList.remove('hidden');
  document.getElementById('modal-stats').classList.add('flex');
}

function restartSameGame() {
  // 1. التعامل مع وضع الأونلاين
  if (isOnline) {
    if (isHost) {
      // إذا كنت المضيف، ابدأ جولة أونلاين جديدة (توزيع أدوار وبث للجميع)
      startOnlineGame();
    } else {
      // إذا كنت لاعباً عادياً، انتظر المضيف
      showAlert("انتظر المضيف ليبدأ جولة جديدة! ⏳");
    }
    return;
  }

  // 2. التعامل مع وضع الأوفلاين (كما كان سابقاً)
  try {
    state.timer = state.initialTimer;
    setupRoles();
    state.revealIndex = 0;
    // إعادة ترتيب عشوائي جديد للكشف
    state.revealOrder = state.players.map((_, i) => i).sort(() => Math.random() - 0.5);
    state.panicMode = false;

    startRevealSequence();
  } catch (err) {
    console.error("Error restarting game:", err);
    // في حال حدوث خطأ، نعود لشاشة البداية لتجنب التعليق
    showScreen('start');
  }
}

function resetPoints() {
  const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  const reset = saved.map(p => ({ ...p, points: 0, stats: { det: { w: 0, l: 0 }, out: { w: 0, l: 0 }, agt: { w: 0, l: 0 }, und: { w: 0, l: 0 } } }));
  localStorage.setItem('out_loop_tablet_v4_players', JSON.stringify(reset));
  state.players = reset;
  closeModal(); updateLeaderboardUI(); checkResetButtonVisibility();
}

function createConfetti(isClown = false) {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = ''; // تنظيف فوري قبل البدء

  const colors = ['#6366f1', '#10b981', '#ef4444', '#fbbf24', '#f472b6'];
  const clowns = ['🤡', '🤣', '🤪', '😜', '🙈'];
  const count = 100;

  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.style.left = Math.random() * 100 + 'vw';
    if (isClown) {
      c.className = 'emoji-drop text-4xl';
      c.innerText = clowns[Math.floor(Math.random() * clowns.length)];
      c.style.animationDuration = (2 + Math.random() * 3) + 's';
    } else {
      c.className = 'confetti-piece';
      c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      c.style.top = '-20px';
      c.animate([{ transform: 'translateY(0) rotate(0deg)', opacity: 1 }, { transform: `translateY(100vh) rotate(720deg)`, opacity: 0 }], { duration: 2000 + Math.random() * 2000 });
    }
    container.appendChild(c);
  }

  // حفظ المؤقت في متغير لإلغائه إذا تم الضغط مرة أخرى
  if (window.confettiTimeout) clearTimeout(window.confettiTimeout);
  window.confettiTimeout = setTimeout(() => { container.innerHTML = ''; }, 5000);
}

// ==========================================
// كود تغيير ايموجي الشاشة الرئيسية
// ==========================================
function startHeroEmojiAnimation() {
  const heroEmojiEl = document.getElementById('hero-emoji');
  if (!heroEmojiEl) return;

  // قائمة الايموجي التي تريد التبديل بينها
  const emojis = ["🕵️‍♂️", "😶‍🌫️", "🤫", "🎭", "🤥", "🧐", "🤡", "🤔", "😵‍💫"];
  let index = 0;

  setInterval(() => {
    // 1. تأثير اختفاء بسيط (اختياري لتحسين الشكل)
    heroEmojiEl.style.opacity = '0';
    heroEmojiEl.style.transform = 'scale(0.5)';

    setTimeout(() => {
      // 2. تغيير الايموجي
      index = (index + 1) % emojis.length;
      heroEmojiEl.innerText = emojis[index];

      // 3. إعادة الظهور
      heroEmojiEl.style.opacity = '1';
      heroEmojiEl.style.transform = 'scale(1)';
    }, 200); // ينتظر جزء من الثانية وهو مختفي ثم يغيره

  }, 1700); // كل 3000 ميلي ثانية = 3 ثواني
}

// ==========================================
// منطق عجلة العقاب (Punishment Wheel)
// ==========================================

// القائمة الافتراضية للعقوبات
const defaultPunishments = [
  "نكتة بايخة 🤡",
  "تكلم فصحى 📜",
  "صوت قطوة 🐈",
  "عطنا حكمة 🦉",
  "ابتسم لمدة دقيقة 😁",
  "إمدح الفائز 👑"
];

let punishments = JSON.parse(localStorage.getItem('out_loop_punishments')) || [...defaultPunishments];
let wheelCanvas = null;
let wheelCtx = null;
let currentWheelRotation = 0;

// فتح وإغلاق المودال
function openPunishmentModal() {
  document.getElementById('modal-punishments').classList.remove('hidden');
  document.getElementById('modal-punishments').classList.add('flex');
  renderPunishmentList();
}

function closePunishmentModal() {
  document.getElementById('modal-punishments').classList.add('hidden');
  document.getElementById('modal-punishments').classList.remove('flex');
  // إعادة رسم العجلة بالتحديثات الجديدة
  if (!document.getElementById('screen-punishment').classList.contains('hidden')) {
    drawWheel();
  }
}

// عرض القائمة
function renderPunishmentList() {
  const list = document.getElementById('punishments-list');
  list.innerHTML = '';

  if (punishments.length === 0) {
    list.innerHTML = '<p class="text-theme-muted text-sm">لا توجد عقوبات! أضف بعضها.</p>';
    return;
  }

  punishments.forEach((p, index) => {
    list.innerHTML += `
      <div class="flex justify-between items-center bg-white/5 p-3 rounded-xl border animate-fade-in">
        <span class="text-sm font-bold text-right flex-1 ml-2">${p}</span>
        <button onclick="removePunishment(${index})" class="text-red-400 bg-red-500/10 w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors">✕</button>
      </div>
    `;
  });
}

// إضافة عقاب (مع التحقق)
function addPunishment() {
  const input = document.getElementById('new-punishment-input');
  const val = input.value.trim();

  if (!val) {
    showAlert("الرجاء كتابة العقاب أولاً! ✍️");
    return;
  }

  if (punishments.includes(val)) {
    showAlert("هذا العقاب موجود بالفعل! 🤔");
    return;
  }

  punishments.push(val);
  localStorage.setItem('out_loop_punishments', JSON.stringify(punishments));
  input.value = '';
  renderPunishmentList();
  sounds.tick();
}

// حذف عقاب
function removePunishment(index) {
  punishments.splice(index, 1);
  localStorage.setItem('out_loop_punishments', JSON.stringify(punishments));
  renderPunishmentList();
  sounds.flip();
}

// استعادة الافتراضي
function resetDefaultPunishments() {
  punishments = [...defaultPunishments];
  localStorage.setItem('out_loop_punishments', JSON.stringify(punishments));
  renderPunishmentList();
  showAlert("تمت استعادة العقوبات الافتراضية");
}

// رسم العجلة
function drawWheel() {
  wheelCanvas = document.getElementById('wheel-canvas');
  if (!wheelCanvas) return;
  wheelCtx = wheelCanvas.getContext('2d');

  const ctx = wheelCtx;
  const width = wheelCanvas.width;
  const height = wheelCanvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width / 2 - 10;

  ctx.clearRect(0, 0, width, height);

  const total = punishments.length;
  if (total === 0) return;

  const arc = (2 * Math.PI) / total;
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4'];

  punishments.forEach((p, i) => {
    const angle = i * arc;
    ctx.beginPath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, angle, angle + arc);
    ctx.lineTo(centerX, centerY);
    ctx.fill();
    ctx.stroke();

    // إضافة النص
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle + arc / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 24px Cairo"; // حجم خط أكبر للكشف
    ctx.fillText(p.length > 15 ? p.substring(0, 15) + '..' : p, radius - 20, 10);
    ctx.restore();
  });
}

// تدوير العجلة
function spinWheel() {
  if (punishments.length < 2) {
    showAlert("يجب أن يكون هناك عقابان على الأقل لتدوير العجلة!");
    return;
  }

  const canvas = document.getElementById('wheel-canvas');
  const btn = document.getElementById('btn-spin');
  const btnAdd = document.getElementById('btn-spin-add');
  const btnBack = document.getElementById('btn-spin-back');
  const resultDiv = document.getElementById('punishment-result');
  const resultText = document.getElementById('result-text');

  // إخفاء النتيجة السابقة
  resultDiv.classList.add('hidden');
  resultText.innerText = "";
  [btn, btnAdd, btnBack].forEach(b => b.disabled = true);

  // إعداد الدوران
  // 360 * 8 = 8 لفات كاملة + جزء عشوائي
  const extraSpins = 360 * 8;
  const randomDegree = Math.floor(Math.random() * 360);
  const totalRotation = extraSpins + randomDegree;

  // نضيف الدوران الجديد للمجموع السابق للحفاظ على السلاسة
  currentWheelRotation += totalRotation;

  // 1. تطبيق الحركة البصرية (CSS Transition)
  // ملاحظة: تأكد أن مدة الـ duration في الـ CSS هي 4000ms أو 4s
  canvas.style.transition = "transform 4000ms cubic-bezier(0.25, 1, 0.5, 1)";
  canvas.style.transform = `rotate(-${currentWheelRotation}deg)`;

  // 2. تشغيل صوت التكتكة المتزامن (Simulation)
  let time = 0;
  let interval = 20; // البداية: تكة كل 20 ملي ثانية (سريع جداً)
  const totalDuration = 4000; // 4 ثواني

  function scheduleNextTick() {
    // كلما زاد الوقت، زادت المدة بين التكات (محاكاة التباطؤ)
    // المعادلة: نزيد الفترة بنسبة 10% في كل خطوة
    interval = interval * 1.1;
    time += interval;

    if (time < totalDuration - 500) { // نتوقف قبل النهاية بقليل لتبدو واقعية
      setTimeout(() => {
        playWheelTick();
        scheduleNextTick(); // جدولة التكة التالية
      }, interval);
    }
  }

  // البدء بالصوت
  scheduleNextTick();

  // 3. إنهاء الدوران وإظهار النتيجة
  setTimeout(() => {
    calculateWinner(currentWheelRotation);
    [btn, btnAdd, btnBack].forEach(b => b.disabled = false);
    sounds.win(); // صوت الفوز عند التوقف
    createConfetti(); // احتفال
  }, 4000);
}

function calculateWinner(rotation) {
  const actualRotation = rotation % 360;
  const total = punishments.length;
  const sliceDeg = 360 / total;

  // 🧮 المعادلة الرياضية الصحيحة:
  // المؤشر موجود في الأعلى (زاوية 270 درجة في الـ Canvas).
  // وبما أن العجلة تدور عكس عقارب الساعة (CCW)، نضيف الدوران لـ 270 
  // لمعرفة من هي الشريحة التي صعدت للأعلى في هذه اللحظة!
  const normalizedDegree = (actualRotation + 270) % 360;

  const index = Math.floor(normalizedDegree / sliceDeg);

  const winningPunishment = punishments[index];

  document.getElementById('result-text').innerText = winningPunishment;
  document.getElementById('punishment-result').classList.remove('hidden');

  if (typeof triggerVibrate === 'function') triggerVibrate([50, 50, 200]);
}

// تعديل دالة showScreen لإضافة استدعاء رسم العجلة
const originalShowScreen = showScreen;
showScreen = function (screenId) {
  originalShowScreen(screenId);

  if (screenId === 'punishment') {
    // إعادة تعيين الواجهة عند الدخول (إخفاء أي نتيجة سابقة)
    const resDiv = document.getElementById('punishment-result');
    if (resDiv) resDiv.classList.add('hidden');

    // رسم العجلة
    setTimeout(drawWheel, 100);
  }
};

function closePunishmentScreen() {
  // 1. إخفاء صندوق النتيجة
  const resultDiv = document.getElementById('punishment-result');
  if (resultDiv) {
    resultDiv.classList.add('hidden');
  }

  // 2. مسح نص العقاب
  const resultText = document.getElementById('result-text');
  if (resultText) {
    resultText.innerText = "";
  }

  // 3. إزالة الكونفيتي إذا كان لا يزال يعمل
  const confettiContainer = document.getElementById('confetti-container');
  if (confettiContainer) {
    confettiContainer.innerHTML = '';
  }

  // 4. الانتقال لشاشة النتائج النهائية
  showScreen('final');

  // ✨ النزول التلقائي لأسفل الشاشة ✨
  setTimeout(() => {
    const finalScreen = document.getElementById('screen-final');
    if (finalScreen) {
      finalScreen.scrollTo({ top: finalScreen.scrollHeight, behavior: 'smooth' });
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, 50);
}

// ==========================================
// 🕵️‍♂️ منطق ماسح البصمة (Fingerprint Scanner)
// ==========================================

// المتغيرات الصوتية
let scanTimer = null;
// مسحنا scanAudioCtx لأننا سنعتمد على audioCtx الرئيسي للعبة
let scanOscillator = null;
let scanGain = null;

function startScan(e) {
  if (e && e.cancelable) e.preventDefault();

  const scannerEl = document.getElementById('fingerprint-scanner');
  const statusEl = document.getElementById('scan-status');
  const progressEl = document.getElementById('scan-progress');

  // 1. إعادة تعيين الدائرة إلى الصفر (فارغة) فوراً وبدون انيميشن
  if (progressEl) {
    progressEl.style.transition = 'none'; // إيقاف الحركة
    progressEl.style.strokeDashoffset = '301.6'; // القيمة الفارغة
    progressEl.style.opacity = '1'; // إظهار الدائرة

    // إجبار المتصفح على استيعاب الحالة الفارغة (Reflow)
    void progressEl.offsetWidth;
  }

  // تفعيل كلاس التنسيق (للأيقونة والليزر)
  scannerEl.classList.add('scanning-active');

  if (statusEl) {
    statusEl.innerText = "جاري التحليل...";
    statusEl.className = "text-xs font-mono h-4 mt-4 text-emerald-400 animate-pulse";
  }

  // 2. البدء بالملء (تأخير بسيط جداً للسماح بالأنيميشن)
  if (progressEl) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progressEl.style.transition = 'stroke-dashoffset 2s linear';
        progressEl.style.strokeDashoffset = '0';
      });
    });
  }

  // --- تشغيل الصوت بالاعتماد على السياق العام ---
  if (!isMuted) {
    // ✨ الحماية: تنظيف أي صوت مسح سابق فوراً قبل بدء واحد جديد ✨
    if (scanOscillator) {
      try { scanOscillator.stop(); scanOscillator.disconnect(); } catch (e) { }
    }
    if (scanGain) {
      try { scanGain.disconnect(); } catch (e) { }
    }

    // نستخدم audioCtx العام مباشرة
    scanOscillator = audioCtx.createOscillator();
    scanGain = audioCtx.createGain();
    scanOscillator.type = 'sine';

    // نستخدم الوقت من السياق العام
    const now = audioCtx.currentTime;

    scanOscillator.frequency.setValueAtTime(150, now);
    scanOscillator.frequency.exponentialRampToValueAtTime(600, now + 2);

    scanGain.gain.setValueAtTime(0, now);
    scanGain.gain.linearRampToValueAtTime(0.05, now + 0.1);

    scanOscillator.connect(scanGain);
    scanGain.connect(masterGain);

    scanOscillator.start();
    if (typeof triggerVibrate === 'function') triggerVibrate([20]);
  }

  // انتهاء المؤقت
  scanTimer = setTimeout(() => {
    completeScan();
  }, 2000);
}

function cancelScan() {
  if (!scanTimer) return;
  clearTimeout(scanTimer);
  scanTimer = null;

  const scannerEl = document.getElementById('fingerprint-scanner');
  const statusEl = document.getElementById('scan-status');
  const progressEl = document.getElementById('scan-progress');

  scannerEl.classList.remove('scanning-active');

  // إعادة الدائرة للفراغ بسرعة
  if (progressEl) {
    progressEl.style.transition = 'stroke-dashoffset 0.2s ease-out';
    progressEl.style.strokeDashoffset = '301.6';
    progressEl.style.opacity = '0';
  }

  if (statusEl) {
    statusEl.innerText = "فشل المسح!";
    statusEl.className = "text-xs font-mono h-4 mt-4 text-red-400";
  }

  // إيقاف الصوت
  if (scanOscillator && scanGain) {
    const now = audioCtx.currentTime;

    // ✨ الإضافة: عزل المتغيرات الحالية لمنع التداخل إذا ضغط اللاعب بسرعة ✨
    const oscToStop = scanOscillator;
    const gainToStop = scanGain;

    // تصفير المتغيرات العامة فوراً لتستقبل ضغطة جديدة بدون مشاكل
    scanOscillator = null;
    scanGain = null;

    gainToStop.gain.cancelScheduledValues(now);
    gainToStop.gain.setValueAtTime(gainToStop.gain.value, now);
    gainToStop.gain.linearRampToValueAtTime(0, now + 0.1);

    setTimeout(() => {
      try {
        oscToStop.stop();
        oscToStop.disconnect();
        gainToStop.disconnect();
      } catch (e) { }
    }, 150);
  }
}

// دالة التصفير عند زر التالي (للأمان الإضافي)
function resetScanner() {
  const progressEl = document.getElementById('scan-progress');
  const scannerEl = document.getElementById('fingerprint-scanner');
  const statusEl = document.getElementById('scan-status');

  if (scannerEl) {
    scannerEl.classList.remove('scanning-active');
    scannerEl.style.pointerEvents = "auto";
  }
  if (statusEl) {
    statusEl.innerText = "ضع إصبعك للكشف";
    statusEl.className = "text-xs text-indigo-400 mt-4 font-mono h-4";
  }
  if (progressEl) {
    progressEl.style.transition = 'none';
    progressEl.style.strokeDashoffset = '301.6';
    progressEl.style.opacity = '0'; // نخفيها تماماً حتى اللمسة القادمة
  }
}

function completeScan() {
  scanTimer = null;

  // إيقاف صوت المسح
  if (scanOscillator) {
    try { scanOscillator.stop(); } catch (e) { }
    scanOscillator = null;
  }

  // تشغيل صوت النجاح
  if (!isMuted) sounds.win(); // أو صوت خاص "Access Granted"

  const statusEl = document.getElementById('scan-status');
  statusEl.innerText = "تم التحقق! ✅";

  // استدعاء منطق الكشف الموجود مسبقاً (الغليتش + القلب)
  // ملاحظة: نستخدم toggleReveal أو performRevealAction حسب آخر تحديث للكود
  if (typeof performRevealLogic === 'function') {
    performRevealLogic();
  } else if (typeof toggleReveal === 'function') {
    toggleReveal();
  } else {
    flipCard(); // احتياط
  }

  // إظهار زر "التالي" وإخفاء الماسح لمنع التكرار
  document.getElementById('fingerprint-scanner').style.pointerEvents = "none"; // تعطيل الماسح
  document.getElementById('btn-next-player').classList.remove('hidden');
}

// دالة للانتقال للاعب التالي (زر جديد)
function nextPlayerAction() {
  const btn = document.getElementById('btn-next-player');

  // ✅ حماية: منع الضغط إذا كان الزر مخفياً أو تم ضغطه للتو
  if (!btn || btn.classList.contains('hidden')) return;

  // إخفاء الزر فوراً
  btn.classList.add('hidden');

  // استدعاء دالة التصفير القوية
  resetScanner();

  // قلب البطاقة والانتقال
  const cardObj = document.getElementById('role-card');
  cardObj.classList.remove('is-flipped');

  setTimeout(() => {
    state.revealIndex++;
    startRevealSequence();
  }, 300);
}

// ==========================================
// 🤖 محلل الأداء الساخر (The Roaster AI)
// ==========================================
function generateRoast(winnerType) {
  const roastEl = document.getElementById('final-roast-msg');
  if (!roastEl) return;

  let msg = "";
  const timeUsed = state.initialTimer - state.timer;
  const isQuickGame = timeUsed < 20;

  // 1. 🔍 تحديد من تم التصويت عليه (الضحية) لمعرفة من ضحى بنفسه
  let victimId = null;

  if (state.votesHistory && state.votesHistory.length > 0) {
    const voteCounts = {};
    state.votesHistory.forEach(v => { voteCounts[v.target] = (voteCounts[v.target] || 0) + 1; });
    let maxVotes = -1;
    let tiedVictims = []; // مصفوفة لحفظ المتعادلين
    for (const [pid, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        tiedVictims = [parseInt(pid)]; // قائمة جديدة
      } else if (count === maxVotes) {
        tiedVictims.push(parseInt(pid)); // إضافة المتعادل
      }
    }
    // ✨ قانون الأغلبية الصارمة: إذا تعادل أكثر من شخص، لا يوجد ضحية فعلية!
    victimId = tiedVictims.length === 1 ? tiedVictims[0] : null;
  }
  const victimRole = victimId !== null ? state.currentRoles.find(r => r.id === victimId)?.role : null;

  // 2. 📝 توليد التعليق الساخر بناءً على النتيجة
  if (winnerType === 'blind_win') {
    msg = "شكيتوا في بعض على الفاضي! 😂💔";
  }
  else if (winnerType === 'group_win') {
    if (isQuickGame) {
      msg = "شارلوك هولمز فخور بكم! 🕵️‍♂️⚡";
    } else if (state.timer === 0) {
      msg = "أخيراً! بغينا ننام.. 😴🕙";
    } else if (state.panicMode) {
      msg = "كفو! جبتوه قبل لا يتنفس! 😤🔥";
    } else {
      msg = "تعاون أسطوري! لا مكان للمجرمين 🚓";
    }
  }
  else if (winnerType === 'out_win') {
    const guessOptions = document.getElementById('guess-options');
    const isGuessWin = guessOptions && guessOptions.innerHTML !== "";

    // حالة 1: الضايع فاز بالتخمين (كشفت السالفة أو بعد التصويت عليه)
    if (isGuessWin || state.panicMode) {
      msg = "الضايع جابها من الآخر! تفكير مرعب 🧠🔥";
    }
    // حالة 2: المموه ضحى بنفسه (وخطف النقطتين)
    else if (victimRole === 'undercover') {
      msg = "المموه أكل المقلب وضحى بنفسه من أجل الوطن 🫡🥇 (خطف النقطتين!)";
    }
    // حالة 3: العميل المزدوج ضحى بنفسه (وخطف النقطتين)
    else if (victimRole === 'agent') {
      msg = "العميل لعب في حسبتكم وطلع بطل! 🎭🦊 (سرق النقطتين!)";
    }
    // حالة 4: الضايع نجا لأن المحققين صوتوا على شخص بريء
    else {
      msg = "لعب بعقولكم والضايع طلع منها زي الشعرة من العجين! 🤯🤡";
    }
  }

  roastEl.innerText = msg;
}

function openRenameModal(currentName) {
  document.getElementById('rename-input').value = currentName;
  document.getElementById('modal-rename').classList.remove('hidden');
  document.getElementById('modal-rename').classList.add('flex');
}

function closeRenameModal() {
  document.getElementById('modal-rename').classList.add('hidden');
  document.getElementById('modal-rename').classList.remove('flex');
}

function submitRename() {
  const newName = sanitizeHTML(document.getElementById('rename-input').value.trim());

  if (!newName) return showAlert("الاسم لا يمكن أن يكون فارغاً!");
  if (newName.length > 15) return showAlert("الاسم طويل جداً!");

  // إذا كنت المضيف، عدل مباشرة
  if (isHost) {
    // ✨ التحقق الذكي باستخدام normalizeArabic ✨
    const normalizedNewName = normalizeArabic(newName);
    if (onlinePlayers.some(p => normalizeArabic(p.name) === normalizedNewName && p.id !== myPlayerId)) {
      return showAlert("الاسم مأخوذ أو مشابه جداً لاسم آخر! اختر غيره.");
    }

    // تحديث محلي (نحفظ الاسم بالشكل الذي كتبه)
    const me = onlinePlayers.find(p => p.id === 0);
    if (me) me.name = newName;
    updateLobbyUI();
    broadcast({ type: 'LOBBY_UPDATE', players: onlinePlayers });
    closeRenameModal();
  }
  // إذا كنت عضواً، أرسل طلب للمضيف
  else {
    myConn.send({ type: 'REQUEST_RENAME', newName: newName });
  }
}

// ==========================================
// 🔄 نظام إدارة أدوار الأونلاين (المتوافق مع اللعبة)
// ==========================================
let availableAskers = [];
let currentAskerId = null;
let currentTargetId = null;

function getPlayerNameById(id) {
  // استخدام onlinePlayers بدلاً من state.players ليكون دقيقاً في الأونلاين
  const p = onlinePlayers.find(player => player.id === id);
  return p ? p.name : (id === myPlayerId ? "أنت" : "لاعب");
}

function hostPickNextTurn() {
  if (!isOnline || !isHost) return;

  // جلب جميع الآيديات الموجودة حالياً (المضيف + اللاعبين)
  let allPlayerIds = onlinePlayers.map(p => p.id);

  // إذا انتهت الفرص، أعد التعبئة
  if (availableAskers.length === 0) {
    availableAskers = [...allPlayerIds];
  }

  // فلترة أمان (في حال خروج لاعب فجأة)
  availableAskers = availableAskers.filter(id => allPlayerIds.includes(id));
  if (availableAskers.length === 0) return;

  // اختيار المحقق
  const askerIndex = Math.floor(Math.random() * availableAskers.length);
  currentAskerId = availableAskers[askerIndex];
  availableAskers.splice(askerIndex, 1);

  // اختيار الضحية
  let possibleTargets = allPlayerIds.filter(id => id !== currentAskerId);
  if (possibleTargets.length === 0) possibleTargets = allPlayerIds; // احتياط
  currentTargetId = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

  // إرسال للجميع
  broadcast({
    type: 'TURN_UPDATE',
    askerId: currentAskerId,
    targetId: currentTargetId
  });

  // تحديث شاشة المضيف
  updateTurnUI(currentAskerId, currentTargetId);
}

// عندما يضغط اللاعب على زر "التالي"
function requestNextTurn() {
  try { sounds.tick(); } catch (e) { }

  if (isOnline) {
    // 🌐 منطق الأونلاين
    if (isHost) {
      hostPickNextTurn();
    } else {
      if (myConn && myConn.open) {
        myConn.send({ type: 'REQUEST_NEXT_TURN' });
      }
    }
  } else {
    // 📱 منطق الأوفلاين (جهاز واحد)
    offlinePickNextTurn();
  }
}

function updateTurnUI(askerId, targetId) {
  const container = document.getElementById('online-turn-container');
  const textEl = document.getElementById('online-turn-text');
  const btnEl = document.getElementById('btn-next-turn');

  if (!isOnline) {
    if (container) container.classList.add('hidden');
    return;
  }
  if (container) container.classList.remove('hidden');

  const askerName = getPlayerNameById(askerId);
  const targetName = getPlayerNameById(targetId);

  if (askerId === myPlayerId) {
    textEl.innerHTML = `🕵️ <span class="text-emerald-400">دورك!</span> اسأل <span class="text-yellow-400 font-black">${targetName}</span>`;
    btnEl.classList.remove('hidden');

    // ✨ المؤثرات التي نسيتها ✨
    if (typeof triggerVibrate === 'function') {
      triggerVibrate([100, 100, 200]);
    }
    if (typeof isMuted !== 'undefined' && !isMuted && typeof playTone === 'function') {
      setTimeout(() => playTone(800, 0.05, 'sine', 0.05), 0);
      setTimeout(() => playTone(1000, 0.05, 'sine', 0.05), 150);
    }
  } else {
    textEl.innerHTML = `⏳ انتظر.. <span class="text-indigo-400 font-black">${askerName}</span> يسأل <span class="text-yellow-400 font-black">${targetName}</span>`;
    if (isHost) {
      btnEl.classList.remove('hidden');
    } else {
      btnEl.classList.add('hidden');
    }
  }
}

// ==========================================
// 📱 منطق توزيع الأدوار (لنمط جهاز واحد / أوفلاين)
// ==========================================
let offlineAvailableAskers = [];

function offlinePickNextTurn() {
  // جلب جميع الآيديات من حالة اللعبة الحالية
  let allPlayerIds = state.players.map(p => p.id);

  // إذا انتهت الفرص (الكل سأل)، أعد تعبئة القائمة
  if (offlineAvailableAskers.length === 0) {
    offlineAvailableAskers = [...allPlayerIds];
  }

  // 1. اختيار المحقق عشوائياً وحذفه من قائمة المتاحين
  const askerIndex = Math.floor(Math.random() * offlineAvailableAskers.length);
  const currentAskerId = offlineAvailableAskers[askerIndex];
  offlineAvailableAskers.splice(askerIndex, 1);

  // 2. اختيار الضحية (شخص آخر غير المحقق)
  let possibleTargets = allPlayerIds.filter(id => id !== currentAskerId);
  if (possibleTargets.length === 0) possibleTargets = allPlayerIds; // احتياط
  const currentTargetId = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

  // 3. جلب الأسماء
  const askerName = state.players.find(p => p.id === currentAskerId).name;
  const targetName = state.players.find(p => p.id === currentTargetId).name;

  // 4. تحديث الواجهة المشتركة (الجميع ينظر لنفس الشاشة)
  const container = document.getElementById('online-turn-container');
  const textEl = document.getElementById('online-turn-text');
  const btnEl = document.getElementById('btn-next-turn');

  if (container) container.classList.remove('hidden');

  // الزر يظهر دائماً في الأوفلاين ليضغط عليه أي شخص
  if (btnEl) btnEl.classList.remove('hidden');

  // النص مصمم ليقرأه الجميع
  textEl.innerHTML = `🕵️ يا <span class="text-indigo-400 font-black">${askerName}</span>، اسأل <span class="text-yellow-400 font-black">${targetName}</span>`;
}

// ==========================================
// ⭐ نظام تقييم التطبيق ⭐
// ==========================================

function showRatingModal() {
  const modal = document.getElementById('modal-rate');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    sounds.win(); // صوت احتفالي خفيف
    createConfetti(); // بعض الزينة لجذب الانتباه
  }
}

function closeRatingModal() {
  const modal = document.getElementById('modal-rate');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function submitRatingClick() {
  // حفظ أن اللاعب وافق على التقييم لكي لا نزعجه مجدداً
  localStorage.setItem('has_rated_app', 'true');
  closeRatingModal();

  if (typeof Android !== "undefined" && Android.rateApp) {
    Android.rateApp(); // مناداة الأندرويد لفتح المتجر
  } else {
    showAlert("هذه الميزة تعمل في تطبيق الأندرويد الفعلي 📱");
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // ✅ تحقق أمان
  if (typeof wordBank === 'undefined') {
    console.error("Critical Error: data.js not loaded!");
    showAlert("خطأ في ملفات اللعبة: قاعدة البيانات مفقودة. أعد تحميل الصفحة.");
    return;
  }

  // Initialize default selected categories (e.g. none)
  state.allowedCategories = []; // User must select
  isDarkMode = !document.body.classList.contains('light-mode');

  // ✨ جلب الكلمات الخاصة المحفوظة من الذاكرة عند فتح اللعبة ✨
  const savedCustomWords = localStorage.getItem('spy_custom_words');
  if (savedCustomWords) {
    state.customWords = JSON.parse(savedCustomWords);
  }

  // ✨ جلب السوالف الملعوبة سابقاً لكي لا تتكرر أبداً ✨
  const savedUsedWords = localStorage.getItem('spy_used_words');
  if (savedUsedWords) {
    state.usedWords = JSON.parse(savedUsedWords);
  }

  updateSettingsUI();
  updateSetupInfo();
  renderCustomWords();
  startHeroEmojiAnimation();

  const unlockAudio = () => {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        // إزالة المستمع بعد النجاح لتخفيف الحمل
        document.body.removeEventListener('click', unlockAudio);
        document.body.removeEventListener('touchstart', unlockAudio);
      });
    }
  };
  document.body.addEventListener('click', unlockAudio);
  document.body.addEventListener('touchstart', unlockAudio);
});

// حماية إغلاق المتصفح أو التبويب (X)
window.addEventListener('beforeunload', (e) => {
  // الشرط: إذا كنا أونلاين + يوجد لاعبين أو أكثر
  if (isOnline && onlinePlayers.length >= 2) {
    // نكتفي فقط بإظهار رسالة المتصفح
    // لن نرسل أي بيانات هنا، سنعتمد على انقطاع الاتصال الفعلي (conn.on close)
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});