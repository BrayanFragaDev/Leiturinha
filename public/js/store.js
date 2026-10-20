import { createMemoryStore } from './memory-store.js';
import { openIdbStore } from './idb-store.js';

// Tenta IndexedDB; se faltar ou falhar, usa memória (modo temporário).
export async function createStore(env = globalThis) {
  try {
    if (env.indexedDB) return await openIdbStore(env.indexedDB);
  } catch {
    // cai na memória
  }
  return createMemoryStore();
}
