// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher, splitAlternatives } from '../answer.js';
import { alphabetFor } from '../alphabets.js';

test('Spanish: accents and capitals are ignored, the Ñ is not', () => {
  const m = createMatcher({ language: 'es' });
  assert.equal(m.matches('arbol', ['Árbol']), 0);
  assert.equal(m.matches('  ÁRBOL. ', ['árbol']), 0);
  assert.equal(m.matches('pinguino', ['Pingüino']), 0);
  assert.equal(m.matches('nino', ['Niño']), -1);
  assert.equal(m.matches('NIÑO', ['niño']), 0);
  assert.equal(m.matches('ano', ['año']), -1);
});

test('the tolerances can be turned off', () => {
  const strictAccents = createMatcher({ language: 'es', ignoreAccents: false });
  assert.equal(strictAccents.matches('arbol', ['Árbol']), -1);
  assert.equal(strictAccents.matches('árbol', ['Árbol']), 0);
  const strictCase = createMatcher({ language: 'es', ignoreCase: false });
  assert.equal(strictCase.matches('madrid', ['Madrid']), -1);
  assert.equal(strictCase.matches('Madríd', ['Madrid']), 0);
});

test('alternatives and empty answers', () => {
  const m = createMatcher({ language: 'es' });
  assert.deepEqual(splitAlternatives(' gafas / anteojos/ lentes /'), ['gafas', 'anteojos', 'lentes']);
  assert.equal(m.matches('lentes', ['Gafas', 'anteojos', 'lentes']), 2);
  assert.equal(m.matches('   ', ['a']), -1);
  assert.equal(m.matches('', ['']), -1);
});

test('spacing, apostrophes and punctuation at the ends', () => {
  const m = createMatcher({ language: 'en' });
  assert.equal(m.matches('ice   cream', ['Ice cream']), 0);
  assert.equal(m.matches('¿o’clock?', ["o'clock"]), 0);
  assert.equal(m.matches('C', ['C++']), -1);
});

test('German keeps the umlauts; Swedish folds Ü into Y; French opens the ligatures', () => {
  const de = createMatcher({ language: 'de' });
  assert.equal(de.matches('Bar', ['Bär']), -1);
  assert.equal(de.matches('STRAẞE', ['Straße']), 0);
  assert.equal(createMatcher({ language: 'sv' }).matches('Myller', ['Müller']), 0);
  assert.equal(createMatcher({ language: 'fr' }).matches('oeuf', ['œuf']), 0);
});

test('extra letters written by the author count as distinct', () => {
  const m = createMatcher({ language: 'other', extraLetters: 'ñ, ç' });
  assert.equal(m.matches('nino', ['niño']), -1);
  assert.equal(m.matches('placa', ['plaça']), -1);
  assert.equal(m.matches('cafe', ['café']), 0);
  assert.deepEqual(alphabetFor('nope').distinct, []);
});
