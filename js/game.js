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
function formatTimeLabel(s) { const m = Math.floor(s / 60); const sc = s % 60; return sc === 0 ? `${m} دقائق` : `${m} دقيقة و${sc} ثانية`; }
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

let state = {
  players: [], currentRoles: [], secretData: null, timer: 60, initialTimer: 60, interval: null,
  revealIndex: 0, isPaused: false, doubleAgentActive: false, undercoverActive: false, guessingEnabled: false,
  outPlayerIds: [], agentPlayerId: null, undercoverPlayerId: null, selectedCategory: "عشوائي",
  allowedCategories: [], // الفئات التي اختارها اللاعب
  customWords: [], lastWinner: null, votingMode: 'group', voterIndex: 0, votesAccumulated: {}, panicMode: false,
  smartDistractors: true, blindModeActive: false, blindRoundType: null, guessInterval: null, panicModeAllowed: false
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

// --- NEW: Render Quick Category Selection ---
function renderQuickCategorySelection(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return; grid.innerHTML = '';

  // Random Option
  grid.innerHTML += `<div onclick="selectCategory('عشوائي', '${gridId}')" class="category-card ${state.selectedCategory === 'عشوائي' ? 'active' : ''}"><span>🎲</span><span class="text-xs">عشوائي</span></div>`;

  // Allowed Categories
  state.allowedCategories.forEach(cat => {
    // Check if it's "Custom Words"
    if (cat === "كلمات خاصة") {
      // Only show "Custom Words" in Quick Select if there are enough words
      if (state.customWords.length >= 4) {
        const isActive = state.selectedCategory === 'كلمات خاصة';
        grid.innerHTML += `<div onclick="selectCategory('كلمات خاصة', '${gridId}')" class="category-card ${isActive ? 'active' : ''}"><span>✏️</span><span class="text-xs font-bold">كلمات خاصة</span></div>`;
      }
    } else if (wordBank[cat]) {
      const icon = wordBank[cat][0].emoji;
      const isActive = state.selectedCategory === cat;
      grid.innerHTML += `<div onclick="selectCategory('${cat}', '${gridId}')" class="category-card ${isActive ? 'active' : ''}"><span>${icon}</span><span class="text-xs font-bold">${cat}</span></div>`;
    }
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

    cats.forEach(cat => {
      // Special handling for "Custom Words" or existing categories
      if (wordBank[cat] || cat === "كلمات خاصة") {
        const isSelected = state.allowedCategories.includes(cat);
        const emoji = (cat === "كلمات خاصة") ? "✏️" : wordBank[cat][0].emoji;

        subGrid.innerHTML += `
                            <div onclick="toggleCategorySelection('${cat}')" class="category-card ${isSelected ? 'selected active' : ''}">
                                <div class="check-badge">✓</div>
                                <span class="text-2xl">${emoji}</span>
                                <span class="text-xs font-bold">${cat}</span>
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
  if (!grid) return; grid.innerHTML = '';

  // Random Option (Default & First)
  grid.innerHTML += `<div onclick="selectCategory('عشوائي', 'active-category-grid')" class="category-card ${state.selectedCategory === 'عشوائي' ? 'active' : ''}"><span>🎲</span><span class="text-xs">عشوائي</span></div>`;

  // Render Selected Categories
  state.allowedCategories.forEach(cat => {
    const emoji = (cat === "كلمات خاصة") ? "✏️" : wordBank[cat][0].emoji;
    grid.innerHTML += `<div onclick="selectCategory('${cat}', 'active-category-grid')" class="category-card ${state.selectedCategory === cat ? 'active' : ''}"><span>${emoji}</span><span class="text-xs font-bold">${cat}</span></div>`;
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
  state.players = [];
  const savedData = JSON.parse(localStorage.getItem('out_loop_tablet_v4_players') || '[]');
  for (let i = 0; i < count; i++) {
    const nameInp = document.getElementById(`name-${i}`);
    const name = nameInp ? nameInp.value.trim() : `لاعب ${i + 1}`;
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
  // Ensure Custom Words are synced before starting
  if (state.customWords.length > 0) {
    wordBank["كلمات خاصة"] = state.customWords;
  }

  let cat = state.selectedCategory;

  // Logic for Random selection
  if (cat === "عشوائي") {
    let pool = [...state.allowedCategories];
    // Add custom words if enough exist
    if (state.customWords.length >= 4) {
      pool.push("كلمات خاصة");
      wordBank["كلمات خاصة"] = state.customWords;
    }

    // Fallback to avoid empty pool
    if (pool.length === 0) pool = ["طعام"];

    cat = pool[Math.floor(Math.random() * pool.length)];
  }

  state.currentRoundCategory = cat;
  let pool = wordBank[cat] || wordBank["طعام"]; // Safety fallback

  // --- FIX: Check if pool is valid/empty to prevent crash ---
  if (!pool || pool.length === 0) {
    // Fallback if selected category is empty (e.g. Custom Words without words)
    cat = "طعام";
    state.currentRoundCategory = cat;
    pool = wordBank["طعام"];
  }

  state.secretData = pool[Math.floor(Math.random() * pool.length)];

  // NEW: Define Undercover Word Logic here (Fix for "related story" issue)
  let undercoverWord = "";
  let undercoverObj = null;

  if (cat === "كلمات خاصة") {
    // For custom words, pick a different random word from the pool
    const otherWords = pool.filter(w => w.word !== state.secretData.word);
    if (otherWords.length > 0) {
      undercoverObj = otherWords[Math.floor(Math.random() * otherWords.length)];
    }
  } else {
    // For standard categories, use the 'related' field
    const relatedName = state.secretData.related;
    if (relatedName) {
      undercoverObj = pool.find(w => w.word === relatedName);
    }
    // Fallback if related not found
    if (!undercoverObj) {
      const otherWords = pool.filter(w => w.word !== state.secretData.word);
      if (otherWords.length > 0) undercoverObj = otherWords[Math.floor(Math.random() * otherWords.length)];
    }
  }

  // Final fallback
  if (!undercoverObj) undercoverObj = { word: "سالفة قريبة", emoji: "🤫", desc: "حاول مجاراة الحديث بذكاء" };

  state.currentUndercoverData = undercoverObj;

  let ids = state.players.map(p => p.id).sort(() => 0.5 - Math.random());
  state.outPlayerIds = []; state.agentPlayerId = null; state.undercoverPlayerId = null; state.blindRoundType = null;

  if (state.blindModeActive && Math.random() < 0.25) { // 25% chance for blind round
    if (Math.random() < 0.20) state.blindRoundType = 'all_in'; // No outsider
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
      if (p.id === (state.outPlayerIds[0])) role = 'out';
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
    txt.innerText = "أنت تعرف السالفة!"; word.innerText = state.secretData.word;
    img.innerText = state.secretData.emoji; desc.innerText = state.secretData.desc || "";
    txt.className = "text-xl font-bold mb-4 text-emerald-500";
  } else if (roleData.role === 'agent') {
    txt.innerText = "أنت العميل! احمِ الضايع:"; word.innerText = state.secretData.word;
    img.innerText = "🎭"; desc.innerText = state.secretData.desc || ""; // Show Desc for Double Agent
    txt.className = "text-xl font-bold mb-4 text-orange-500";
  } else if (roleData.role === 'undercover') {
    txt.innerText = "أنت المموه! كلمتك:";
    word.innerText = state.currentUndercoverData.word;
    img.innerText = state.currentUndercoverData.emoji;
    desc.innerText = state.currentUndercoverData.desc || "";
    txt.className = "text-xl font-bold mb-4 text-yellow-500";
  } else {
    txt.innerText = "أنت الضايع!"; word.innerText = "؟؟؟؟؟"; img.innerText = "🕵️‍♂️"; desc.innerText = "؟؟؟؟؟";
    txt.className = "text-xl font-bold mb-4 text-red-500";
  }
}

function flipCard() {
  const cardObj = document.getElementById('role-card');
  if (!cardObj.classList.contains('is-flipped')) {
    cardObj.classList.add('is-flipped'); sounds.flip();
    document.getElementById('btn-reveal-action').innerText = "التالي";
  }
}

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
  state.isPaused = false; clearInterval(state.interval);
  state.interval = setInterval(() => {
    if (state.isPaused) return;
    state.timer--;
    const circumference = 565.48;
    const progressEl = document.getElementById('timer-progress');
    if (progressEl) progressEl.style.strokeDashoffset = circumference * (1 - (state.timer / state.initialTimer));
    const m = Math.floor(state.timer / 60), s = state.timer % 60;
    document.getElementById('game-timer').innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    if (state.timer <= 5 && state.timer > 0) sounds.tick();
    if (state.timer <= 0) { clearInterval(state.interval); startVoting(); }
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
  state.voterIndex = 0; state.votesAccumulated = {};
  state.players.forEach(p => state.votesAccumulated[p.id] = 0);
  updateVotingGrid(); showScreen('voting');
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
    } else showFinalResults('group_win', "كفو! صدتوا الضايع 🕵️‍♂️");
  } else if (id === state.undercoverPlayerId) {
    showFinalResults('out_win', "المموه خدعكم! 🤫 فاز الضايع");
  } else {
    sounds.wrong();
    document.body.classList.add('wrong-flash-active');
    setTimeout(() => { document.body.classList.remove('wrong-flash-active'); showFinalResults('out_win', "خطأ! الضايع فاز 😈"); }, 600);
  }
}

function startGuessingPhase(name, isPanic = false) {
  const container = document.getElementById('guess-options'); container.innerHTML = '';
  const titleEl = document.getElementById('guess-title');
  if (isPanic) {
    titleEl.innerText = "🚨 تخمين الهلع!";
    titleEl.className = "text-2xl font-black mb-6 text-orange-500";
  } else {
    titleEl.innerText = `فرصة أخيرة يا ${name || 'ضايع'}!`;
    titleEl.className = "text-xl font-black mb-4 text-red-500";
  }

  // Timer logic for panic/guess
  if (state.guessInterval) clearInterval(state.guessInterval);
  if (isPanic) {
    document.getElementById('guess-timer-container').classList.remove('hidden');
    let t = 30; document.getElementById('guess-timer').innerText = t;
    state.guessInterval = setInterval(() => {
      t--; document.getElementById('guess-timer').innerText = t;
      if (t <= 5) sounds.tick();
      if (t <= 0) { clearInterval(state.guessInterval); showFinalResults('group_win', "انتهى الوقت! ⏳"); }
    }, 1000);
  } else document.getElementById('guess-timer-container').classList.add('hidden');

  let pool = wordBank[state.currentRoundCategory] || wordBank["طعام"];
  let distractors = pool.filter(w => w.word !== state.secretData.word).sort(() => 0.5 - Math.random()).slice(0, 3);
  let options = [...distractors, state.secretData].sort(() => 0.5 - Math.random());

  options.forEach(opt => {
    container.innerHTML += `<button onclick="checkGuess('${opt.word}')" class="w-full py-4 bg-white/5 rounded-2xl text-lg font-bold border text-theme-main">${opt.word}</button>`;
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
    list.innerHTML += `<div class="flex items-center justify-between p-3 rounded-2xl border ${colorClass} mb-2 shadow-inner text-right"><div class="flex items-center gap-3"><span class="text-2xl">${p.avatar}</span><div class="text-right"><p class="font-black text-theme-main text-sm text-right">${p.name}</p><p class="text-[8px] uppercase opacity-60 text-theme-main text-right">${roleNamesMap[roleData.role]}</p></div></div><span class="font-mono text-xs font-black text-theme-main">${p.points}</span></div>`;
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
    list.innerHTML += `<div onclick="openStatsModal(${p.id})" class="flex items-center justify-between p-4 bg-white/5 rounded-2xl border hover:bg-white/10 cursor-pointer text-right"><div class="flex items-center gap-4 text-right"><span class="text-3xl">${p.avatar}</span><div class="text-right"><p class="font-black text-theme-main text-right">${p.name}</p><p class="text-[10px] text-indigo-400 font-bold text-right">${title}</p></div></div><span class="bg-indigo-500/20 px-3 py-1 rounded-full font-mono text-sm font-black text-indigo-200">${p.points}</span></div>`;
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
  const clowns = ['🤡', '🤣', '🤪', '🎪', '🙈'];
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

window.addEventListener('DOMContentLoaded', () => {
  // Initialize default selected categories (e.g. none)
  state.allowedCategories = []; // User must select
  updateSetupInfo();
  renderCustomWords();
});