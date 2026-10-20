// Regras da biblioteca: importar, listar, progresso e marcadores. Sem DOM.
import { detectFormat } from './formats.js';

const MESSAGES = {
  unsupported: 'Formato não suportado.',
  quota: 'Sem espaço de armazenamento.',
  'not-found': 'Livro não encontrado.',
};

export class LibraryError extends Error {
  constructor(code, message) {
    super(message ?? MESSAGES[code] ?? code);
    this.name = 'LibraryError';
    this.code = code;
  }
}

export async function sha256Hex(blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stripExt = (name) => name.replace(/\.[^./\\]+$/, '');

// Copia só os campos de meta com valor definido (título vazio mantém o padrão).
function applyMeta(book, meta = {}) {
  if (meta.title) book.title = meta.title;
  if (meta.author !== undefined && meta.author !== null) book.author = meta.author;
  if (meta.cover !== undefined) book.cover = meta.cover;
  return book;
}

export function createLibrary(store, { now = Date.now, hash = sha256Hex } = {}) {
  async function get(id) {
    const book = await store.get('books', id);
    if (!book) throw new LibraryError('not-found');
    return book;
  }

  async function addFile(file, meta) {
    const id = await hash(file);
    const existing = await store.get('books', id);
    if (existing) return { book: existing, duplicate: true };

    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const format = detectFormat(file.name, head);
    if (!format) throw new LibraryError('unsupported');

    const book = applyMeta(
      {
        id, title: stripExt(file.name), author: '', format, size: file.size,
        addedAt: now(), lastOpenedAt: null, cover: null, location: null, fraction: 0,
      },
      meta,
    );
    try {
      await store.put('files', { id, blob: file });
      await store.put('books', book);
    } catch (err) {
      for (const name of ['books', 'files']) {
        try { await store.delete(name, id); } catch { /* limpeza best-effort */ }
      }
      if (err?.name === 'QuotaExceededError') throw new LibraryError('quota');
      throw err;
    }
    return { book, duplicate: false };
  }

  async function list({ sort = 'recentes', query = '' } = {}) {
    let books = await store.getAll('books');
    const q = fold(query).trim();
    if (q) books = books.filter((b) => fold(b.title).includes(q) || fold(b.author).includes(q));
    const by = {
      recentes: (a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt),
      adicionados: (a, b) => b.addedAt - a.addedAt,
      titulo: (a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }),
    };
    return books.sort(by[sort] ?? by.recentes);
  }

  async function getFile(id) {
    const rec = await store.get('files', id);
    if (!rec) throw new LibraryError('not-found');
    return rec.blob;
  }

  async function updateMeta(id, meta) {
    const book = applyMeta(await get(id), meta);
    await store.put('books', book);
    return book;
  }

  async function markOpened(id) {
    const book = await get(id);
    book.lastOpenedAt = now();
    await store.put('books', book);
  }

  async function saveProgress(id, { location, fraction }) {
    const book = await get(id);
    const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
    book.location = location;
    book.fraction = f;
    await store.put('books', book);
  }

  async function listBookmarks(bookId) {
    const all = await store.getAll('bookmarks');
    return all.filter((m) => m.bookId === bookId).sort((a, b) => a.createdAt - b.createdAt);
  }

  async function remove(id) {
    for (const m of await listBookmarks(id)) await store.delete('bookmarks', m.id);
    await store.delete('files', id);
    await store.delete('books', id);
  }

  async function addBookmark(bookId, { location, label }) {
    const bookmark = { id: crypto.randomUUID(), bookId, location, label, createdAt: now() };
    await store.put('bookmarks', bookmark);
    return bookmark;
  }

  async function removeBookmark(id) {
    await store.delete('bookmarks', id);
  }

  return {
    addFile, list, get, getFile, updateMeta, markOpened, saveProgress,
    remove, addBookmark, listBookmarks, removeBookmark,
  };
}
