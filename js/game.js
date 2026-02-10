const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let isMuted = false;
let isVibrationEnabled = true;
let isDarkMode = true;

// Settings
function openSettingsModal() { document.getElementById('modal-settings').classList.remove('hidden'); document.getElementById('modal-settings').classList.add('flex'); updateSettingsUI(); }
function closeSettingsModal() { document.getElementById('modal-settings').classList.add('hidden'); document.getElementById('modal-settings').classList.remove('flex'); }
function toggleMute() { isMuted = !isMuted; updateSettingsUI(); }
function toggleVibration() { isVibrationEnabled = !isVibrationEnabled; if (isVibrationEnabled) triggerVibrate(50); updateSettingsUI(); }
function toggleTheme() { isDarkMode = !isDarkMode; document.body.classList.toggle('light-mode', !isDarkMode); updateSettingsUI(); }
function updateSettingsUI() {
  document.getElementById('lbl-mute').innerText = isMuted ? '🔇' : '🔊';
  document.getElementById('lbl-vibe').innerText = isVibrationEnabled ? '📳' : '📴';
  document.getElementById('lbl-theme').innerText = isDarkMode ? '🌙' : '☀️';
}

// Helpers
function formatTimeLabel(s) {
  const m = Math.floor(s / 60);
  const sc = s % 60;
  let mText = "";

  // تحديد صيغة الدقائق
  if (m === 1) mText = "دقيقة واحدة";
  else if (m === 2) mText = "دقيقتان";
  else if (m >= 3 && m <= 10) mText = `${m} دقائق`;
  else mText = `${m} دقيقة`; // من 11 فما فوق (وأيضاً الصفر إذا وجد)

  // إرجاع النص النهائي (مع الثواني أو بدونها)
  return sc === 0 ? mText : `${mText} و${sc} ثانية`;
}
function triggerVibrate(p) { if (isVibrationEnabled && navigator.vibrate) navigator.vibrate(p); }
function playTone(f, d, t = 'sine', v = 0.1) { if (isMuted) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.type = t; o.frequency.setValueAtTime(f, audioCtx.currentTime); g.gain.setValueAtTime(v, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + d); o.start(); o.stop(audioCtx.currentTime + d); }
function playFlipSound() { if (isMuted) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.type = 'triangle'; o.frequency.setValueAtTime(400, audioCtx.currentTime); o.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2); g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2); o.start(); o.stop(audioCtx.currentTime + 0.2); }
function playFunnySound() { if (isMuted) return; const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.type = 'sawtooth'; o.frequency.setValueAtTime(300, audioCtx.currentTime); o.frequency.linearRampToValueAtTime(150, audioCtx.currentTime + 0.2); o.frequency.linearRampToValueAtTime(300, audioCtx.currentTime + 0.4); o.frequency.linearRampToValueAtTime(150, audioCtx.currentTime + 0.6); g.gain.setValueAtTime(0.1, audioCtx.currentTime); g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6); o.start(); o.stop(audioCtx.currentTime + 0.6); }

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
  gain.connect(audioCtx.destination);

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

// ==========================================
// ⚡ منطق الغليتش والصوت الموحد ⚡
// ==========================================

// 1. دالة تشغيل المؤثرات (صوت + اهتزاز + كلاس CSS)
function triggerGlitchEffects() {
  // أ) تشغيل الصوت (AudioContext)
  if (!isMuted) {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const t = ctx.currentTime;

    // توليد ضوضاء بيضاء (تشويش)
    const bufferSize = ctx.sampleRate * 0.3; // مدة 0.3 ثانية
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const gain = ctx.createGain();
    // جعل الصوت حاداً ومتقطعاً
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    noise.connect(gain);
    gain.connect(ctx.destination);
    noise.start(t);
  }

  // ب) اهتزاز الجهاز
  triggerVibrate([40, 30, 40, 30]);

  // ج) تفعيل تأثير الـ CSS على الجسم بالكامل
  document.body.classList.add('force-glitch');

  // إزالة التأثير بعد 400 ملي ثانية (نفس مدة الانيميشن في CSS)
  setTimeout(() => {
    document.body.classList.remove('force-glitch');
  }, 400);
}

// صوت درامي لبدء التصويت (جرس عميق)
function playVotingSound() {
  if (isMuted) return;
  const t = audioCtx.currentTime;

  // 1. الطبقة العميقة (The Boom)
  const oscLow = audioCtx.createOscillator();
  const gainLow = audioCtx.createGain();
  oscLow.connect(gainLow);
  gainLow.connect(audioCtx.destination);

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
  gainHigh.connect(audioCtx.destination);

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
  g.connect(audioCtx.destination);

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
  allowedCategories: [], usedWords: [], customWords: [], lastWinner: null, votingMode: 'group', voterIndex: 0,
  votesAccumulated: {}, panicMode: false, smartDistractors: true, blindModeActive: false, blindRoundType: null,
  guessInterval: null, panicModeAllowed: false
};

function showScreen(screenId) {
  document.querySelectorAll('#app > div').forEach(div => div.classList.add('hidden'));
  const target = document.getElementById(`screen-${screenId}`);
  if (target) { target.classList.remove('hidden'); target.scrollTop = 0; window.scrollTo(0, 0); }

  if (screenId === 'category-select') renderCategorySelectionGrid();
  if (screenId === 'setup') renderActiveCategoryGrid();
  if (screenId === 'leaderboard') { updateLeaderboardUI(); checkResetButtonVisibility(); }
  if (screenId === 'final') updateFinalResultsUI();
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

  // 1. خيار "عشوائي" (دائماً في البداية)
  const isRandomActive = state.selectedCategory === 'عشوائي';
  grid.innerHTML += `
    <div onclick="selectCategory('عشوائي', '${gridId}')" 
         class="category-card ${isRandomActive ? 'active' : ''}">
         <span class="text-2xl">🎲</span>
         <span class="text-xs">عشوائي</span>
    </div>`;

  // 2. عرض الفئات المسموحة (Allowed Categories)
  state.allowedCategories.forEach(cat => {

    // شرط خاص للكلمات الخاصة: لا تعرضها في الاختيار السريع إلا إذا كان هناك عدد كافٍ من الكلمات
    if (cat === "كلمات خاصة" && state.customWords.length < 4) {
      return; // تخطي هذا التكرار (لا تعرض الزر)
    }

    // البحث عن الإيموجي الثابت في categoryGroups
    let emoji = "❓";

    // نلف على كل المجموعات للبحث عن الفئة الحالية
    for (const group of Object.values(categoryGroups)) {
      const foundItem = group.find(item => item.id === cat);
      if (foundItem) {
        emoji = foundItem.emoji;
        break; // وجدنا الايموجي، نوقف البحث
      }
    }

    const isActive = state.selectedCategory === cat;

    // إضافة الكرت للشبكة
    grid.innerHTML += `
        <div onclick="selectCategory('${cat}', '${gridId}')" 
             class="category-card ${isActive ? 'active' : ''}">
             <span class="text-2xl">${emoji}</span>
             <span class="text-xs">${cat}</span>
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

function checkResetButtonVisibility() {
  const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  const hasData = saved.some(p => (p.points || 0) > 0);
  const trigger = document.getElementById('btn-reset-points-trigger');
  if (trigger) trigger.classList.toggle('hidden', !hasData);
}
function confirmReset() {
  const modal = document.getElementById('modal-confirm');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  sounds.wrong();
}

function showAlert(msg) {
  document.getElementById('alert-message').innerText = msg;
  document.getElementById('modal-alert').classList.remove('hidden');
  document.getElementById('modal-alert').classList.add('flex');
  sounds.wrong();
}

// --- Category Selection Logic (Grouped) ---
function renderCategorySelectionGrid() {
  const grid = document.getElementById('selection-grid');
  if (!grid) return; grid.innerHTML = '';

  for (const [groupName, cats] of Object.entries(categoryGroups)) {
    const header = document.createElement('div');
    header.className = "section-header"; header.innerText = groupName;
    grid.appendChild(header);
    const subGrid = document.createElement('div');
    subGrid.className = "grid grid-cols-3 gap-2 text-center mb-4";

    cats.forEach(catItem => {
      const catName = catItem.id;   // الاسم: "دول"
      const catEmoji = catItem.emoji; // الايموجي: "🌍"

      // التحقق من وجود الفئة في البيانات
      if (wordBank[catName] || catName === "كلمات خاصة") {
        const isSelected = state.allowedCategories.includes(catName);

        subGrid.innerHTML += `
            <div onclick="toggleCategorySelection('${catName}')" class="category-card ${isSelected ? 'selected active' : ''}">
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
}

function toggleCategorySelection(cat) {
  if (state.allowedCategories.includes(cat)) {
    state.allowedCategories = state.allowedCategories.filter(c => c !== cat);
  } else {
    if (state.allowedCategories.length < 12) {
      state.allowedCategories.push(cat);
    } else {
      showAlert("الحد الأقصى 12 فئة!");
    }
  }
  renderCategorySelectionGrid();
}

function updateCatCounter() {
  const count = state.allowedCategories.length;
  const counter = document.getElementById('cat-counter');
  const btn = document.getElementById('btn-confirm-cats');

  counter.innerText = `${count}/12`;

  if (count >= 6 && count <= 12) {
    counter.classList.remove('text-red-500'); counter.classList.add('text-primary');
    btn.disabled = false; btn.style.opacity = "1"; btn.style.filter = "none"; btn.style.cursor = "pointer";
  } else {
    counter.classList.add('text-red-500'); counter.classList.remove('text-primary');
    btn.disabled = true; btn.style.opacity = "0.5"; btn.style.filter = "grayscale(100%)"; btn.style.cursor = "not-allowed";
  }
}

function confirmCategories() {
  if (state.allowedCategories.length < 6) { showAlert("اختر 6 فئات على الأقل!"); return; }
  // Default selectedCategory to 'Random' initially if not set or invalid
  if (!state.allowedCategories.includes(state.selectedCategory) && state.selectedCategory !== 'عشوائي') {
    state.selectedCategory = 'عشوائي';
  }
  showScreen('setup');
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

function selectCategory(cat, gridId) {
  state.selectedCategory = cat;
  if (gridId === 'active-category-grid') renderActiveCategoryGrid();
  // Update Quick Change modal UI if active
  if (gridId === 'modal-categories-grid') renderQuickCategorySelection('modal-categories-grid');
  sounds.tick();

  // Show custom words UI only if user manually adds them or selects a hypothetical custom category (not implemented in selection screen)
  // For now, keep hidden unless 'كلمات خاصة' exists and is selected
  if (cat === 'كلمات خاصة') document.getElementById('custom-words-ui').classList.remove('hidden');
  else document.getElementById('custom-words-ui').classList.add('hidden');
}

// --- Main Functions ---
function addCustomWord() {
  const input = document.getElementById('custom-word-input');
  const word = input.value.trim();
  if (word) {
    // Prevent duplicate words
    if (state.customWords.some(w => w.word.toLowerCase() === word.toLowerCase())) {
      showAlert("هذه الكلمة مضافة بالفعل!");
      return;
    }

    state.customWords.push({ word, emoji: "✏️", desc: "سالفة خاصة." });
    input.value = ''; renderCustomWords();
  }
}
function renderCustomWords() {
  const list = document.getElementById('custom-words-list');
  if (!list) return; list.innerHTML = '';
  state.customWords.forEach((w, i) => { list.innerHTML += `<span class="bg-indigo-500/20 px-2 py-1 rounded-full text-xs text-theme-main">${w.word} <button onclick="state.customWords.splice(${i},1);renderCustomWords();">×</button></span>`; });
  // Note: Custom words are handled by checking if populated in setupRoles
}

function setVotingMode(mode) {
  state.votingMode = mode;
  const groupBtn = document.getElementById('btn-vote-group');
  const indivBtn = document.getElementById('btn-vote-individual');
  if (mode === 'group') {
    groupBtn.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-lg";
    indivBtn.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-theme-main";
  } else {
    indivBtn.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-lg";
    groupBtn.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-theme-main";
  }
  sounds.tick();
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
  const panicContainer = document.getElementById('panic-container'); // "Kashaft Al Salfa"
  const panicCheckbox = document.getElementById('check-panic-mode');

  if (blindMode) {
    panicContainer.classList.add('opacity-50', 'pointer-events-none');
    panicCheckbox.checked = false;
    panicCheckbox.disabled = true;
  } else {
    panicContainer.classList.remove('opacity-50', 'pointer-events-none');
    panicCheckbox.disabled = false;
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
  for (let i = 0; i < count; i++) {
    const p = saved[i] || { name: `المحقق ${i + 1}`, avatar: avatars[i % avatars.length] };

    // HTML structure as requested: Name Top, Avatars Bottom
    container.innerHTML += `
                    <div class="player-input-container">
                        <div>
                            <label class="player-label">اسم اللاعب ${i + 1}</label>
                            <input type="text" id="name-${i}" value="${p.name}" class="player-input" placeholder="اكتب الاسم...">
                        </div>
                        <input type="hidden" id="avatar-${i}" value="${p.avatar}">
                        <div class="avatars-grid">
                            ${avatars.map(a => `<button onclick="setAvatar(${i}, '${a}')" id="av-${i}-${a}" class="avatar-btn ${a === p.avatar ? 'selected' : ''}">${a}</button>`).join('')}
                        </div>
                    </div>`;
  }
  showScreen('names');
}

function setAvatar(pIdx, av) {
  // Remove 'selected' class from all buttons in this player's container
  // We need to target the specific container. Since IDs are unique (av-{i}-{a}), we can do this:
  const container = document.getElementById(`names-container`).children[pIdx];
  const buttons = container.querySelectorAll('.avatar-btn');
  buttons.forEach(btn => btn.classList.remove('selected'));

  document.getElementById(`av-${pIdx}-${av}`).classList.add('selected');
  document.getElementById(`avatar-${pIdx}`).value = av;
  triggerVibrate(10);
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
  const enteredNames = new Set(); // نستخدم Set لتخزين الأسماء الفريدة

  for (let i = 0; i < count; i++) {
    const nameInp = document.getElementById(`name-${i}`);
    const nameVal = nameInp ? nameInp.value.trim() : "";

    // 1. التحقق من أن الاسم ليس فارغاً
    if (nameVal === "") {
      showAlert("الرجاء كتابة أسماء جميع اللاعبين!");
      return;
    }

    // 2. التحقق من أن الاسم غير مكرر
    if (enteredNames.has(nameVal)) {
      showAlert(`الاسم "${nameVal}" مكرر! يرجى تغيير الأسماء المتشابهة.`);
      return;
    }

    enteredNames.add(nameVal); // إضافة الاسم للقائمة المرجعية
  }
  // --- نهاية التعديل ---

  state.players = [];
  const savedData = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  for (let i = 0; i < count; i++) {
    const nameInp = document.getElementById(`name-${i}`);
    const name = nameInp.value.trim();
    const avatar = document.getElementById(`avatar-${i}`).value;
    const existing = savedData[i];
    state.players.push({
      id: i, name, avatar,
      points: existing ? (existing.points || 0) : 0,
      stats: existing?.stats || { det: { w: 0, l: 0 }, out: { w: 0, l: 0 }, agt: { w: 0, l: 0 }, und: { w: 0, l: 0 } }
    });
  }
  localStorage.setItem('out_loop_tablet_v4_players', JSON.stringify(state.players));

  state.timer = parseInt(document.getElementById('input-time').value);
  state.initialTimer = state.timer;
  state.doubleAgentActive = document.getElementById('check-double-agent').checked;
  state.undercoverActive = document.getElementById('check-undercover').checked;

  // "Kashaft Al Salfa" toggle logic
  state.panicModeAllowed = document.getElementById('check-panic-mode').checked;
  state.guessingEnabled = document.getElementById('check-guessing').checked;

  state.blindModeActive = document.getElementById('check-blind-mode').checked;

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
  // 1. تجهيز الكلمات الخاصة
  if (state.customWords.length > 0) wordBank["كلمات خاصة"] = state.customWords;

  // 2. اختيار الفئة
  let cat = state.selectedCategory;
  let pool;

  // منطق العشوائي
  if (cat === "عشوائي") {
    let availableCats = [...state.allowedCategories];
    if (state.customWords.length >= 4) {
      availableCats.push("كلمات خاصة");
      wordBank["كلمات خاصة"] = state.customWords;
    }
    if (availableCats.length === 0) availableCats = ["طعام"];
    cat = availableCats[Math.floor(Math.random() * availableCats.length)];
  }

  state.currentRoundCategory = cat;
  pool = wordBank[cat] || wordBank["طعام"];
  if (!pool || pool.length === 0) { cat = "طعام"; state.currentRoundCategory = "طعام"; pool = wordBank["طعام"]; }

  // ============================================================
  // التعديل الجديد: تحديد "وصف الفئة" (الاسم + الإيموجي)
  // ============================================================
  let categoryDescription = cat; // الافتراضي: اسم الفئة فقط (مثل "دول")

  // البحث عن الإيموجي الخاص بالفئة من categoryGroups
  for (const group of Object.values(categoryGroups)) {
    const foundItem = group.find(item => item.id === cat);
    if (foundItem) {
      // دمج الإيموجي مع الاسم (مثال: "🌍 دول")
      categoryDescription = `${foundItem.emoji} ${cat}`;
      break;
    }
  }
  // ============================================================

  // 3. اختيار السالفة (Secret Word)
  let candidates = pool.filter(w => !state.usedWords.includes(w.word));
  if (candidates.length === 0) { state.usedWords = []; candidates = pool; }

  // نستخدم Spread Operator (...) لنسخ الكائن وتعديل الوصف
  const selectedSecret = candidates[Math.floor(Math.random() * candidates.length)];
  state.secretData = {
    ...selectedSecret,
    desc: categoryDescription // هنا نستبدل وصف الكلمة بوصف الفئة
  };

  state.usedWords.push(state.secretData.word);
  if (state.usedWords.length > 10) state.usedWords.shift();

  // 4. منطق المموه (مع تطبيق وصف الفئة أيضاً)
  let ucData = null;

  if (cat === "كلمات خاصة") {
    const others = pool.filter(w => w.word !== state.secretData.word);
    if (others.length > 0) {
      ucData = {
        ...others[Math.floor(Math.random() * others.length)],
        desc: categoryDescription // توحيد الوصف
      };
    }
  } else {
    // التحقق من قائمة related
    if (state.secretData.related && Array.isArray(state.secretData.related) && state.secretData.related.length > 0) {

      const randomRelatedWord = state.secretData.related[Math.floor(Math.random() * state.secretData.related.length)];
      const foundObject = pool.find(w => w.word === randomRelatedWord);

      if (foundObject) {
        // وجدنا الكلمة في البيانات، ننسخها ونعدل الوصف
        ucData = {
          ...foundObject,
          desc: categoryDescription
        };
      } else {
        // لم نجدها، ننشئ كائناً جديداً
        ucData = {
          word: randomRelatedWord,
          emoji: "🤫",
          desc: categoryDescription
        };
      }
    } else {
      // احتياط
      const others = pool.filter(w => w.word !== state.secretData.word);
      if (others.length > 0) {
        ucData = {
          ...others[Math.floor(Math.random() * others.length)],
          desc: categoryDescription
        };
      }
    }
  }

  // احتياط نهائي للمموه
  if (!ucData) ucData = { word: "موضوع قريب", emoji: "🤫", desc: categoryDescription };

  state.currentUndercoverData = ucData;

  // 5. توزيع الأدوار (بدون تغيير)
  let ids = state.players.map(p => p.id).sort(() => 0.5 - Math.random());
  state.outPlayerIds = []; state.agentPlayerId = null; state.undercoverPlayerId = null; state.blindRoundType = null;

  if (state.blindModeActive && Math.random() < 0.95) {
    if (Math.random() < 0.5) state.blindRoundType = 'all_in';
    else { state.blindRoundType = 'all_out'; state.outPlayerIds = state.players.map(p => p.id); }
  } else {
    let outID = ids.splice(0, 1)[0];
    state.outPlayerIds = [outID];
    if (state.doubleAgentActive && ids.length > 0) state.agentPlayerId = ids.splice(0, 1)[0];
    if (state.undercoverActive && ids.length > 0) state.undercoverPlayerId = ids.splice(0, 1)[0];
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
  if (state.revealIndex >= state.players.length) return showScreen('game'), startTimer();
  const p = state.players[state.revealIndex];
  document.getElementById('reveal-player-name').innerText = `${p.avatar} ${p.name}`;
  const cardObj = document.getElementById('role-card');
  if (cardObj) cardObj.classList.remove('is-flipped');
  document.getElementById('btn-reveal-action').innerText = 'كشف الدور';
  populateCardBack(p);
  showScreen('reveal');
}

function populateCardBack(player) {
  const roleData = state.currentRoles.find(r => r.id === player.id);
  const txt = document.getElementById('reveal-role-text');
  const word = document.getElementById('reveal-secret-word');
  const img = document.getElementById('reveal-img-placeholder');
  const desc = document.getElementById('reveal-word-desc');

  // --- FIX: Ensure secretData exists ---
  if (!state.secretData) {
    // Emergency fallback
    state.secretData = { word: "خطأ", emoji: "⚠️", desc: "حدث خطأ في اختيار الكلمة", related: "خطأ" };
  }

  if (roleData.role === 'in') {
    txt.innerText = "أنت تعرف السالفة!";
    word.innerText = state.secretData.word;
    img.innerText = "🕵️‍♂️";
    //img.innerText = state.secretData.emoji; 
    desc.innerText = state.secretData.desc || "";
    txt.className = "text-xl font-bold mb-4 text-emerald-500";
  } else if (roleData.role === 'agent') {
    txt.innerText = "أنت العميل! احمِ الضايع:";
    word.innerText = state.secretData.word;
    img.innerText = "🎭";
    desc.innerText = state.secretData.desc || ""; // Show Desc for Double Agent
    txt.className = "text-xl font-bold mb-4 text-orange-500";
  } else if (roleData.role === 'undercover') {
    txt.innerText = "أنت المموه! كلمتك:";
    word.innerText = state.currentUndercoverData.word;
    img.innerText = "🤫";
    desc.innerText = state.currentUndercoverData.desc || "";
    txt.className = "text-xl font-bold mb-4 text-yellow-500";
  } else {
    txt.innerText = "أنت الضايع!"; word.innerText = "؟؟؟؟؟"; img.innerText = "😶‍🌫️"; desc.innerText = "؟؟؟؟؟";
    txt.className = "text-xl font-bold mb-4 text-red-500";
  }
}

// 2. الدالة الموحدة للكشف (تستخدمها البطاقة والزر)
function performRevealLogic() {
  const cardObj = document.getElementById('role-card');
  const btn = document.getElementById('btn-reveal-action');

  // الحالة 1: البطاقة مغلقة -> نريد كشف الدور (مع غليتش)
  if (!cardObj.classList.contains('is-flipped')) {

    triggerGlitchEffects(); // 🔥 تشغيل التأثيرات هنا 🔥

    cardObj.classList.add('is-flipped');
    if (btn) btn.innerText = "التالي";
  }

  // الحالة 2: البطاقة مكشوفة -> نريد الانتقال للاعب التالي (بدون غليتش)
  else {
    cardObj.classList.remove('is-flipped');
    if (btn) btn.innerText = "كشف الدور"; // إعادة النص للأصل

    // صوت قلب عادي عند الإغلاق (اختياري)
    if (sounds && sounds.flip) sounds.flip();

    // تأخير الانتقال قليلاً حتى تنقلب البطاقة
    setTimeout(() => {
      state.revealIndex++;
      startRevealSequence();
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

function toggleReveal() {
  const cardObj = document.getElementById('role-card');
  if (!cardObj.classList.contains('is-flipped')) {
    cardObj.classList.add('is-flipped'); sounds.flip();
    document.getElementById('btn-reveal-action').innerText = "التالي";
  } else {
    cardObj.classList.remove('is-flipped'); sounds.flip();
    setTimeout(() => { state.revealIndex++; startRevealSequence(); }, 300);
  }
}

function startTimer() {
  state.isPaused = false;
  clearInterval(state.interval);

  state.interval = setInterval(() => {
    if (state.isPaused) return;

    state.timer--;

    // --- تحديث شريط التقدم (كودك الأصلي) ---
    const circumference = 565.48;
    const progressEl = document.getElementById('timer-progress');
    if (progressEl) progressEl.style.strokeDashoffset = circumference * (1 - (state.timer / state.initialTimer));
    const m = Math.floor(state.timer / 60), s = state.timer % 60;
    document.getElementById('game-timer').innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

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
      gameScreen.classList.remove('panic-pulse-active'); // تنظيف
      startVoting();
    }
  }, 1000);
}

function pauseTimer() { state.isPaused = !state.isPaused; document.getElementById('btn-pause').innerText = state.isPaused ? "استئناف" : "إيقاف مؤقت"; }
function endGameEarly() { clearInterval(state.interval); startVoting(); }

function triggerPanic() {
  clearInterval(state.interval); state.panicMode = true;
  let name = "الضايع";
  if (state.blindRoundType === 'all_out') name = "الكل";
  else if (state.outPlayerIds.length > 0) {
    const p = state.players.find(x => x.id === state.outPlayerIds[0]);
    if (p) name = p.name;
  }
  startGuessingPhase(name, true);
}

function startVoting() {
  playVotingSound();
  state.voterIndex = 0; state.votesAccumulated = {};
  state.players.forEach(p => state.votesAccumulated[p.id] = 0);
  updateVotingGrid();
  showScreen('voting');
}

function updateVotingGrid() {
  const grid = document.getElementById('voting-grid'); grid.innerHTML = '';
  if (state.votingMode === 'individual') {
    const voter = state.players[state.voterIndex];
    document.getElementById('voter-indicator').innerText = `دور: ${voter.avatar} ${voter.name}`;
    document.getElementById('voter-indicator').classList.remove('hidden');
  } else {
    document.getElementById('voter-indicator').classList.add('hidden');
  }
  state.players.forEach(p => {
    if (state.votingMode === 'individual' && state.players[state.voterIndex].id === p.id) return;
    grid.innerHTML += `<button onclick="handleVoteClick(${p.id})" class="p-4 bg-white/5 border rounded-3xl flex flex-col items-center gap-2 active:bg-indigo-500/20 text-theme-main"><span class="text-4xl">${p.avatar}</span><span class="font-bold text-xs">${p.name}</span></button>`;
  });
}

function handleVoteClick(id) {
  if (state.votingMode === 'group') processVoteResult(id);
  else {
    state.votesAccumulated[id]++; state.voterIndex++; sounds.tick();
    if (state.voterIndex < state.players.length) updateVotingGrid();
    else {
      let maxV = -1, winnerId = null;
      for (const pid in state.votesAccumulated) {
        if (state.votesAccumulated[pid] > maxV) { maxV = state.votesAccumulated[pid]; winnerId = parseInt(pid); }
      }
      processVoteResult(winnerId);
    }
  }
}

function processVoteResult(id) {
  if (state.blindRoundType) {
    const p = state.players.find(x => x.id === id);
    sounds.funny();
    showFinalResults('blind_win', `مقلب! 🤣 ${p ? p.name : ''} بريء! ما كان فيه ضايع!`);
    return;
  }
  const isOut = state.outPlayerIds.includes(id);
  if (isOut) {
    // If Panic Button (Guessing) was allowed in setup, show guessing.
    if (state.guessingEnabled) {
      const p = state.players.find(x => x.id === id);
      startGuessingPhase(p ? p.name : null);
    } else showFinalResults('group_win', "كفو! صدتوا الضايع 😶‍🌫️");
  } else if (id === state.undercoverPlayerId) {
    showFinalResults('out_win', "المموه خدعكم! 🤫 فاز الضايع");
  } else {
    sounds.wrong();
    document.body.classList.add('wrong-flash-active');
    setTimeout(() => { document.body.classList.remove('wrong-flash-active'); showFinalResults('out_win', "خطأ! الضايع فاز 😈"); }, 600);
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
    let timeLeft = 30;
    timerEl.innerText = timeLeft;

    state.guessInterval = setInterval(() => {
      timeLeft--;
      timerEl.innerText = timeLeft;
      if (timeLeft <= 10 && timeLeft > 0) sounds.tick(); // تأكد من وجود دالة الصوت أو احذف السطر

      if (timeLeft <= 0) {
        clearInterval(state.guessInterval);
        showFinalResults('group_win', "انتهى الوقت! (عقاب مضاعف) ⏳");
      }
    }, 1000);
  } else {
    timerContainer.classList.add('hidden');
  }

  // تحديد مصفوفة الكلمات الحالية
  let pool = wordBank[state.currentRoundCategory] || wordBank["طعام"];

  // ============================================================
  // التعديل الجديد: اختيار الخيارات من قائمة related حصراً
  // ============================================================
  let distinctDistractors = [];

  // 1. التأكد من وجود قائمة related (التي تحتوي على 10 كلمات)
  if (state.secretData.related && Array.isArray(state.secretData.related)) {

    // ننسخ القائمة ونقوم بخلطها عشوائياً
    let shuffledRelated = [...state.secretData.related].sort(() => 0.5 - Math.random());

    // نأخذ أول 3 كلمات من القائمة المخلوطة
    let selectedStrings = shuffledRelated.slice(0, 3);

    // تحويل النصوص إلى كائنات (للبحث عن الإيموجي إذا كانت الكلمة موجودة في البنك)
    distinctDistractors = selectedStrings.map(str => {
      // محاولة العثور على الكلمة في البنك الكامل لجلب الإيموجي الخاص بها
      let foundObj = pool.find(p => p.word === str);

      if (foundObj) {
        return foundObj;
      } else {
        // إذا لم تكن الكلمة موجودة كعنصر رئيسي، نعيدها ككائن بسيط مع إيموجي افتراضي
        return { word: str, emoji: "" };
      }
    });
  }

  // 2. احتياط: إذا كان العدد أقل من 3 (لأي سبب)، نملأ الباقي عشوائياً من نفس الفئة
  if (distinctDistractors.length < 3) {
    let remainder = pool.filter(w => w.word !== state.secretData.word && !distinctDistractors.find(d => d.word === w.word));
    remainder = remainder.sort(() => 0.5 - Math.random());
    while (distinctDistractors.length < 3 && remainder.length > 0) {
      distinctDistractors.push(remainder.pop());
    }
  }

  // دمج الخيارات النهائية (3 خطأ + 1 صح)
  let options = [...distinctDistractors, state.secretData];

  // خلط أماكن الأزرار
  options = options.sort(() => 0.5 - Math.random());

  // عرض الأزرار
  options.forEach(opt => {
    container.innerHTML += `<button onclick="checkGuess('${opt.word}')" class="w-full py-5 options-bg rounded-3xl text-xl sm:text-2xl font-black active:bg-indigo-500/20 transition-all shadow-xl border-2 border-white/5 text-white break-word-custom text-center hover:scale-[1.02]">${opt.word}</button>`;
  });

  showScreen('guess');
}

function checkGuess(word) {
  if (state.guessInterval) clearInterval(state.guessInterval);
  if (word === state.secretData.word) {
    if (state.panicMode) showFinalResults('out_win', "تخمين أسطوري! (نقاط مضاعفة) 🔥");
    else showFinalResults('out_win', "تخمين صح! الضايع فاز 🧠");
  } else {
    showFinalResults('group_win', "تخمين خطأ! المحققون فازوا ⚖️");
  }
}

function showFinalResults(type, title) {
  state.lastWinner = type === 'group_win' ? 'group' : (type === 'blind_win' ? 'blind' : 'out');
  document.getElementById('final-result-title').innerText = title;
  document.getElementById('final-status-emoji').innerText = type === 'blind_win' ? '🤡' : (type === 'group_win' ? '🏆' : '😈');
  document.getElementById('final-secret-word').innerText = state.secretData.word;
  document.getElementById('final-word-emoji').innerText = state.secretData.emoji;
  document.getElementById('topic-description').innerText = state.secretData.desc || "";

  if (type === 'group_win') { sounds.win(); createConfetti(); }
  else if (type === 'blind_win') { createConfetti(true); }
  else sounds.lose();

  awardPoints(state.lastWinner);
  showScreen('final');
}

function awardPoints(winner) {
  let saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');

  const roleToStatKey = {
    'in': 'det',
    'out': 'out',
    'agent': 'agt',
    'undercover': 'und'
  };

  saved = saved.map((p) => {
    const roleData = state.currentRoles.find(r => r.id === p.id);
    if (!roleData) return p;

    // تهيئة الإحصائيات إذا لم تكن موجودة
    if (!p.stats) p.stats = { det: { w: 0, l: 0 }, out: { w: 0, l: 0 }, agt: { w: 0, l: 0 }, und: { w: 0, l: 0 } };

    const statKey = roleToStatKey[roleData.role];
    const isOutSide = (roleData.role === 'out' || roleData.role === 'agent' || roleData.role === 'undercover');

    if (winner === 'blind') {
      p.points += 1;
      if (statKey && p.stats[statKey]) {
        p.stats[statKey].w++;
      }
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
        let pts = 2;
        if (roleData.role === 'out' && state.panicMode) pts = 4;
        p.points += pts;

        if (statKey) p.stats[statKey].w++;
      }
      else {
        p.stats.det.l++;
      }
    }
    return p;
  });
  localStorage.setItem('out_loop_tablet_v4_players', JSON.stringify(saved));
  state.players = saved;
}

function updateFinalResultsUI() {
  const list = document.getElementById('final-leaderboard');
  if (!list) return; list.innerHTML = '';
  state.players.forEach(p => {
    const roleData = state.currentRoles.find(r => r.id === p.id);
    if (!roleData) return;
    let didWin = false;
    const isOutSide = ['out', 'agent', 'undercover'].includes(roleData.role);
    if (state.lastWinner === 'group' && !isOutSide) didWin = true;
    if ((state.lastWinner === 'out') && isOutSide) didWin = true;
    if (state.lastWinner === 'blind') didWin = true;

    const colorClass = didWin ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500' : 'bg-red-500/20 border-red-500/40 text-red-500';
    list.innerHTML += `<div class="flex items-center justify-between p-3 rounded-2xl border ${colorClass} mb-2 shadow-inner text-right"><div class="flex items-center gap-3"><span class="text-2xl">${p.avatar}</span><div class="text-right"><p class="font-black text-theme-main text-sm text-right">${p.name}</p><p class="text-[9px] uppercase opacity-60 text-theme-main text-right">${roleNamesMap[roleData.role]}</p></div></div><span class="font-mono text-xs font-black text-theme-main">${p.points}</span></div>`;
  });
}

function updateLeaderboardUI() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  const sorted = [...saved].sort((a, b) => b.points - a.points);
  list.innerHTML = '';
  sorted.forEach((p, idx) => {
    const title = funnyTitles[Math.min(Math.floor(p.points / 3), 4)];
    list.innerHTML += `<div onclick="openStatsModal(${p.id})" class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border hover:bg-white/10 cursor-pointer text-right"><div class="flex items-center gap-4 text-right"><span class="text-3xl">${p.avatar}</span><div class="text-right"><p class="font-black text-theme-main text-right">${p.name}</p><p class="text-[10px] text-indigo-400 font-bold text-right">${title}</p></div></div><span class="bg-indigo-500/20 px-3 py-1 rounded-full font-mono text-sm font-black">${p.points}</span></div>`;
  });
}

function openStatsModal(id) {
  const saved = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  const p = saved[id];
  if (!p) return;

  document.getElementById('player-stat-avatar').innerText = p.avatar;
  document.getElementById('player-stat-name').innerText = p.name;
  document.getElementById('stat-total-points').innerText = p.points;

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
  state.timer = state.initialTimer;
  setupRoles();
  state.revealIndex = 0;
  state.panicMode = false;
  startRevealSequence();
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
  container.innerHTML = '';
  const colors = ['#6366f1', '#10b981', '#ef4444', '#fbbf24', '#f472b6'];
  const clowns = ['🤡', '🤣', '🤪', '😜', '🙈'];
  const count = isClown ? 100 : 100;
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
  setTimeout(() => { container.innerHTML = ''; }, 5000);
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
const defaultPunishments = [];

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

  // بما أن المؤشر في الأعلى (90 درجة) والعجلة تدور عكس عقارب الساعة
  // نحتاج لحساب المؤشر بناءً على الدوران المعاكس
  // المعادلة: (index) = floor(((rotation + 90) % 360) / sliceDeg)
  // ملاحظة: بما أننا نستخدم rotate سالب في الـ CSS، المعادلة تكون كالتالي:

  let index = Math.floor(((actualRotation + 90) % 360) / sliceDeg);

  // لأن الرسم يبدأ من 0 (اليمين) ويدور باتجاه عقارب الساعة، والمؤشر ثابت في الأعلى
  // الحساب يحتاج لضبط ليتوافق مع الـ Canvas Arc
  index = (total - Math.floor(((actualRotation + 90) % 360) / sliceDeg)) % total;

  // تصحيح أخير لضمان الدقة
  const winningPunishment = punishments[index];

  document.getElementById('result-text').innerText = winningPunishment;
  document.getElementById('punishment-result').classList.remove('hidden');
  triggerVibrate([50, 50, 200]);
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
}

window.addEventListener('DOMContentLoaded', () => {
  // Initialize default selected categories (e.g. none)
  state.allowedCategories = []; // User must select
  updateSetupInfo();
  renderCustomWords();
  startHeroEmojiAnimation();
});