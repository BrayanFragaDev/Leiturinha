import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPT, detectFormat } from '../public/js/formats.js';
import { buildFixtures } from '../tools/make-fixtures.js';

const fixtures = buildFixtures();
const head = (bytes) => bytes.subarray(0, 4096);
const ascii = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));

test('ACCEPT é a lista de formatos das restrições globais', () => {
  assert.equal(ACCEPT, '.pdf,.epub,.mobi,.azw3,.azw,.fb2,.fbz,.cbz');
});

test('detectFormat reconhece as fixtures de exemplo', () => {
  assert.equal(detectFormat('amostra.pdf', head(fixtures['amostra.pdf'])), 'pdf');
  assert.equal(detectFormat('amostra.epub', head(fixtures['amostra.epub'])), 'epub');
  assert.equal(detectFormat('amostra.cbz', head(fixtures['amostra.cbz'])), 'cbz');
});

test('detectFormat recusa um arquivo falso com extensão .pdf', () => {
  assert.equal(detectFormat('falso.pdf', head(fixtures['falso.pdf'])), null);
});

test('detectFormat reconhece MOBI pelos bytes 60–67, mesmo com extensão .azw3', () => {
  const bytes = new Uint8Array(68);
  bytes.set(ascii('BOOKMOBI'), 60);
  assert.equal(detectFormat('x.azw3', bytes), 'mobi');
});

test('detectFormat reconhece FB2 pelo texto <FictionBook', () => {
  const bytes = ascii('<?xml version="1.0"?><FictionBook>');
  assert.equal(detectFormat('x.fb2', bytes), 'fb2');
});

test('detectFormat recusa ZIP sem mimetype mesmo com extensão .epub', () => {
  const zip = ascii('PK\u0003\u0004' + '\u0000'.repeat(60));
  assert.equal(detectFormat('x.epub', zip), null);
});

test('detectFormat aceita .cbz e .fbz em maiúsculas', () => {
  const zip = fixtures['amostra.cbz'];
  assert.equal(detectFormat('AMOSTRA.CBZ', head(zip)), 'cbz');
  assert.equal(detectFormat('X.FBZ', head(zip)), 'fb2');
});

test('detectFormat não lança com head menor que o necessário', () => {
  assert.equal(detectFormat('x.pdf', new Uint8Array(0)), null);
  assert.equal(detectFormat('x.azw3', ascii('BOOK')), null);
  assert.equal(detectFormat('x.epub', ascii('PK\u0003\u0004')), null);
  assert.equal(detectFormat('x.cbz', ascii('PK\u0003\u0004')), 'cbz');
});
