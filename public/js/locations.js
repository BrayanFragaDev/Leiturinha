// Locais de leitura de PDF: "pdf:<página>" (base 1). Regras puras (sem DOM).

/** @param {number} page */
export function toPdfLocation(page) {
  return `pdf:${page}`;
}

/**
 * @param {string|null} loc
 * @param {number} numPages
 * @returns {number} página entre 1 e numPages; local inválido volta à página 1
 */
export function parsePdfLocation(loc, numPages) {
  const m = typeof loc === 'string' ? /^pdf:(\d+)$/.exec(loc) : null;
  if (!m) return 1;
  const page = Number(m[1]);
  return Math.min(Math.max(1, page), Math.max(1, numPages));
}
