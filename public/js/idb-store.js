// Armazenamento persistente em IndexedDB. Verificado só no navegador.
const NAMES = ['books', 'files', 'bookmarks'];

function openDb(idb) {
  return new Promise((resolve, reject) => {
    const req = idb.open('leitor', 1);
    req.onupgradeneeded = () => {
      for (const n of NAMES) {
        if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
  });
}

export async function openIdbStore(idb) {
  const db = await openDb(idb);

  // Roda uma operação numa transação e resolve ao concluir (complete).
  // Erros chegam pelo request, pela transação (error) ou por abort; o original é preservado.
  const run = (name, mode, op) =>
    new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(name, mode);
        const req = op(tx.objectStore(name));
        let result;
        req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || req.error);
        tx.onabort = () => reject(tx.error || req.error || new Error('Transação abortada'));
      } catch (err) {
        reject(err);
      }
    });

  return {
    persistent: true,
    put: (name, value) => run(name, 'readwrite', (s) => s.put(value)).then(() => undefined),
    get: (name, id) => run(name, 'readonly', (s) => s.get(id)),
    getAll: (name) => run(name, 'readonly', (s) => s.getAll()),
    delete: (name, id) => run(name, 'readwrite', (s) => s.delete(id)).then(() => undefined),
    async usage() {
      try {
        const est = await navigator.storage.estimate();
        return { usedBytes: est.usage ?? 0, quotaBytes: est.quota ?? null };
      } catch {
        return { usedBytes: 0, quotaBytes: null };
      }
    },
  };
}
