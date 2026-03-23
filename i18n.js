// ============================================================
//  i18n – Lightweight Internationalization for EntHelper
//  Supports: en (English), ru (Russian), kk (Kazakh)
// ============================================================

const SUPPORTED_LANGS = ['en', 'ru', 'kk'];
const DEFAULT_LANG = 'ru';
let translations = {};
let currentLang = DEFAULT_LANG;
let onLangChangeCallbacks = [];

/**
 * Initialize i18n – load saved language and translations
 */
export async function initI18n() {
  // Priority: localStorage → browser → default
  const saved = localStorage.getItem('enthelper_lang');
  const browser = navigator.language?.slice(0, 2);
  currentLang = saved || (SUPPORTED_LANGS.includes(browser) ? browser : DEFAULT_LANG);

  await loadTranslations(currentLang);
  applyTranslations();
  return currentLang;
}

/**
 * Load translation file for a given language
 */
async function loadTranslations(lang) {
  try {
    const res = await fetch(`./locales/${lang}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    translations = await res.json();
  } catch (e) {
    console.warn(`Failed to load ${lang} translations, falling back to en:`, e);
    if (lang !== 'en') {
      const res = await fetch('./locales/en.json');
      translations = await res.json();
    }
  }
}

/**
 * Get a translated string by dot-notation key
 * e.g. t('nav.dashboard') → 'Dashboard'
 */
export function t(key) {
  const parts = key.split('.');
  let value = translations;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return key; // fallback: return key itself
    }
  }
  return typeof value === 'string' ? value : key;
}

/**
 * Switch language and update all DOM elements with data-i18n
 */
export async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem('enthelper_lang', lang);
  await loadTranslations(lang);
  applyTranslations();
  onLangChangeCallbacks.forEach(cb => cb(lang));
}

/**
 * Register callback for language changes
 */
export function onLanguageChange(cb) {
  onLangChangeCallbacks.push(cb);
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = t(key);
    if (text !== key) {
      // Check if it's an input placeholder
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
        el.placeholder = text;
      } else if (el.tagName === 'OPTION') {
        el.textContent = text;
      } else {
        el.textContent = text;
      }
    }
  });

  // Also handle data-i18n-placeholder for inputs
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const text = t(key);
    if (text !== key) el.placeholder = text;
  });

  // Update HTML lang attribute
  document.documentElement.lang = currentLang;
}

/**
 * Get current language code
 */
export function getCurrentLang() {
  return currentLang;
}

export { SUPPORTED_LANGS };
