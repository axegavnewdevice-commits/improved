import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createArabicWordValidator, loadArabicDictionary, normalizeArabicWord } from '../word-validator.mjs'

const dictionary = await readFile(new URL('../dictionary/ar-fusha.txt', import.meta.url), 'utf8')
const validator = createArabicWordValidator(dictionary)

test('the reported valid word خلطت is accepted through the listed sound-verb morphology', () => {
  assert.equal(validator.validateWord('خلطت').status, 'valid')
})

test('common listed words and regular past forms are accepted', () => {
  for (const word of ['كتاب', 'كتب', 'كتبت', 'كتبا', 'خلط', 'خلطوا', 'يخلط', 'اخلط']) {
    assert.equal(validator.validateWord(word).status, 'valid', word)
  }
})

test('normalization strips diacritics and tatweel and maps alef variants', () => {
  assert.equal(normalizeArabicWord('أَكْتُبُـ'), 'اكتب')
  assert.equal(normalizeArabicWord('إِنَّ'), 'ان')
  // Spellings with ta marbuta/ha and alif maqsura/ya are not collapsed into each other.
  assert.notEqual(normalizeArabicWord('مدرسة'), normalizeArabicWord('مدرسه'))
  assert.notEqual(normalizeArabicWord('على'), normalizeArabicWord('علي'))
})

test('malformed tokens are rejected but absent lexical entries remain unknown', () => {
  assert.equal(validator.validateWord('١٢').status, 'invalid')
  assert.equal(validator.validateWord('not-arabic').status, 'invalid')
  assert.equal(validator.validateWord('كلمةغيرمدرجةفيالقاموس').status, 'unknown')
  assert.equal(validator.validateWords(['كلمةغيرمدرجةفيالقاموس']).status, 'unknown')
})

test('weak/hamzated roots are not blindly expanded into every suffix combination', () => {
  const compact = createArabicWordValidator('# words\n# VERBS\nبدأ|يبدأ|ابدأ\nقال|يقول|قل\n')
  assert.equal(compact.validateWord('بدأ').status, 'valid')
  assert.equal(compact.validateWord('بدأا').status, 'unknown')
  assert.equal(compact.validateWord('قالتما').status, 'unknown')
})

test('all formed words are checked and an unknown word prevents an all-valid result', () => {
  const result = validator.validateWords(['خلطت', 'كلمةغيرمدرجةفيالقاموس'])
  assert.equal(result.status, 'unknown')
  assert.equal(result.validWords.some(word => word.normalized === 'خلطت'), true)
  assert.equal(result.unknownWords.length, 1)
})

test('dictionary loader reads the UTF-8 text asynchronously and memoizes its result', async () => {
  let calls = 0
  const fakeFetch = async url => {
    calls += 1
    assert.match(String(url), /dictionary\/ar-fusha\.txt$/)
    return { ok: true, status: 200, text: async () => dictionary }
  }
  const loaded = await loadArabicDictionary(fakeFetch)
  const repeated = await loadArabicDictionary(async () => { throw new Error('must use cached promise') })
  assert.equal(loaded.ready, true)
  assert.ok(loaded.size > 5000)
  assert.equal(loaded.validateWord('خلطت').status, 'valid')
  assert.strictEqual(repeated, loaded)
  assert.equal(calls, 1)
})
