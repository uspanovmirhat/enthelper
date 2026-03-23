// ============================================================
//  Firebase Config – EntHelper
//  Project: studai-9b11d
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, getDocs, deleteDoc,
  collection, query, orderBy, limit, serverTimestamp, where
} from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-firestore.js';
import {
  getDatabase, ref, set, get, push, update, onValue
} from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyCkWsdNt9agscGeBhXn9AAEJP4YR4SOOvg",
  authDomain: "studai-9b11d.firebaseapp.com",
  databaseURL: "https://studai-9b11d-default-rtdb.firebaseio.com",
  projectId: "studai-9b11d",
  storageBucket: "studai-9b11d.firebasestorage.app",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// Use a local persistent UID instead of Firebase Auth to bypass API restrictions
let currentUid = localStorage.getItem('enthelper_uid');
if (!currentUid) {
  currentUid = 'local_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('enthelper_uid', currentUid);
}
export function uid() { return currentUid; }

// ============================================================
//  MOCKED AUTH SERVICE (Registration/Login Form completely bypassed)
// ============================================================
export const AuthService = {
  async register(email, password) { return { uid: currentUid }; },
  async login(email, password) { return { uid: currentUid }; },
  async logout() { },
  onStateChange(callback) {
    // Immediately log the user in with their local ID
    setTimeout(() => callback({ uid: currentUid }), 50);
    return () => {};
  },
  getCurrentUser() { return { uid: currentUid }; },
  async getProfile() {
    const snap = await getDoc(doc(db, 'users', currentUid));
    return snap.exists() ? snap.data() : null;
  },
  async updateProfile(data) {
    await setDoc(doc(db, 'users', currentUid), data, { merge: true });
  }
};


// ============================================================
//  DEFAULT USER STATE  (stored in Realtime DB under /user)
// ============================================================
const DEFAULT_USER = {
  name: 'Student',
  initials: 'ST',
  xp: 0,
  level: 1,
  streak: 0,
  lastActive: null,
  subjectProgress: {
    math: 0,
    cs: 0,
    history: 0,
    biology: 0,
    physics: 0,
  }
};

// ============================================================
//  PROGRESS SERVICE  (Realtime Database)
// ============================================================
export const ProgressService = {
  /** Load user data from RTDB; seeds defaults if first time */
  async load() {
    const snap = await get(ref(rtdb, `users/${uid()}`));
    if (snap.exists()) return snap.val();
    // First run — seed defaults
    await set(ref(rtdb, `users/${uid()}`), { ...DEFAULT_USER, lastActive: Date.now() });
    return { ...DEFAULT_USER };
  },

  /** Add XP, auto-level-up (every 3000 XP per level) */
  async addXp(amount) {
    const snap = await get(ref(rtdb, `users/${uid()}`));
    const user = snap.exists() ? snap.val() : { ...DEFAULT_USER };
    user.xp += amount;
    user.level = Math.floor(user.xp / 3000) + 1;
    user.lastActive = Date.now();
    await update(ref(rtdb, `users/${uid()}`), { xp: user.xp, level: user.level, lastActive: user.lastActive });
    return user;
  },

  /** Save test result and update subject progress */
  async saveTestResult({ subject, score, total, xp }) {
    // Push to Firestore for history
    await addDoc(collection(db, 'users', uid(), 'testResults'), {
      subject, score, total, xp,
      pct: Math.round(score / total * 100),
      takenAt: serverTimestamp()
    });
    // Update subject progress in RTDB
    const pct = Math.round(score / total * 100);
    await set(ref(rtdb, `users/${uid()}/subjectProgress/${subject.toLowerCase()}`), pct);
  },

  /** Increment streak if last active was yesterday */
  async checkStreak() {
    const snap = await get(ref(rtdb, `users/${uid()}`));
    if (!snap.exists()) return;
    const user = snap.val();
    const now = Date.now();
    const last = user.lastActive || 0;
    const dayMs = 86400000;
    const daysSince = Math.floor((now - last) / dayMs);
    if (daysSince === 1) {
      await update(ref(rtdb, `users/${uid()}`), { streak: (user.streak || 0) + 1, lastActive: now });
    } else if (daysSince > 1) {
      await update(ref(rtdb, `users/${uid()}`), { streak: 0, lastActive: now });
    }
  }
};

// ============================================================
//  NOTES SERVICE  (Firestore)
// ============================================================
export const NotesService = {
  async getAll(subject = null) {
    let q = collection(db, 'users', uid(), 'notes');
    q = query(q, orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    let notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (subject) notes = notes.filter(n => n.subject === subject);
    return notes;
  },

  async save({ subject, title, body }) {
    const docRef = await addDoc(collection(db, 'users', uid(), 'notes'), {
      subject, title, body,
      createdAt: serverTimestamp()
    });
    console.log('[DB] Note saved:', title);
    return docRef.id;
  },

  async delete(id) {
    await deleteDoc(doc(db, 'users', uid(), 'notes', id));
  }
};

// ============================================================
//  FLASHCARDS SERVICE  (Firestore)
// ============================================================
export const FlashcardsService = {
  async getAll() {
    const q = query(collection(db, 'users', uid(), 'flashcards'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async save(cards) {
    const promises = cards.map(c =>
      addDoc(collection(db, 'users', uid(), 'flashcards'), { ...c, createdAt: serverTimestamp() })
    );
    return Promise.all(promises);
  }
};

// ============================================================
//  AI CONTENT SERVICE  (Firestore - saves all AI generated content)
// ============================================================
export const AIContentService = {
  async save({ type, subject, content }) {
    const docRef = await addDoc(collection(db, 'users', uid(), 'aiContent'), {
      type, subject, content,
      createdAt: serverTimestamp()
    });
    console.log('[DB] AI content saved:', type, subject);
    return docRef.id;
  },

  async getRecent(limitCount = 10) {
    const q = query(
      collection(db, 'users', uid(), 'aiContent'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};

// ============================================================
//  AI SERVICE  (Google Gemini via REST)
// ============================================================
const GEMINI_KEY = "AIzaSyA5N8WqAKZybCc_iTP2v-M3HoVP4q5M8Yw";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

async function geminiCall(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const res = await fetch(`${GEMINI_BASE}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
      })
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}


export const AIService = {
  /**
   * Generate a structured note from raw text.
   * Returns: { subject, title, body }
   */
  async generateNote(rawText) {
    const prompt = `You are a study assistant for Kazakhstan UNT exam prep.
Analyze this study material and generate a concise note.
Return ONLY valid JSON with these exact fields:
{
  "subject": one of ["math","cs","history","biology","physics","chemistry","literature","geography"],
  "title": "short title (max 6 words)",
  "body": "clear, concise explanation (2-4 sentences, include key facts/formulas)"
}

Material:
${rawText.slice(0, 3000)}`;

    const raw = await geminiCall(prompt);
    // Extract JSON from possible markdown code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    return JSON.parse(jsonMatch[0]);
  },

  /**
   * Generate a summary in the specified mode.
   * Returns: { badge, title, body, concepts: [] }
   */
  async generateSummary(text, mode) {
    const modeInstructions = {
      short: 'Write a very short 2-3 sentence summary capturing only the most essential points.',
      detailed: 'Write a comprehensive paragraph-by-paragraph summary with bold headers for each era/topic.',
      bullets: 'Write a bullet-point list (start each line with •) of the key facts, one per line.',
      eli5: 'Explain this as if talking to a 12-year-old student. Use simple words, relatable analogies, and a friendly tone.'
    };

    const prompt = `You are a study assistant for Kazakhstan UNT exam prep.
${modeInstructions[mode] || modeInstructions.short}

Also extract up to 7 key concepts or terms as a JSON array called "concepts".

Return ONLY valid JSON:
{
  "title": "topic title (4-6 words)",
  "body": "the summary text (use <br> for line breaks in bullet mode)",
  "concepts": ["concept1", "concept2", ...]
}

Text to summarize:
${text.slice(0, 4000)}`;

    const raw = await geminiCall(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response');
    const parsed = JSON.parse(jsonMatch[0]);

    const modeLabels = {
      short: '✨ AI Generated · Short Mode',
      detailed: '📖 AI Generated · Detailed Mode',
      bullets: '• AI Generated · Bullet Points',
      eli5: '😊 AI Generated · Simple Mode'
    };

    return { badge: modeLabels[mode], ...parsed };
  },

  /**
   * Generate quiz questions for a subject.
   * Returns: array of { type, subject, text, options, correct, explanation }
   */
  async generateTest(subject, count, difficulty) {
    const subjectNames = {
      math: 'Mathematics', cs: 'Computer Science', history: 'History of Kazakhstan',
      biology: 'Biology', physics: 'Physics'
    };

    const prompt = `You are a UNT (Unified National Testing) exam question generator for Kazakhstan.
Generate exactly ${count} exam questions for subject: ${subjectNames[subject] || subject}.
Difficulty: ${difficulty || 'medium'}.

Mix question types: about 70% Multiple Choice (MCQ) and 30% True/False (T/F).

Return ONLY valid JSON array:
[
  {
    "type": "MCQ" or "T/F",
    "subject": "${subjectNames[subject] || subject}",
    "text": "the question text",
    "options": ["option A", "option B", "option C", "option D"],
    "correct": 0,
    "explanation": "brief explanation of why the answer is correct"
  }
]

For T/F questions, options must be exactly ["True", "False"].
The "correct" field is the 0-based index of the correct option.
Make questions realistic, educational, and appropriately challenging for a high school UNT exam.`;

    const raw = await geminiCall(prompt);
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrMatch) throw new Error('Invalid AI response');
    return JSON.parse(arrMatch[0]);
  }
};

export { db, rtdb };
