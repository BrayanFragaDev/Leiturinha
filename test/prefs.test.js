import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampFont, loadPrefs, savePrefs } from '../public/js/prefs.js';

const KEY = 'leitor:prefs';
const DEFAULT = { tema: 'claro', fonte: 18 };

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

function throwingStorage() {
  const fail = () => {
    throw new Error('storage indisponível');
  };
  return { getItem: fail, setItem: fail };
}

test('clampFont arredonda para o par mais próximo dentro de 14–28', () => {
  assert.equal(clampFont(13), 14);
  assert.equal(clampFont(29), 28);
  assert.equal(clampFont(19), 20);
  assert.equal(clampFont(17), 18);
  assert.equal(clampFont(15), 16);
  assert.equal(clampFont(18), 18);
  assert.equal(clampFont(0), 14);
  assert.equal(clampFont(100), 28);
});

test('clampFont devolve 18 para valor não numérico', () => {
  assert.equal(clampFont(NaN), 18);
  assert.equal(clampFont(undefined), 18);
  assert.equal(clampFont('abc'), 18);
});

test('loadPrefs sem nada salvo devolve o padrão', () => {
  assert.deepEqual(loadPrefs(fakeStorage()), DEFAULT);
});

test('loadPrefs com getItem que lança erro devolve o padrão', () => {
  assert.deepEqual(loadPrefs(throwingStorage()), DEFAULT);
});

test('loadPrefs com storage nulo devolve o padrão', () => {
  assert.deepEqual(loadPrefs(null), DEFAULT);
});

test('loadPrefs com JSON inválido devolve o padrão', () => {
  assert.deepEqual(loadPrefs(fakeStorage({ [KEY]: '{não é json' })), DEFAULT);
  assert.deepEqual(loadPrefs(fakeStorage({ [KEY]: 'null' })), DEFAULT);
});

test('loadPrefs com tema \'roxo\' volta para \'claro\'', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ tema: 'roxo', fonte: 22 }) });
  assert.deepEqual(loadPrefs(storage), { tema: 'claro', fonte: 22 });
});

test('loadPrefs lê tema e fonte válidos e corrige a fonte', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ tema: 'sepia', fonte: 13 }) });
  assert.deepEqual(loadPrefs(storage), { tema: 'sepia', fonte: 14 });
});

test('loadPrefs com fonte não numérica usa 18', () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ tema: 'escuro', fonte: 'grande' }) });
  assert.deepEqual(loadPrefs(storage), { tema: 'escuro', fonte: 18 });
});

test('savePrefs grava JSON na chave leitor:prefs', () => {
  const storage = fakeStorage();
  savePrefs({ tema: 'escuro', fonte: 22 }, storage);
  assert.deepEqual(JSON.parse(storage.data.get(KEY)), { tema: 'escuro', fonte: 22 });
});

test('savePrefs e loadPrefs se completam', () => {
  const storage = fakeStorage();
  savePrefs({ tema: 'sepia', fonte: 26 }, storage);
  assert.deepEqual(loadPrefs(storage), { tema: 'sepia', fonte: 26 });
});

test('savePrefs não lança erro quando o storage falha', () => {
  assert.doesNotThrow(() => savePrefs({ tema: 'escuro', fonte: 20 }, throwingStorage()));
  assert.doesNotThrow(() => savePrefs({ tema: 'escuro', fonte: 20 }, null));
});
