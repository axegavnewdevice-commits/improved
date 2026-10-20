/**
 * Lightweight offline Arabic word checker for Arabic Scrabble.
 * The dictionary is intentionally explicit: only listed lexemes and forms generated
 * from explicitly listed verbs are considered valid. Missing entries are UNKNOWN,
 * not automatically labelled wrong.
 */

const ARABIC_LETTERS = /^(?=\p{Script=Arabic}+$)\p{L}+$/u;
const DIACRITICS_AND_TATWEEL = /[\u064B-\u065F\u0670\u0640]/g;
const ALEF_VARIANTS = /[\u0622\u0623\u0625\u0671]/g;
const PAST_SUFFIXES = ['ت', 'تما', 'تم', 'تن', 'نا', 'تا', 'وا', 'ن'];

export function normalizeArabicWord(input) {
  return String(input ?? '')
    .normalize('NFC')
    .replace(DIACRITICS_AND_TATWEEL, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim();
}

function addNormalized(set, value) {
  const normalized = normalizeArabicWord(value);
  if (normalized && ARABIC_LETTERS.test(normalized)) set.add(normalized);
}

function isWeakEnding(word) {
  return /[اوىي]$/u.test(word);
}

// Conservative generator: broad past/imperative suffix generation is limited to sound triliteral lemmas.
// Hamzated and weak-root verbs remain listed lexemes (plus the safer present forms supplied in the data).
function isRegularSoundTriliteralPast(word) {
  return [...word].length === 3 && !/[اوىيءأإآ]/u.test(word) && ARABIC_LETTERS.test(word);
}

function generateVerbForms({ past, present, imperative }, accepted) {
  addNormalized(accepted, past);

  // Only listed verbs are expanded. Generate past-tense variants for sound triliteral lemmas;
  // do not blindly append suffixes to weak or hamzated roots.
  const regularSoundPast = isRegularSoundTriliteralPast(past);
  if (regularSoundPast && !isWeakEnding(past)) {
    for (const suffix of PAST_SUFFIXES) addNormalized(accepted, past + suffix);
    addNormalized(accepted, past + 'ا'); // regular sound-verb dual
  }

  // The present 3ms form is supplied explicitly for each listed verb. Generate
  // common person prefixes and number/gender endings only for non-weak finals.
  addNormalized(accepted, present);
  if (regularSoundPast && !isWeakEnding(present) && present.startsWith('ي') && present.length > 1) {
    const stem = present.slice(1);
    const yForms = [stem && `ي${stem}`, `ي${stem}ان`, `ي${stem}ون`, `ي${stem}ن`];
    const tForms = [`ت${stem}`, `ت${stem}ان`, `ت${stem}ون`, `ت${stem}ين`, `ت${stem}ن`];
    const aForms = stem.startsWith('أ') ? [] : [`أ${stem}`];
    const nForms = [`ن${stem}`];
    for (const form of [...yForms, ...tForms, ...aForms, ...nForms]) {
      if (!form) continue;
      addNormalized(accepted, form);
      // سـ marks the near/future; it remains one orthographic word.
      if (/^[يتأن]/u.test(form)) addNormalized(accepted, `س${form}`);
    }
  }

  // Imperative forms in the file are explicit. Add regular sound-verb variants
  // only when the supplied imperative ends in a consonant, not a weak letter.
  addNormalized(accepted, imperative);
  if (regularSoundPast && !isWeakEnding(imperative)) {
    for (const suffix of ['ا', 'وا', 'ي', 'ن']) addNormalized(accepted, imperative + suffix);
  }
}

export function createArabicWordValidator(dictionaryText) {
  const words = new Set();
  const verbRows = [];
  let section = 'words';

  for (const rawLine of String(dictionaryText ?? '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s*VERBS\b/i.test(line) || /^\[VERBS\]$/i.test(line)) {
      section = 'verbs';
      continue;
    }
    if (/^#/.test(line)) continue;

    if (section === 'verbs') {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length >= 3 && parts.slice(0, 3).every(Boolean)) {
        verbRows.push({ past: parts[0], present: parts[1], imperative: parts[2] });
      }
    } else {
      for (const token of line.split(/\s+/u)) addNormalized(words, token);
    }
  }

  for (const verb of verbRows) generateVerbForms(verb, words);

  const validateWord = (input) => {
    const normalized = normalizeArabicWord(input);
    if (!normalized || !ARABIC_LETTERS.test(normalized) || [...normalized].length < 2) {
      return { status: 'invalid', original: String(input ?? ''), normalized, reason: 'malformed' };
    }
    if (words.has(normalized)) {
      return { status: 'valid', original: String(input ?? ''), normalized, reason: 'lexicon-or-listed-morphology' };
    }
    return { status: 'unknown', original: String(input ?? ''), normalized, reason: 'not-in-local-lexicon' };
  };

  const validateWords = (inputWords) => {
    const results = [...new Set((inputWords ?? []).map(word => String(word ?? '')))].map(validateWord);
    const invalidWords = results.filter(result => result.status === 'invalid');
    const unknownWords = results.filter(result => result.status === 'unknown');
    const unavailableWords = results.filter(result => result.status === 'unavailable');
    return {
      status: invalidWords.length ? 'invalid' : unknownWords.length ? 'unknown' : unavailableWords.length ? 'unavailable' : 'valid',
      results,
      invalidWords,
      unknownWords,
      validWords: results.filter(result => result.status === 'valid'),
    };
  };

  return {
    ready: true,
    size: words.size,
    verbCount: verbRows.length,
    validateWord,
    validateWords,
  };
}

let loadPromise;
export function loadArabicDictionary(fetchImplementation = globalThis.fetch) {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        if (typeof fetchImplementation !== 'function') throw new Error('Fetch is not available');
        const url = new URL('./dictionary/ar-fusha.txt', import.meta.url);
        const response = await fetchImplementation(url);
        if (!response || !response.ok) throw new Error(`Dictionary request failed (${response?.status ?? 'no response'})`);
        const text = await response.text();
        const validator = createArabicWordValidator(text);
        if (validator.size === 0) throw new Error('Dictionary file is empty or unreadable');
        return validator;
      } catch (error) {
        return {
          ready: false,
          size: 0,
          verbCount: 0,
          error: String(error?.message ?? error),
          validateWord: input => ({ status: 'unavailable', original: String(input ?? ''), normalized: normalizeArabicWord(input), reason: 'dictionary-unavailable' }),
          validateWords: inputWords => {
            const results = (inputWords ?? []).map(input => ({ status: 'unavailable', original: String(input ?? ''), normalized: normalizeArabicWord(input), reason: 'dictionary-unavailable' }));
            return { status: 'unavailable', results, invalidWords: [], unknownWords: [], validWords: [] };
          },
        };
      }
    })();
  }
  return loadPromise;
}
