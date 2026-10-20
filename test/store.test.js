import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../public/js/memory-store.js';
import { createStore } from '../public/js/store.js';

for (const name of ['books', 'files', 'bookmarks']) {
  test(`memória: put/get/getAll/delete em ${name}`, async () => {
    const s = createMemoryStore();
    assert.equal(s.persistent, false);
    const v = { id: 'a', n: 1 };
    await s.put(name, v);
    await s.put(name, { id: 'b', n: 2 });
    v.n = 99; // mutar depois do put não altera o armazenado
    const got = await s.get(name, 'a');
    assert.deepEqual(got, { id: 'a', n: 1 });
    got.n = 5; // get devolve cópia
    assert.equal((await s.get(name, 'a')).n, 1);
    assert.equal((await s.getAll(name)).length, 2);
    await s.delete(name, 'a');
    assert.equal(await s.get(name, 'a'), undefined);
    assert.equal((await s.getAll(name)).length, 1);
  });
}

test('memória: usage soma o tamanho dos blobs em files', async () => {
  const s = createMemoryStore();
  await s.put('files', { id: 'f', blob: new Blob([new Uint8Array(10)]) });
  assert.deepEqual(await s.usage(), { usedBytes: 10, quotaBytes: null });
});

test('createStore sem indexedDB cai na memória', async () => {
  assert.equal((await createStore({})).persistent, false);
});

test('createStore com indexedDB que lança cai na memória', async () => {
  const env = { indexedDB: { open() { throw new Error('x'); } } };
  assert.equal((await createStore(env)).persistent, false);
});
