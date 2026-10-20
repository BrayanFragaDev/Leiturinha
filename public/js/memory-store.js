// Armazenamento em memória: mesma interface do IndexedDB, mas some ao recarregar.
const NAMES = ['books', 'files', 'bookmarks'];

export function createMemoryStore() {
  const data = Object.fromEntries(NAMES.map((n) => [n, new Map()]));
  const table = (name) => {
    if (!data[name]) throw new Error(`Store desconhecido: ${name}`);
    return data[name];
  };
  return {
    persistent: false,
    async put(name, value) {
      table(name).set(value.id, { ...value }); // cópia rasa, como o structured clone
    },
    async get(name, id) {
      const v = table(name).get(id);
      return v && { ...v };
    },
    async getAll(name) {
      return [...table(name).values()].map((v) => ({ ...v }));
    },
    async delete(name, id) {
      table(name).delete(id);
    },
    async usage() {
      let usedBytes = 0;
      for (const v of data.files.values()) usedBytes += v.blob?.size ?? 0;
      return { usedBytes, quotaBytes: null };
    },
  };
}
