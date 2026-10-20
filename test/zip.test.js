import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeZip } from '../tools/zip.js';

test('makeZip gera ZIP sem compressão com cabeçalho local e EOCD', () => {
  const zip = makeZip([{ name: 'mimetype', data: 'application/epub+zip' }]);
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(zip.slice(30, 30 + 8 + 20));
  assert.equal(text, 'mimetypeapplication/epub+zip');
  const eocd = zip.length - 22;
  assert.deepEqual([...zip.slice(eocd, eocd + 4)], [0x50, 0x4b, 0x05, 0x06]);
});
