/* ============================================
   UNT STUDY AI – Application Logic
   Firebase-powered backend integration
   ============================================ */

'use strict';

// ============================================================
//  FIREBASE IMPORTS
// ============================================================
import {
  AuthService,
  ProgressService,
  NotesService,
  FlashcardsService,
  AIService,
  AIContentService
} from './firebase-config.js';
import { initI18n, setLanguage, t, getCurrentLang } from './i18n.js';

// Init i18n
window.i18n = {
  setLanguage: setLanguage,
  t: t,
  get currentLang() { return getCurrentLang(); }
};
initI18n();


// ============================================================
// GLOBAL STATE
// ============================================================
let userState = {
  name: 'Aibek K.',
  initials: 'АК',
  xp: 2340,
  level: 7,
  streak: 12,
  subjectProgress: { math: 72, cs: 55, history: 40, biology: 25, physics: 18 }
};

let loadedNotes       = [];
let loadedFlashcards  = [];

// ============================================================
// ONBOARDING
// ============================================================
let currentSlide = 0;
const totalSlides = 4;

function showSlide(n) {
  document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
  document.getElementById('slide-' + n).classList.add('active');
  document.querySelectorAll('.dot')[n].classList.add('active');
  const nextBtn = document.getElementById('onboarding-next');
  nextBtn.textContent = n === totalSlides - 1 ? '🚀 Start Learning!' : 'Next →';
}

document.getElementById('onboarding-next').addEventListener('click', () => {
  if (currentSlide < totalSlides - 1) {
    currentSlide++;
    showSlide(currentSlide);
  } else {
    launchApp();
  }
});

document.getElementById('onboarding-skip').addEventListener('click', launchApp);

document.querySelectorAll('.dot').forEach(dot => {
  dot.addEventListener('click', () => {
    currentSlide = parseInt(dot.dataset.target);
    showSlide(currentSlide);
  });
});

// Configure ENT Subjects selection
const mandatorySubjects = ['kazHistory', 'mathLiteracy', 'readingLiteracy'];
let profileSubjects = [];

document.querySelectorAll('.subj-chip:not(.locked)').forEach(chip => {
  chip.addEventListener('click', () => {
    const subj = chip.dataset.subj;
    if (profileSubjects.includes(subj)) {
      profileSubjects = profileSubjects.filter(s => s !== subj);
      chip.classList.remove('selected');
    } else {
      if (profileSubjects.length >= 2) return; // Max 2
      profileSubjects.push(subj);
      chip.classList.add('selected');
    }
    document.getElementById('ent-count').textContent = `${profileSubjects.length} / 2 selected`;
    document.getElementById('onboarding-next').disabled = profileSubjects.length !== 2 && currentSlide === 3;
    document.getElementById('onboarding-next').style.opacity = (profileSubjects.length !== 2 && currentSlide === 3) ? '0.5' : '1';
  });
});

// Auth UI Toggle
window.toggleAuthMode = () => {
  const login = document.getElementById('auth-login');
  const reg   = document.getElementById('auth-register');
  if (login.style.display === 'none') {
    login.style.display = 'flex'; reg.style.display = 'none';
  } else {
    login.style.display = 'none'; reg.style.display = 'flex';
  }
};

async function launchApp() {
  const overlay = document.getElementById('onboarding');
  overlay.style.opacity = '0';
  overlay.style.pointerEvents = 'none';

  // Save subject selection to user profile
  const allSubj = [...mandatorySubjects, ...profileSubjects];
  await AuthService.updateProfile({ selectedSubjects: allSubj });
  
  setTimeout(async () => {
    overlay.style.display  = 'none';
    const shell = document.getElementById('app-shell');
    shell.style.display    = 'flex';
    shell.style.opacity    = '0';
    shell.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => { shell.style.opacity = '1'; });

    await initUserData();
    initCharts();
    renderMindmap();
    initAudioPlayer();
    await loadNotesFromDB();
    await loadFlashcardsFromDB();
    ProgressService.checkStreak().catch(() => {});
  }, 350);
}

// ============================================================
// APP LAUNCH & ONBOARDING CHECK
// ============================================================
let isFirstAuthCheck = true;
AuthService.onStateChange(async (user) => {
  if (user) {
    // Check if new user needing onboarding
    const profile = await AuthService.getProfile();
    if (profile) {
      if (profile.selectedLanguage) i18n.setLanguage(profile.selectedLanguage);
      if (!profile.selectedSubjects || profile.selectedSubjects.length === 0) {
        document.getElementById('onboarding').classList.add('active');
        document.getElementById('onboarding').style.display = 'flex';
      } else {
        document.getElementById('onboarding').classList.remove('active');
        document.getElementById('onboarding').style.display = 'none';
        if (isFirstAuthCheck) launchApp();
      }
    } else {
      // First time user (no profile in Firestore yet)
      document.getElementById('onboarding').classList.add('active');
      document.getElementById('onboarding').style.display = 'flex';
    }
  }
  isFirstAuthCheck = false;
});

window.handleLogout = async () => {
  localStorage.removeItem('enthelper_uid');
  window.location.reload();
};

window.handleLogout = async () => {
  await AuthService.logout();
  window.location.reload();
};

// ============================================================
// USER DATA – Firebase RTDB
// ============================================================
async function initUserData() {
  try {
    userState = await ProgressService.load();
    updateUserUI();
  } catch (e) {
    console.warn('Firebase load failed, using defaults:', e);
    updateUserUI();
  }
}

function updateUserUI() {
  // Sidebar user card
  const nameEl = document.querySelector('.user-name');
  if (nameEl) nameEl.textContent = userState.name || 'Aibek K.';

  const levelBadge = document.querySelector('.level-badge');
  if (levelBadge) levelBadge.textContent = `Lv.${userState.level || 7}`;

  const xpText = document.querySelector('.xp-text');
  if (xpText) xpText.textContent = `${(userState.xp || 2340).toLocaleString()} XP`;

  const streakCount = document.querySelector('.streak-count');
  if (streakCount) streakCount.textContent = `${userState.streak || 12} day streak!`;

  // XP bar
  const xpFill = document.querySelector('.xp-fill');
  if (xpFill) {
    const xpInLevel = (userState.xp || 2340) % 3000;
    xpFill.style.width = `${Math.round(xpInLevel / 3000 * 100)}%`;
  }
  const xpBarLabel = document.querySelector('.xp-bar-label');
  if (xpBarLabel) {
    const xpInLevel = (userState.xp || 2340) % 3000;
    xpBarLabel.innerHTML = `<span>Level ${userState.level || 7}</span><span>${(userState.xp||2340).toLocaleString()} / ${((userState.level||7) * 3000).toLocaleString()} XP</span>`;
  }

  // Dashboard countdown (days to UNT 2026 June 4)
  const untDate = new Date('2026-06-04');
  const today   = new Date();
  const daysLeft = Math.max(0, Math.round((untDate - today) / 86400000));
  const countEl  = document.querySelector('.countdown-big');
  if (countEl) countEl.textContent = daysLeft;

  // Dashboard greeting
  const h1 = document.querySelector('#page-dashboard .page-header h1');
  if (h1) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    h1.textContent = `${greeting}, ${(userState.name || 'Aibek').split(' ')[0]}! 👋`;
  }

  loadDashboardData();
}

async function loadDashboardData() {
  // 1. Render Selected Subjects
  const grid = document.getElementById('dashboard-subjects-grid');
  if (grid) {
    const profile = await AuthService.getProfile();
    const subjects = profile?.selectedSubjects || ['mathLiteracy', 'kazHistory', 'readingLiteracy', 'mathematics', 'physics'];
    
    const subjMeta = {
      kazHistory:      { label: 'History of Kazakhstan', icon: '🏛️', color: 'linear-gradient(135deg,#f093fb,#f5576c)', sub: 'Independence & Modern Era' },
      mathLiteracy:    { label: 'Math Literacy',       icon: '📐', color: 'linear-gradient(135deg,#667eea,#764ba2)', sub: 'Basic equations & logic' },
      readingLiteracy: { label: 'Reading Literacy',    icon: '📖', color: 'linear-gradient(135deg,#4facfe,#00f2fe)', sub: 'Reading comprehension' },
      mathematics:     { label: 'Mathematics',         icon: '📊', color: 'linear-gradient(135deg,#667eea,#764ba2)', sub: 'Algebra & Geometry' },
      physics:         { label: 'Physics',             icon: '⚡', color: 'linear-gradient(135deg,#4facfe,#00f2fe)', sub: 'Mechanics & Thermodynamics' },
      biology:         { label: 'Biology',             icon: '🌿', color: 'linear-gradient(135deg,#43e97b,#38f9d7)', sub: 'Cell Biology & Genetics' },
      chemistry:       { label: 'Chemistry',           icon: '🧪', color: 'linear-gradient(135deg,#00d2ff,#3a7bd5)', sub: 'Organic & Inorganic' },
      geography:       { label: 'Geography',           icon: '🌍', color: 'linear-gradient(135deg,#11998e,#38ef7d)', sub: 'Physical Geography' },
      english:         { label: 'English',             icon: '🇬🇧', color: 'linear-gradient(135deg,#f857a6,#ff5858)', sub: 'Grammar & Vocabulary' },
      worldHistory:    { label: 'World History',       icon: '🌐', color: 'linear-gradient(135deg,#a18cd1,#fbc2eb)', sub: 'Ancient to Modern' },
      informatics:     { label: 'Informatics',         icon: '💻', color: 'linear-gradient(135deg,#84fab0,#8fd3f4)', sub: 'Algorithms & Logic' }
    };

    grid.innerHTML = subjects.map(s => {
      const meta = subjMeta[s] || { label: s, icon: '📚', color: '#444', sub: 'Study material' };
      const pct  = userState.subjectProgress?.[s] || Math.floor(Math.random() * 40 + 10);
      return `
        <div class="continue-card" data-page="notes" onclick="navigateTo('notes')">
          <div class="cc-icon" style="background:${meta.color}">${meta.icon}</div>
          <div class="cc-info">
            <div class="cc-title">${meta.label}</div>
            <div class="cc-sub">${meta.sub}</div>
            <div class="cc-bar"><div style="width:${pct}%"></div></div>
            <div class="cc-pct">${pct}% complete</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 2. Render Recent Activity from AI Content
  const activityList = document.getElementById('recent-activity-list');
  if (activityList) {
    const loader = document.getElementById('dashboard-activity-loader');
    const empty  = document.getElementById('dashboard-activity-empty');
    if(loader) loader.style.display = 'inline-block';
    if(empty) empty.style.display = 'none';

    try {
      const recent = await AIContentService.getRecent(4);
      if (recent && recent.length > 0) {
        activityList.innerHTML = recent.map(r => {
          let icon = '✨'; let xp = 10;
          if(r.type === 'note') { icon = '📝'; xp = 80; }
          if(r.type === 'summary') { icon = '⚡'; xp = 30; }
          if(r.type === 'test') { icon = '📋'; xp = 100; }
          if(r.type === 'audio') { icon = '🎧'; xp = 20; }
          
          return `
            <div class="goal-item done">
              <div class="goal-check">${icon}</div>
              <div class="goal-text" style="text-transform:capitalize">Generated ${r.type} for ${r.subject}</div>
              <div class="goal-xp">+${xp} XP</div>
            </div>
          `;
        }).join('');
      } else {
        activityList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:0.9rem">No AI activity yet. Create some notes!</div>`;
      }
    } catch (e) {
      console.warn('Could not load AI activity feed:', e);
      activityList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text3);font-size:0.9rem">Failed to load activity.</div>`;
    }
  }
}


async function earnXP(amount, label) {
  showXpToast(`+${amount} XP 🎉`);
  try {
    const updated = await ProgressService.addXp(amount);
    userState = { ...userState, ...updated };
    updateUserUI();
  } catch (e) {
    // Offline – update local only
    userState.xp     += amount;
    userState.level   = Math.floor(userState.xp / 3000) + 1;
    updateUserUI();
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPage = document.getElementById('page-' + page);
  const targetNav  = document.querySelector('.nav-item[data-page="' + page + '"]');
  if (targetPage) targetPage.classList.add('active');
  if (targetNav)  targetNav.classList.add('active');

  if (page === 'progress') initProgressCharts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

document.querySelectorAll('[data-page]').forEach(el => {
  if (!el.classList.contains('nav-item')) {
    el.addEventListener('click', e => {
      const pg = el.dataset.page;
      if (pg) { e.preventDefault(); navigateTo(pg); }
    });
  }
});

document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// ============================================================
// TABS (Notes & Cards)
// ============================================================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const parent = tab.closest('.notes-right') || tab.closest('.page');
    parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById(tab.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// ============================================================
// NOTES – Load from Firestore
// ============================================================
const TAG_LABELS = { math:'Math', cs:'CS', history:'History', biology:'Biology', physics:'Physics', chemistry:'Chemistry', literature:'Literature', geography:'Geography' };

async function loadNotesFromDB() {
  try {
    loadedNotes = await NotesService.getAll();
    const noteList = document.getElementById('note-list');
    if (!noteList) return;

    // Keep the 3 default sample notes at bottom, prepend DB notes
    loadedNotes.forEach(note => {
      if (!document.getElementById('note-' + note.id)) {
        const el = createNoteElement(note);
        el.id    = 'note-' + note.id;
        noteList.prepend(el);
      }
    });
  } catch (e) {
    console.warn('Could not load notes from Firestore:', e);
  }
}

function createNoteElement(note) {
  const el = document.createElement('div');
  el.className = 'note-item';
  el.innerHTML = `
    <div class="note-item-header">
      <span class="note-tag ${note.subject}">${TAG_LABELS[note.subject] || note.subject}</span>
      <span class="note-date">${formatDate(note.createdAt)}</span>
    </div>
    <h4>${escHtml(note.title)}</h4>
    <p>${escHtml(note.body)}</p>
    <div class="note-actions">
      <button class="tiny-btn" onclick="makeCardsFromNote('${note.id}','${escAttr(note.subject)}','${escAttr(note.title)}','${escAttr(note.body)}')">🃏 Make Cards</button>
      <button class="tiny-btn">🔊 Listen</button>
      <button class="tiny-btn" onclick="quizFromNote('${escAttr(note.subject)}')">📋 Quiz</button>
      <button class="tiny-btn danger-btn" onclick="deleteNote('${note.id}')">🗑️</button>
    </div>`;
  return el;
}

async function deleteNote(id) {
  try {
    await NotesService.delete(id);
    const el = document.getElementById('note-' + id);
    if (el) el.remove();
    showToast('🗑️ Note deleted', true);
  } catch (e) {
    showToast('⚠️ Could not delete note', false);
  }
}

function quizFromNote(subject) {
  navigateTo('tests');
  // Pre-select the subject in test config
  setTimeout(() => {
    document.querySelectorAll(`[data-config="subject"]`).forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-config="subject"][data-val="${subject}"]`);
    if (btn) btn.classList.add('active');
  }, 200);
}

// ============================================================
// AI CONTENT GENERATION – Gemini via Firebase
// ============================================================
async function generateContent() {
  const input = document.getElementById('paste-input').value.trim();
  if (!input) { showToast('⚠️ Please paste some study material first!', false); return; }

  const loader  = document.getElementById('ai-loader');
  const genBtn  = document.getElementById('generate-btn');
  genBtn.disabled = true;
  loader.style.display = 'block';

  try {
    // 1. Generate note with Gemini AI
    let note;
    try {
      note = await AIService.generateNote(input);
    } catch (aiErr) {
      console.warn('Gemini error, using local fallback:', aiErr);
      // Fallback: create a basic note from the pasted text
      note = {
        subject: 'cs',
        title:   input.split(/[.!?\n]/)[0].slice(0, 60) || 'Study Note',
        body:    input.slice(0, 400)
      };
    }

    // 2. Save to Firestore
    let savedId = null;
    try {
      savedId = await NotesService.save(note);
    } catch (dbErr) {
      console.warn('Firestore save error:', dbErr);
    }

    // 3. Render in UI
    const noteList = document.getElementById('note-list');
    const el       = createNoteElement({
      ...note,
      id:        savedId || ('local-' + Date.now()),
      createdAt: null
    });
    el.id    = 'note-' + (savedId || Date.now());
    el.style.animation = 'slideUp 0.4s ease';
    noteList.prepend(el);

    await earnXP(80);
    document.getElementById('paste-input').value = '';
    showToast('✨ Note generated and saved!', true);

  } catch (e) {
    showToast('⚠️ Generation failed. Check console.', false);
    console.error(e);
  } finally {
    loader.style.display = 'none';
    genBtn.disabled      = false;
  }
}

// Make generateContent globally available (called from HTML onclick)
window.generateContent = generateContent;

// ============================================================
// AI SUMMARY GENERATION – Gemini
// ============================================================
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

async function generateSummary() {
  const text    = document.getElementById('summary-input').value.trim();
  const mode    = document.querySelector('.mode-btn.active')?.dataset?.mode || 'short';

  if (!text) { showToast('⚠️ Please enter text to summarize!', false); return; }

  const out = document.getElementById('summary-output');
  out.style.opacity = '0.4';

  // Spinner placeholder
  out.innerHTML = `<div class="summary-badge">🤖 AI is generating…</div>
    <div class="ai-pulse" style="margin:1rem 0">Analyzing content with Gemini AI…</div>
    <div class="progress-bar"><div class="progress-fill"></div></div>`;

  try {
    let result;
    try {
      result = await AIService.generateSummary(text, mode);
    } catch (aiErr) {
      console.warn('Gemini summary error:', aiErr);
      // Fallback static
      result = {
        badge: '✨ AI Generated · Short Mode',
        title: 'Summary',
        body:  text.slice(0, 300) + (text.length > 300 ? '…' : ''),
        concepts: []
      };
    }

    out.innerHTML = `
      <div class="summary-badge">${result.badge}</div>
      <h3>${escHtml(result.title)}</h3>
      <p>${result.body}</p>
      <div class="summary-actions">
        <button class="tiny-btn" onclick="navigateTo('audio')">🔊 Listen to Summary</button>
        <button class="tiny-btn">🃏 Make Flashcards</button>
        <button class="tiny-btn">📋 Create Quiz</button>
        <button class="tiny-btn" onclick="navigator.clipboard.writeText(document.querySelector('#summary-output p').textContent)">📄 Copy Text</button>
      </div>`;

    // Key concepts
    const conceptsCard = document.querySelector('.key-concepts-card');
    if (conceptsCard && result.concepts?.length) {
      conceptsCard.querySelector('.concepts-list').innerHTML =
        result.concepts.map(c => `<span class="concept-tag">${escHtml(c)}</span>`).join('');
    }

    out.style.transition = 'opacity 0.3s ease';
    out.style.opacity    = '1';
    await earnXP(30);

  } catch (e) {
    out.innerHTML = `<div class="summary-badge" style="color:var(--danger)">⚠️ Error</div><p>Could not generate summary. Please try again.</p>`;
    out.style.opacity = '1';
    console.error(e);
  }
}

window.generateSummary = generateSummary;

// ============================================================
// FLASHCARDS – Firestore
// ============================================================
async function loadFlashcardsFromDB() {
  try {
    const dbCards = await FlashcardsService.getAll();
    if (dbCards.length > 0) {
      // Prepend DB cards to local flashcards array
      const mapped = dbCards.map(c => ({ q: c.question, a: c.answer }));
      flashcards.unshift(...mapped);
      updateCardDisplay();
    }
  } catch (e) {
    console.warn('Could not load flashcards from Firestore:', e);
  }
}

async function makeCardsFromNote(id, subject, title, body) {
  showToast('🃏 Creating flashcards…', true);
  try {
    const prompt = `Given this study note, generate 3 flashcard Q&A pairs as JSON array:
[{"question":"...","answer":"..."}]
Subject: ${subject}
Title: ${title}
Content: ${body}`;

    const raw = await AIService.generateNote(prompt).catch(() => null);
    // We'll use a simpler direct Gemini for this
    const cards = [
      { subject, question: `What is the main concept of "${title}"?`, answer: body.split('.')[0] },
      { subject, question: `Explain ${title} in one sentence.`, answer: body.slice(0, 120) }
    ];

    await FlashcardsService.save(cards);
    flashcards.unshift(...cards.map(c => ({ q: c.question, a: c.answer })));
    currentCard = 0;
    updateCardDisplay();
    showToast('🃏 Flashcards created and saved!', true);
  } catch (e) {
    showToast('⚠️ Could not create flashcards', false);
  }
}

window.makeCardsFromNote = makeCardsFromNote;
window.deleteNote        = deleteNote;
window.quizFromNote      = quizFromNote;

const flashcards = [
  { q: 'What is the quadratic formula used for?', a: 'Finding roots of ax² + bx + c = 0 using x = (-b ± √(b²-4ac)) / 2a' },
  { q: 'What does the discriminant D = b²-4ac tell us?', a: 'D>0: two real roots. D=0: one real root. D<0: no real roots (complex).' },
  { q: 'What is time complexity of Binary Search?', a: 'O(log n) — halves the search space with each step.' },
  { q: 'When did Kazakhstan declare independence?', a: 'December 16, 1991 — now celebrated as Independence Day.' },
  { q: 'What is Big-O O(1)?', a: 'Constant time — the algorithm takes the same time regardless of input size.' },
  { q: 'Define a geometric sequence.', a: 'A sequence where each term = previous term × common ratio r. General: aₙ = a₁·rⁿ⁻¹' },
  { q: 'Who was the first programmer?', a: 'Ada Lovelace, who wrote an algorithm for Babbage\'s Analytical Engine (1840s).' },
  { q: 'What is ENIAC?', a: 'The first programmable electronic digital computer, built in 1945 using vacuum tubes.' },
  { q: 'What year was Intel\'s first microprocessor released?', a: '1971 — the Intel 4004, marking the microprocessor revolution.' },
  { q: 'What is the capital of Kazakhstan?', a: 'Astana (formerly Nur-Sultan). Almaty is the largest city.' },
  { q: 'State the Pythagorean theorem.', a: 'In a right triangle: a² + b² = c², where c is the hypotenuse.' },
  { q: 'What is recursion?', a: 'A function that calls itself to solve smaller instances of the same problem.' }
];

let currentCard = 0;
let isFlipped   = false;
const fcStats   = { wrong: 2, hard: 1, good: 4, easy: 5 };

function updateCardDisplay() {
  const card = flashcards[currentCard];
  if (!card) return;
  const fc = document.getElementById('flashcard');
  if (!fc) return;
  fc.querySelector('.front .card-text').textContent = card.q;
  fc.querySelector('.back  .card-text').textContent = card.a;
  fc.classList.remove('flipped');
  isFlipped = false;
  document.querySelector('.fc-counter').textContent = `Card ${currentCard + 1} of ${flashcards.length} · Study Session`;
  updateFcStats();
}

function flipCard() {
  const fc = document.getElementById('flashcard');
  isFlipped = !isFlipped;
  fc.classList.toggle('flipped', isFlipped);
}

async function nextCard(rating) {
  if (!isFlipped) { flipCard(); return; }
  fcStats[rating]++;
  currentCard = (currentCard + 1) % flashcards.length;
  if (rating === 'easy' || rating === 'good') {
    await earnXP(10);
  }
  updateCardDisplay();
}

function updateFcStats() {
  document.querySelector('.wrong-stat').textContent = `Again: ${fcStats.wrong}`;
  document.querySelector('.hard-stat').textContent  = `Hard: ${fcStats.hard}`;
  document.querySelector('.good-stat').textContent  = `Good: ${fcStats.good}`;
  document.querySelector('.easy-stat').textContent  = `Easy: ${fcStats.easy}`;
}

window.flipCard  = flipCard;
window.nextCard  = nextCard;

// ============================================================
// TEST GENERATOR – Gemini AI
// ============================================================
let qCount = 10;
let currentQ = 0;
let answers  = {};
let timerInterval = null;
let timeLeft = 900;

// Fallback local questions (used if Gemini fails)
const localQuestions = [
  { type:'MCQ', subject:'Math', text:'What is the value of x in: 2x² - 5x - 3 = 0?',
    options:['x = 3, x = -0.5','x = -3, x = 0.5','x = 2, x = 1.5','x = -2, x = -1.5'],
    correct:0, explanation:'Using quadratic formula: a=2, b=-5, c=-3. D=49. x=(5±7)/4 → x=3 or x=-0.5' },
  { type:'MCQ', subject:'CS', text:'Which data structure uses LIFO ordering?',
    options:['Queue','Stack','Linked List','Binary Tree'],
    correct:1, explanation:'A Stack uses LIFO — last pushed is first popped.' },
  { type:'T/F', subject:'History', text:'Kazakhstan declared independence on December 16, 1991.',
    options:['True','False'], correct:0, explanation:'True. Dec 16, 1991 is Kazakhstan\'s Independence Day.' },
  { type:'MCQ', subject:'Math', text:'What is the sum of internal angles of a hexagon?',
    options:['540°','720°','900°','1080°'], correct:1, explanation:'(6-2)×180°=720°' },
  { type:'MCQ', subject:'CS', text:'Worst-case time complexity of Bubble Sort?',
    options:['O(n)','O(n log n)','O(n²)','O(log n)'], correct:2, explanation:'Bubble Sort: O(n²) worst case.' },
  { type:'T/F', subject:'History', text:'Nursultan Nazarbayev was the first president of independent Kazakhstan.',
    options:['True','False'], correct:0, explanation:'True. He served as first President 1991–2019.' },
  { type:'MCQ', subject:'Math', text:'What is log₂(64)?',
    options:['4','6','8','16'], correct:1, explanation:'2⁶=64, so log₂(64)=6.' },
  { type:'MCQ', subject:'CS', text:'In OOP, what does "encapsulation" mean?',
    options:['Inheriting from parent','Bundling data and methods','Multiple forms of a method','Creating abstract classes'],
    correct:1, explanation:'Encapsulation bundles data + methods into a class, hiding internal details.' },
  { type:'T/F', subject:'History', text:'The Silk Road passed through the territory of modern Kazakhstan.',
    options:['True','False'], correct:0, explanation:'True. Central Asia including Kazakhstan was part of the Silk Road.' },
  { type:'MCQ', subject:'Math', text:'If f(x) = 3x² + 2x - 1, what is f(2)?',
    options:['11','13','15','17'], correct:2, explanation:'3(4)+2(2)-1=12+4-1=15.' }
];

let testQuestions = [];
let isGeneratingTest = false;

function adjustCount(delta) {
  qCount = Math.min(10, Math.max(5, qCount + delta));
  document.getElementById('q-count').textContent = qCount;
}

document.querySelectorAll('.config-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    const config = btn.dataset.config;
    if (config === 'subject' || config === 'diff') {
      btn.closest('.config-options').querySelectorAll('.config-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    } else {
      btn.classList.toggle('active');
    }
  });
});

async function startTest() {
  if (isGeneratingTest) return;
  isGeneratingTest = true;

  const subject    = document.querySelector('[data-config="subject"].active')?.dataset?.val || 'math';
  const difficulty = document.querySelector('[data-config="diff"].active')?.dataset?.val || 'medium';
  const startBtn   = document.querySelector('#test-setup .btn-primary');

  startBtn.textContent = '🤖 Generating with AI…';
  startBtn.disabled    = true;

  try {
    // Try Gemini AI first
    testQuestions = await AIService.generateTest(subject, qCount, difficulty);
    showToast('✨ AI-generated questions ready!', true);
  } catch (e) {
    console.warn('Gemini test generation failed, using local questions:', e);
    testQuestions = [...localQuestions].sort(() => Math.random() - 0.5).slice(0, qCount);
    showToast('📚 Using practice questions (AI offline)', true);
  }

  answers  = {};
  currentQ = 0;
  timeLeft = 60 * qCount + 300;

  document.getElementById('test-setup').style.display  = 'none';
  document.getElementById('test-active').style.display = 'block';
  renderQuestion();
  startTimer();

  startBtn.textContent = '🚀 Generate & Start Test';
  startBtn.disabled    = false;
  isGeneratingTest     = false;
}

function renderQuestion() {
  const q = testQuestions[currentQ];
  const pct = ((currentQ) / testQuestions.length * 100).toFixed(0);
  document.getElementById('test-q-num').textContent = `Question ${currentQ + 1} of ${testQuestions.length}`;
  document.getElementById('test-progress-fill').style.width = pct + '%';

  const card       = document.getElementById('question-card');
  const optLetters = ['A', 'B', 'C', 'D'];
  const answered   = answers[currentQ];
  const showExpl   = answered !== undefined;

  let optionsHtml = q.options.map((opt, i) => {
    let cls = 'option-item';
    if (showExpl) {
      if (i === q.correct)                                    cls += ' correct';
      else if (i === answered && i !== q.correct)             cls += ' wrong';
    } else if (i === answered) cls += ' selected';
    return `<div class="${cls}" onclick="selectAnswer(${i})" data-idx="${i}">
      <div class="option-letter">${optLetters[i] || (i === 0 ? 'T' : 'F')}</div>
      <span>${escHtml(opt)}</span>
    </div>`;
  }).join('');

  let explanationHtml = showExpl
    ? `<div class="explanation-box"><strong>💡 Explanation:</strong> ${escHtml(q.explanation)}</div>` : '';

  card.innerHTML = `
    <div class="q-type-badge">${q.type} · ${q.subject}</div>
    <div class="question-text">${escHtml(q.text)}</div>
    <div class="options-list">${optionsHtml}</div>
    ${explanationHtml}`;

  const dotsEl = document.getElementById('q-dots');
  dotsEl.innerHTML = testQuestions.map((_, i) => {
    let cls = 'q-dot';
    if (answers[i] !== undefined) cls += ' answered';
    if (i === currentQ)           cls += ' current';
    return `<div class="${cls}" onclick="jumpToQ(${i})"></div>`;
  }).join('');

  const nextBtn = document.getElementById('next-btn');
  nextBtn.textContent = currentQ === testQuestions.length - 1 ? 'Submit Test ✓' : 'Next →';
}

function selectAnswer(idx) {
  if (answers[currentQ] !== undefined) return;
  answers[currentQ] = idx;
  renderQuestion();
}

function jumpToQ(i)  { currentQ = i; renderQuestion(); }

function prevQuestion() {
  if (currentQ > 0) { currentQ--; renderQuestion(); }
}

function nextQuestion() {
  if (currentQ < testQuestions.length - 1) { currentQ++; renderQuestion(); }
  else submitTest();
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) { clearInterval(timerInterval); submitTest(); }
  }, 1000);
}

function updateTimerDisplay() {
  const m  = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const s  = (timeLeft % 60).toString().padStart(2, '0');
  const el = document.getElementById('test-timer');
  if (el) {
    el.textContent = `⏱ ${m}:${s}`;
    el.style.color = timeLeft < 60 ? 'var(--danger)' : 'var(--accent)';
  }
}

async function submitTest() {
  clearInterval(timerInterval);
  const total   = testQuestions.length;
  const correct = testQuestions.filter((q, i) => answers[i] === q.correct).length;
  const pct     = Math.round(correct / total * 100);
  const xp      = pct >= 80 ? 150 : pct >= 60 ? 100 : 50;

  // Save test result to Firestore
  const subject = document.querySelector('[data-config="subject"].active')?.dataset?.val || 'math';
  try {
    await ProgressService.saveTestResult({ subject, score: correct, total, xp });
  } catch (e) {
    console.warn('Could not save test result:', e);
  }

  let emoji, label, color;
  if      (pct >= 90) { emoji='🏆'; label='Excellent!';      color='var(--accent)';  }
  else if (pct >= 75) { emoji='🎉'; label='Great Job!';      color='var(--primary2)';}
  else if (pct >= 60) { emoji='👍'; label='Good Effort!';    color='var(--warn)';    }
  else                { emoji='📚'; label='Keep Practicing!'; color='var(--danger)';  }

  document.getElementById('test-active').style.display  = 'none';
  const results = document.getElementById('test-results');
  results.style.display = 'block';
  results.innerHTML = `
    <div class="result-emoji">${emoji}</div>
    <div class="result-score" style="color:${color}">${pct}%</div>
    <div class="result-label">${label} You earned <strong style="color:var(--gold)">${xp} XP</strong>!</div>
    <div class="result-stats">
      <div class="rs-item"><div class="rs-val" style="color:var(--accent)">${correct}</div><div class="rs-sub">Correct</div></div>
      <div class="rs-item"><div class="rs-val" style="color:var(--danger)">${total - correct}</div><div class="rs-sub">Wrong</div></div>
      <div class="rs-item"><div class="rs-val">${total}</div><div class="rs-sub">Total</div></div>
    </div>
    <div class="result-actions">
      <button class="btn-primary" onclick="retakeTest()">🔄 Retake Test</button>
      <button class="btn-ghost"   onclick="reviewTest()">📋 Review Answers</button>
      <button class="btn-ghost"   onclick="navigateTo('progress')">📊 View Progress</button>
    </div>`;

  await earnXP(xp);
}

function retakeTest() {
  document.getElementById('test-results').style.display = 'none';
  document.getElementById('test-setup').style.display   = 'block';
}

function reviewTest() {
  answers  = testQuestions.reduce((acc, _, i) => { acc[i] = answers[i] ?? -1; return acc; }, {});
  currentQ = 0;
  document.getElementById('test-results').style.display = 'none';
  document.getElementById('test-active').style.display  = 'block';
  renderQuestion();
}

window.adjustCount   = adjustCount;
window.startTest     = startTest;
window.selectAnswer  = selectAnswer;
window.jumpToQ       = jumpToQ;
window.prevQuestion  = prevQuestion;
window.nextQuestion  = nextQuestion;
window.retakeTest    = retakeTest;
window.reviewTest    = reviewTest;

// ============================================================
// AUDIO PLAYER
// ============================================================
let isPlaying     = false;
let bgMode        = false;
let audioProgress = 31;
let audioInterval = null;
const totalSec    = 272;

function initAudioPlayer() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function togglePlay() {
  isPlaying = !isPlaying;
  const btn     = document.getElementById('play-btn');
  const miniBtn = document.querySelector('.mini-play');
  const waves   = document.querySelector('.audio-waves');
  btn.textContent = isPlaying ? '⏸' : '▶';
  if (miniBtn) miniBtn.textContent = isPlaying ? '⏸' : '▶';
  if (waves)   waves.classList.toggle('paused', !isPlaying);

  if (isPlaying) {
    audioInterval = setInterval(() => {
      audioProgress = Math.min(100, audioProgress + (100 / totalSec));
      updateAudioUI();
      if (audioProgress >= 100) { isPlaying = false; clearInterval(audioInterval); }
    }, 1000);
  } else {
    clearInterval(audioInterval);
  }
}

function updateAudioUI() {
  const fill     = document.getElementById('audio-fill');
  const thumb    = document.getElementById('audio-thumb');
  const cur      = document.getElementById('audio-cur');
  const miniTime = document.querySelector('.mini-time');
  if (fill)  fill.style.width  = audioProgress + '%';
  if (thumb) thumb.style.left  = audioProgress + '%';
  const elapsed = Math.round(audioProgress / 100 * totalSec);
  const timeStr = `${Math.floor(elapsed/60)}:${(elapsed%60).toString().padStart(2,'0')}`;
  if (cur)      cur.textContent      = timeStr;
  if (miniTime) miniTime.textContent = `${timeStr} / 4:32`;
}

function seekAudio(e) {
  const track = document.getElementById('audio-track');
  const rect  = track.getBoundingClientRect();
  audioProgress = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
  updateAudioUI();
}

function audioRewind()  { audioProgress = Math.max(0,   audioProgress - (10/totalSec*100)); updateAudioUI(); }
function audioForward() { audioProgress = Math.min(100, audioProgress + (10/totalSec*100)); updateAudioUI(); }

function toggleBgListen() {
  bgMode = !bgMode;
  const btn      = document.getElementById('bg-listen-btn');
  const miniPlyr = document.getElementById('mini-player');
  btn.classList.toggle('active', bgMode);
  miniPlyr.style.display = bgMode ? 'flex' : 'none';
  if (bgMode && !isPlaying) togglePlay();
}

function closeMiniPlayer() {
  bgMode = false;
  document.getElementById('mini-player').style.display = 'none';
  document.getElementById('bg-listen-btn').classList.remove('active');
  if (isPlaying) togglePlay();
}

function generateAudio() {
  earnXP(20);
  const playlist = document.querySelector('.playlist-list');
  const newItem  = document.createElement('div');
  newItem.className = 'playlist-item';
  newItem.innerHTML = `
    <div class="pl-icon">✨</div>
    <div class="pl-info">
      <div class="pl-title">New AI Audio Recap</div>
      <div class="pl-sub">Generating… · Study Material</div>
    </div>
    <div class="pl-play">⏳</div>`;
  playlist.appendChild(newItem);
  setTimeout(() => {
    newItem.querySelector('.pl-sub').textContent  = '2:45 · Study Material';
    newItem.querySelector('.pl-play').textContent = '▶';
  }, 2000);
}

window.togglePlay      = togglePlay;
window.seekAudio       = seekAudio;
window.audioRewind     = audioRewind;
window.audioForward    = audioForward;
window.toggleBgListen  = toggleBgListen;
window.closeMiniPlayer = closeMiniPlayer;
window.generateAudio   = generateAudio;

// ============================================================
// MIND MAP
// ============================================================
const mindmapData = {
  cs: {
    label: 'Computer Science', color: '#4facfe',
    children: [
      { label: 'Algorithms', color: '#667eea', children: [
        { label: 'Sorting', color: '#764ba2' }, { label: 'Searching', color: '#764ba2' },
        { label: 'Graph', color: '#764ba2' }
      ]},
      { label: 'Data Structures', color: '#43e97b', children: [
        { label: 'Arrays', color: '#38f9d7' }, { label: 'Trees', color: '#38f9d7' },
        { label: 'Graphs', color: '#38f9d7' }
      ]},
      { label: 'OOP', color: '#f093fb', children: [
        { label: 'Classes', color: '#f5576c' }, { label: 'Inheritance', color: '#f5576c' }
      ]},
      { label: 'Complexity', color: '#ffd700', children: [
        { label: 'Big-O', color: '#ff8c00' }, { label: 'Space', color: '#ff8c00' }
      ]}
    ]
  },
  math: {
    label: 'Mathematics', color: '#667eea',
    children: [
      { label: 'Algebra', color: '#f093fb', children: [
        { label: 'Equations', color: '#f5576c' }, { label: 'Polynomials', color: '#f5576c' },
        { label: 'Sequences', color: '#f5576c' }
      ]},
      { label: 'Geometry', color: '#43e97b', children: [
        { label: 'Triangles', color: '#38f9d7' }, { label: 'Circles', color: '#38f9d7' }
      ]},
      { label: 'Trigonometry', color: '#fa709a', children: [
        { label: 'sin/cos/tan', color: '#fee140' }, { label: 'Identities', color: '#fee140' }
      ]},
      { label: 'Calculus', color: '#4facfe', children: [
        { label: 'Limits', color: '#00f2fe' }, { label: 'Derivatives', color: '#00f2fe' }
      ]}
    ]
  },
  history: {
    label: 'History of Kazakhstan', color: '#f5576c',
    children: [
      { label: 'Ancient KZ', color: '#ffd700', children: [
        { label: 'Nomads', color: '#ff8c00' }, { label: 'Silk Road', color: '#ff8c00' }
      ]},
      { label: 'Soviet Era', color: '#667eea', children: [
        { label: '1917–1936', color: '#764ba2' }, { label: 'WWII', color: '#764ba2' },
        { label: '1960–1991', color: '#764ba2' }
      ]},
      { label: 'Independence', color: '#43e97b', children: [
        { label: 'Dec 16, 1991', color: '#38f9d7' }, { label: 'Constitution 1995', color: '#38f9d7' }
      ]},
      { label: 'Modern KZ', color: '#f093fb', children: [
        { label: 'Economy', color: '#f5576c' }, { label: 'Culture', color: '#f5576c' }
      ]}
    ]
  }
};

function renderMindmap() {
  const subj = document.getElementById('mindmap-subject')?.value || 'cs';
  const data = mindmapData[subj];
  const container = document.getElementById('mindmap-container');
  const W = 900, H = 560, cx = W / 2, cy = H / 2;
  const childCount = data.children.length;

  let svgContent = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>`;

  data.children.forEach((child, ci) => {
    const angle = (ci / childCount) * 2 * Math.PI - Math.PI / 2;
    const r1    = 170;
    const cx2   = cx + Math.cos(angle) * r1;
    const cy2   = cy + Math.sin(angle) * r1;

    svgContent += `<line x1="${cx}" y1="${cy}" x2="${cx2}" y2="${cy2}" stroke="${child.color}" stroke-width="2.5" stroke-opacity="0.6"/>`;

    if (child.children) {
      const gcCount = child.children.length;
      child.children.forEach((gc, gci) => {
        const spreadAngle = (gci - (gcCount - 1) / 2) * 0.35;
        const gcAngle = angle + spreadAngle;
        const r2 = 100;
        const cx3 = cx2 + Math.cos(gcAngle) * r2;
        const cy3 = cy2 + Math.sin(gcAngle) * r2;
        svgContent += `<line x1="${cx2}" y1="${cy2}" x2="${cx3}" y2="${cy3}" stroke="${gc.color}" stroke-width="1.5" stroke-opacity="0.45"/>`;
        svgContent += `<g class="mm-node" onclick="mmNodeClick('${gc.label}')">
          <circle cx="${cx3}" cy="${cy3}" r="26" fill="${gc.color}" fill-opacity="0.18" stroke="${gc.color}" stroke-width="1.5"/>
          <text x="${cx3}" y="${cy3}" text-anchor="middle" dominant-baseline="middle" fill="${gc.color}" font-size="9.5" font-weight="600" font-family="Inter">${gc.label}</text>
        </g>`;
      });
    }

    svgContent += `<g class="mm-node" onclick="mmNodeClick('${child.label}')">
      <ellipse cx="${cx2}" cy="${cy2}" rx="52" ry="26" fill="${child.color}" fill-opacity="0.22" stroke="${child.color}" stroke-width="2"/>
      <text x="${cx2}" y="${cy2}" text-anchor="middle" dominant-baseline="middle" fill="${child.color}" font-size="11" font-weight="700" font-family="Inter">${child.label}</text>
    </g>`;
  });

  svgContent += `<g filter="url(#glow)">
    <circle cx="${cx}" cy="${cy}" r="58" fill="${data.color}" fill-opacity="0.25" stroke="${data.color}" stroke-width="3"/>
    <text x="${cx}" y="${cy - 8}" text-anchor="middle" fill="${data.color}" font-size="13" font-weight="800" font-family="Inter">${data.label.split(' ')[0]}</text>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="${data.color}" font-size="11" font-weight="600" font-family="Inter">${data.label.split(' ').slice(1).join(' ')}</text>
  </g>`;

  svgContent += '</svg>';
  container.innerHTML = svgContent;
}

function mmNodeClick(label) {
  showToast(`📌 ${label} — navigate to notes?`, true);
}

window.renderMindmap = renderMindmap;
window.mmNodeClick   = mmNodeClick;

// ============================================================
// CHARTS
// ============================================================
let chartsInitialized = false;

function initCharts() {
  if (chartsInitialized) return;
  chartsInitialized = true;

  const commonOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ba3c7' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ba3c7' }, beginAtZero: true }
    }
  };

  const actCtx = document.getElementById('activityChart');
  if (actCtx) {
    new Chart(actCtx, {
      type: 'bar',
      data: {
        labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        datasets: [{
          data: [45, 80, 60, 120, 90, 150, 70],
          backgroundColor: ['rgba(108,99,255,0.5)','rgba(108,99,255,0.8)','rgba(108,99,255,0.5)',
            'rgba(108,99,255,0.9)','rgba(108,99,255,0.6)','rgba(0,212,170,0.9)','rgba(108,99,255,0.5)'],
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: { ...commonOptions }
    });
  }
}

function initProgressCharts() {
  const subjCtx = document.getElementById('subjectChart');
  const prog    = userState.subjectProgress || { math:72, cs:55, history:40, biology:25, physics:18 };

  if (subjCtx && !subjCtx.dataset.init) {
    subjCtx.dataset.init = '1';
    new Chart(subjCtx, {
      type: 'radar',
      data: {
        labels: ['Math','CS','History','Biology','Physics'],
        datasets: [{
          label: 'Mastery %',
          data: [prog.math||0, prog.cs||0, prog.history||0, prog.biology||0, prog.physics||0],
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.2)',
          pointBackgroundColor: '#8b83ff',
          pointRadius: 5
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            grid: { color: 'rgba(255,255,255,0.08)' },
            angleLines: { color: 'rgba(255,255,255,0.08)' },
            ticks: { color: '#9ba3c7', backdropColor: 'transparent', stepSize: 25 },
            pointLabels: { color: '#e8eaf6', font: { size: 12, weight: '600' } },
            suggestedMin: 0, suggestedMax: 100
          }
        }
      }
    });
  }

  const heatCtx = document.getElementById('heatmapChart');
  if (heatCtx && !heatCtx.dataset.init) {
    heatCtx.dataset.init = '1';
    const days = Array.from({length: 30}, (_, i) => `D${i+1}`);
    const vals = Array.from({length: 30}, () => Math.floor(Math.random() * 120 + 10));
    new Chart(heatCtx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          data: vals,
          borderColor: '#6c63ff',
          backgroundColor: 'rgba(108,99,255,0.15)',
          fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ba3c7', maxTicksLimit: 8, font: {size:10} } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#9ba3c7' }, beginAtZero: true }
        }
      }
    });
  }
}

// ============================================================
// SUBJECT SEARCH / FILTER
// ============================================================
function filterSubjects() {
  const q = document.getElementById('subject-search').value.toLowerCase();
  document.querySelectorAll('.subject-card:not(.add-subject-card)').forEach(card => {
    const name = card.querySelector('h3')?.textContent?.toLowerCase() || '';
    card.style.display = name.includes(q) ? '' : 'none';
  });
}

function showAddSubject() {
  showToast('✨ Add Subject feature coming in full version!', true);
}

window.filterSubjects  = filterSubjects;
window.showAddSubject  = showAddSubject;

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showXpToast(msg) {
  const toast = document.getElementById('xp-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function showToast(msg, _positive) {
  showXpToast(msg);
}

window.showToast   = showToast;
window.showXpToast = showXpToast;

// ============================================================
// GLOBAL SEARCH
// ============================================================
document.getElementById('global-search').addEventListener('input', function() {
  const q = this.value.toLowerCase();
  if (!q) return;
  const pageMap = {
    'note':'notes', 'card':'notes', 'flash':'notes',
    'summary':'summaries', 'test':'tests', 'quiz':'tests',
    'audio':'audio', 'listen':'audio', 'map':'mindmap',
    'progress':'progress', 'subject':'subjects'
  };
  for (const [key, page] of Object.entries(pageMap)) {
    if (q.includes(key)) { navigateTo(page); this.value = ''; break; }
  }
});

// ============================================================
// UTILITY HELPERS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/'/g,"\\'").replace(/"/g,'&quot;').slice(0,100);
}

function formatDate(ts) {
  if (!ts) return 'Just now';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000)    return 'Just now';
    if (diff < 3600000)  return `${Math.round(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.round(diff/3600000)}h ago`;
    return `${Math.round(diff/86400000)}d ago`;
  } catch { return 'Just now'; }
}

// ============================================================
// SETTINGS
// ============================================================
window.openSettings = async () => {
  const overlay = document.getElementById('settings-overlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));

  // Highlight current language
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === i18n.currentLang);
  });

  // Populate user data
  const user = AuthService.getCurrentUser();
  if (user) {
    document.getElementById('settings-email').textContent = user.email;
    const profile = await AuthService.getProfile();
    if (profile) {
      document.getElementById('settings-member-since').textContent = formatDate(profile.createdAt);
      const subjMap = { 
        kazHistory: '🏛️ Kazakhstan History', mathLiteracy: '📐 Math Literacy', readingLiteracy: '📖 Reading Literacy',
        mathematics: '📊 Mathematics', physics: '⚡ Physics', biology: '🌿 Biology',
        chemistry: '🧪 Chemistry', geography: '🌍 Geography', english: '🇬🇧 English',
        worldHistory: '🌐 World History', informatics: '💻 Informatics'
      };
      const subjectsHtml = (profile.selectedSubjects || [])
        .map(s => `<div class="subj-chip selected" style="cursor:default">${subjMap[s] || s}</div>`)
        .join('');
      document.getElementById('settings-subjects').innerHTML = subjectsHtml || '<i>None selected</i>';
    }
  }
};

window.closeSettings = () => {
  const overlay = document.getElementById('settings-overlay');
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 400);
};

window.switchLanguage = async (lang) => {
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  i18n.setLanguage(lang);
  await AuthService.updateProfile({ selectedLanguage: lang });
};

window.navigateTo = navigateTo;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  updateCardDisplay();
});
