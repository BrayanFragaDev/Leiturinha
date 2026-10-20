import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mimeFor } from '../server.js';

test('mimeFor devolve o tipo certo por extensão', () => {
  const js = 'text/javascript; charset=utf-8';
  assert.equal(mimeFor('a.mjs'), js);
  assert.equal(mimeFor('a.js'), js);
  assert.equal(mimeFor('a.css'), 'text/css; charset=utf-8');
  assert.equal(mimeFor('a.html'), 'text/html; charset=utf-8');
  assert.equal(mimeFor('a.wasm'), 'application/wasm');
  assert.equal(mimeFor('a.bcmap'), 'application/octet-stream');
  assert.equal(mimeFor('a.xyz'), 'application/octet-stream');
});
