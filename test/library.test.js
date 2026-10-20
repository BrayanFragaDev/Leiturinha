import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../public/js/memory-store.js';
import { createLibrary, LibraryError, sha256Hex } from '../public/js/library.js';
import { buildFixtures } from '../tools/make-fixtures.js';

const fx = buildFixtures();
const file = (name) => new File([fx[name]], name);
const NOW = 1_700_000_000_000;
const setup = (opts = {}) => {
  const store = createMemoryStore();
  return { store, lib: createLibrary(store, { now: () => NOW, ...opts }) };
};
// Cada chamada com texto diferente gera um PDF com hash diferente.
const fake = (name, text) => new File([new TextEncoder().encode(`%PDF-1.4 ${text}`)], name);
const quota = () => Object.assign(new Error('cheio'), { name: 'QuotaExceededError' });

test('importar amostra.epub com meta lista 1 livro epub', async () => {
  const { lib } = setup();
  const { book, duplicate } = await lib.addFile(file('amostra.epub'), { title: 'Livro de Amostra' });
  assert.equal(duplicate, false);
  assert.equal(book.id, await sha256Hex(file('amostra.epub')));
  const all = await lib.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].format, 'epub');
  assert.equal(all[0].title, 'Livro de Amostra');
  assert.equal(all[0].author, '');
  assert.equal(all[0].addedAt, NOW);
  assert.equal(all[0].lastOpenedAt, null);
  assert.equal(all[0].location, null);
  assert.equal(all[0].fraction, 0);
});

test('título padrão é o nome sem extensão; meta vazia mantém o padrão', async () => {
  const { lib } = setup();
  const { book } = await lib.addFile(file('amostra.pdf'), { title: '', author: undefined });
  assert.equal(book.title, 'amostra');
  assert.equal(book.author, '');
});

test('importar o mesmo arquivo de novo devolve duplicate e não regrava', async () => {
  const { lib, store } = setup();
  const first = await lib.addFile(file('amostra.epub'));
  let puts = 0;
  const orig = store.put;
  store.put = (...a) => { puts++; return orig(...a); };
  const again = await lib.addFile(file('amostra.epub'), { title: 'Outro' });
  assert.equal(again.duplicate, true);
  assert.equal(again.book.id, first.book.id);
  assert.equal(again.book.title, 'amostra');
  assert.equal(puts, 0);
  assert.equal((await lib.list()).length, 1);
});

test('falso.pdf é recusado e nada é gravado', async () => {
  const { lib, store } = setup();
  await assert.rejects(lib.addFile(file('falso.pdf')), (e) => e instanceof LibraryError && e.code === 'unsupported');
  assert.equal((await store.getAll('books')).length, 0);
  assert.equal((await store.getAll('files')).length, 0);
});

test('cota estourada no put de files: code quota e nada gravado', async () => {
  const { lib, store } = setup();
  const orig = store.put;
  store.put = (name, v) => (name === 'files' ? Promise.reject(quota()) : orig(name, v));
  await assert.rejects(lib.addFile(file('amostra.pdf')), (e) => e instanceof LibraryError && e.code === 'quota');
  assert.equal((await store.getAll('books')).length, 0);
  assert.equal((await store.getAll('files')).length, 0);
});

test('cota estourada no put de books: limpa files', async () => {
  const { lib, store } = setup();
  const orig = store.put;
  store.put = (name, v) => (name === 'books' ? Promise.reject(quota()) : orig(name, v));
  await assert.rejects(lib.addFile(file('amostra.pdf')), (e) => e instanceof LibraryError && e.code === 'quota');
  assert.equal((await store.getAll('books')).length, 0);
  assert.equal((await store.getAll('files')).length, 0);
});

test('outro erro de gravação é relançado como está, mesmo se a limpeza falhar', async () => {
  const { lib, store } = setup();
  const orig = store.put;
  const boom = new Error('boom');
  store.put = (name, v) => (name === 'books' ? Promise.reject(boom) : orig(name, v));
  store.delete = () => Promise.reject(new Error('limpeza falhou'));
  await assert.rejects(lib.addFile(file('amostra.pdf')), (e) => e === boom);
});

test('outro erro de gravação limpa o que foi gravado', async () => {
  const { lib, store } = setup();
  const orig = store.put;
  store.put = (name, v) => (name === 'books' ? Promise.reject(new Error('boom')) : orig(name, v));
  await assert.rejects(lib.addFile(file('amostra.pdf')), /boom/);
  assert.equal((await store.getAll('files')).length, 0);
});

test('ordenação titulo: Ábaco, Beta, zeta', async () => {
  const { lib } = setup();
  await lib.addFile(fake('a.pdf', 1), { title: 'zeta' });
  await lib.addFile(fake('b.pdf', 2), { title: 'Beta' });
  await lib.addFile(fake('c.pdf', 3), { title: 'Ábaco' });
  const titles = (await lib.list({ sort: 'titulo' })).map((b) => b.title);
  assert.deepEqual(titles, ['Ábaco', 'Beta', 'zeta']);
});

test('query abaco encontra Ábaco (título ou autor, sem acento nem caixa)', async () => {
  const { lib } = setup();
  await lib.addFile(fake('a.pdf', 1), { title: 'Ábaco' });
  await lib.addFile(fake('b.pdf', 2), { title: 'Beta', author: 'José' });
  assert.deepEqual((await lib.list({ query: 'abaco' })).map((b) => b.title), ['Ábaco']);
  assert.deepEqual((await lib.list({ query: 'JOSE' })).map((b) => b.title), ['Beta']);
});

test('recentes usa lastOpenedAt ?? addedAt; adicionados usa addedAt decrescente', async () => {
  let t = 1000;
  const { lib } = setup({ now: () => t });
  const a = (await lib.addFile(fake('a.pdf', 1))).book;
  t = 2000;
  const b = (await lib.addFile(fake('b.pdf', 2))).book;
  assert.deepEqual((await lib.list()).map((x) => x.id), [b.id, a.id]);
  t = 3000;
  await lib.markOpened(a.id);
  assert.deepEqual((await lib.list({ sort: 'recentes' })).map((x) => x.id), [a.id, b.id]);
  assert.deepEqual((await lib.list({ sort: 'adicionados' })).map((x) => x.id), [b.id, a.id]);
  assert.equal((await lib.get(a.id)).lastOpenedAt, 3000);
});

test('saveProgress e get; fraction limitada a 0..1 e NaN vira 0', async () => {
  const { lib } = setup();
  const { book } = await lib.addFile(file('amostra.pdf'));
  await lib.saveProgress(book.id, { location: 'pdf:2', fraction: 0.4 });
  const got = await lib.get(book.id);
  assert.equal(got.location, 'pdf:2');
  assert.equal(got.fraction, 0.4);
  await lib.saveProgress(book.id, { location: 'pdf:3', fraction: 7 });
  assert.equal((await lib.get(book.id)).fraction, 1);
  await lib.saveProgress(book.id, { location: 'pdf:3', fraction: -1 });
  assert.equal((await lib.get(book.id)).fraction, 0);
  await lib.saveProgress(book.id, { location: 'pdf:3', fraction: NaN });
  assert.equal((await lib.get(book.id)).fraction, 0);
});

test('remove apaga livro, arquivo e marcadores', async () => {
  const { lib, store } = setup();
  const { book } = await lib.addFile(file('amostra.pdf'));
  const other = (await lib.addFile(file('amostra.epub'))).book;
  await lib.addBookmark(book.id, { location: 'pdf:1', label: 'a' });
  await lib.addBookmark(book.id, { location: 'pdf:2', label: 'b' });
  await lib.addBookmark(other.id, { location: 'x', label: 'c' });
  await lib.remove(book.id);
  assert.equal(await store.get('books', book.id), undefined);
  assert.equal(await store.get('files', book.id), undefined);
  assert.equal((await lib.listBookmarks(book.id)).length, 0);
  assert.equal((await lib.listBookmarks(other.id)).length, 1);
  assert.equal((await lib.list()).length, 1);
});

test('marcadores: id, createdAt, ordem e remoção', async () => {
  let t = 10;
  const { lib } = setup({ now: () => t });
  const { book } = await lib.addFile(file('amostra.pdf'));
  t = 30;
  const b1 = await lib.addBookmark(book.id, { location: 'pdf:1', label: 'um' });
  t = 20;
  const b2 = await lib.addBookmark(book.id, { location: 'pdf:2', label: 'dois' });
  assert.notEqual(b1.id, b2.id);
  assert.equal(b1.bookId, book.id);
  assert.equal(b1.createdAt, 30);
  assert.deepEqual((await lib.listBookmarks(book.id)).map((b) => b.label), ['dois', 'um']);
  await lib.removeBookmark(b1.id);
  assert.deepEqual((await lib.listBookmarks(book.id)).map((b) => b.label), ['dois']);
});

test('id inexistente: not-found em get, getFile, updateMeta, markOpened e saveProgress', async () => {
  const { lib } = setup();
  const nf = (e) => e instanceof LibraryError && e.code === 'not-found';
  await assert.rejects(lib.get('x'), nf);
  await assert.rejects(lib.getFile('x'), nf);
  await assert.rejects(lib.updateMeta('x', { title: 't' }), nf);
  await assert.rejects(lib.markOpened('x'), nf);
  await assert.rejects(lib.saveProgress('x', { location: 'a', fraction: 0 }), nf);
});

test('getFile devolve o blob e updateMeta altera só campos definidos', async () => {
  const { lib } = setup();
  const { book } = await lib.addFile(file('amostra.pdf'));
  const blob = await lib.getFile(book.id);
  assert.equal(blob.size, fx['amostra.pdf'].length);
  const up = await lib.updateMeta(book.id, { author: 'Ana', cover: new Blob(['c']) });
  assert.equal(up.author, 'Ana');
  assert.equal(up.title, 'amostra');
  assert.equal((await lib.get(book.id)).cover.size, 1);
});
