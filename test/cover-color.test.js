import test from 'node:test';
import assert from 'node:assert/strict';
import { coverColor } from '../public/js/cover-color.js';

test('coverColor é estável e varia com o id', () => {
  assert.equal(coverColor('abc'), coverColor('abc'));
  assert.notEqual(coverColor('abc'), coverColor('abd'));
  assert.match(coverColor('abc'), /^hsl\(\d{1,3}, 45%, 38%\)$/);
  assert.match(coverColor(undefined), /^hsl\(/);
});
