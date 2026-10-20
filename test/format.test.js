import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatPercent, formatSize } from '../public/js/format.js';

test('formatPercent arredonda a fração para porcentagem inteira', () => {
  assert.equal(formatPercent(0.456), '46%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(1), '100%');
});

test('formatPercent limita a 0–100', () => {
  assert.equal(formatPercent(1.7), '100%');
  assert.equal(formatPercent(-0.2), '0%');
});

test('formatPercent devolve 0% para NaN ou indefinido', () => {
  assert.equal(formatPercent(NaN), '0%');
  assert.equal(formatPercent(undefined), '0%');
});

test('formatSize mostra bytes abaixo de 1 KB', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1023), '1023 B');
});

test('formatSize usa vírgula e uma casa decimal', () => {
  assert.equal(formatSize(1536), '1,5 KB');
  assert.equal(formatSize(5 * 1024 ** 2), '5,0 MB');
  assert.equal(formatSize(3 * 1024 ** 3), '3,0 GB');
});

test('formatSize sobe de unidade quando o arredondamento chega a 1024', () => {
  assert.equal(formatSize(1048575), '1,0 MB');
});

test('formatDate usa toLocaleDateString pt-BR', () => {
  const ms = Date.UTC(2026, 0, 15, 12);
  assert.equal(formatDate(ms), new Date(ms).toLocaleDateString('pt-BR'));
});

test('formatDate devolve vazio para valor não finito', () => {
  assert.equal(formatDate(NaN), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate(Infinity), '');
});

test('formatSize arredonda bytes fracionários para baixo', () => {
  assert.equal(formatSize(1023.7), '1023 B');
  assert.equal(formatSize(0.9), '0 B');
});
