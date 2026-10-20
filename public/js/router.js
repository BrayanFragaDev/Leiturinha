// Rotas por hash: '#/' é a biblioteca e '#/ler/<id>' é a leitura.
// Regra pura (sem DOM).

const READ_PREFIX = '#/ler/';

/**
 * @param {string} hash por exemplo location.hash
 * @returns {{view: 'biblioteca'} | {view: 'leitura', id: string}}
 */
export function parseRoute(hash) {
  if (typeof hash === 'string' && hash.startsWith(READ_PREFIX)) {
    try {
      const id = decodeURIComponent(hash.slice(READ_PREFIX.length));
      if (id !== '') return { view: 'leitura', id };
    } catch {
      // Id com codificação inválida: cai na biblioteca.
    }
  }
  return { view: 'biblioteca' };
}

/**
 * @param {'biblioteca' | 'leitura'} view
 * @param {string} [id]
 * @returns {string} hash para atribuir a location.hash
 */
export function routeTo(view, id) {
  if (view === 'leitura' && id) return READ_PREFIX + encodeURIComponent(id);
  return '#/';
}
