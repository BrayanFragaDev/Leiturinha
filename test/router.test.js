import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeTo } from '../public/js/router.js';

test('parseRoute de #/ler/<id> dá leitura com o id', () => {
  assert.deepEqual(parseRoute('#/ler/abc'), { view: 'leitura', id: 'abc' });
});

test('parseRoute decodifica o id', () => {
  assert.deepEqual(parseRoute('#/ler/a%20b'), { view: 'leitura', id: 'a b' });
});

test('parseRoute com id mal formado dá biblioteca', () => {
  assert.deepEqual(parseRoute('#/ler/%E0%A4%A'), { view: 'biblioteca' });
});

test('parseRoute sem id dá biblioteca', () => {
  assert.deepEqual(parseRoute('#/ler/'), { view: 'biblioteca' });
});

test('parseRoute de qualquer outro valor dá biblioteca', () => {
  assert.deepEqual(parseRoute('#/'), { view: 'biblioteca' });
  assert.deepEqual(parseRoute(''), { view: 'biblioteca' });
  assert.deepEqual(parseRoute('#/outra'), { view: 'biblioteca' });
  assert.deepEqual(parseRoute(undefined), { view: 'biblioteca' });
});

test('routeTo biblioteca devolve #/', () => {
  assert.equal(routeTo('biblioteca'), '#/');
});

test('routeTo leitura devolve #/ler/<id> com o id codificado', () => {
  assert.equal(routeTo('leitura', 'abc'), '#/ler/abc');
  assert.equal(routeTo('leitura', 'a b/c'), '#/ler/a%20b%2Fc');
});

test('routeTo e parseRoute são inversos para ids com caracteres especiais', () => {
  const id = 'livro 1/ção?x=y';
  assert.deepEqual(parseRoute(routeTo('leitura', id)), { view: 'leitura', id });
});
