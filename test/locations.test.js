import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPdfLocation, parsePdfLocation } from '../public/js/locations.js';

test('toPdfLocation monta o local', () => {
  assert.equal(toPdfLocation(3), 'pdf:3');
});

test('parsePdfLocation lê páginas válidas', () => {
  assert.equal(parsePdfLocation('pdf:3', 10), 3);
});

test('parsePdfLocation limita ao total de páginas', () => {
  assert.equal(parsePdfLocation('pdf:999', 10), 10);
  assert.equal(parsePdfLocation('pdf:0', 10), 1);
});

test('parsePdfLocation volta ao início quando inválido', () => {
  assert.equal(parsePdfLocation('pdf:abc', 10), 1);
  assert.equal(parsePdfLocation(null, 10), 1);
  assert.equal(parsePdfLocation('epubcfi(/6/4)', 10), 1);
});
