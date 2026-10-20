// Preferências de tema e fonte, guardadas no localStorage.
// Regra pura: o storage entra por parâmetro. Nunca lança erro.

const KEY = 'leitor:prefs';
const DEFAULT = { tema: 'claro', fonte: 18 };
export const TEMAS = ['claro', 'sepia', 'escuro'];

/**
 * Arredonda para o par mais próximo e limita a 14–28. Não numérico vira 18.
 * @param {unknown} n
 * @returns {number}
 */
export function clampFont(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT.fonte;
  const even = 2 * Math.round(n / 2);
  return Math.min(28, Math.max(14, even));
}

function normalize(value) {
  const o = value && typeof value === 'object' ? value : {};
  return {
    tema: TEMAS.includes(o.tema) ? o.tema : DEFAULT.tema,
    fonte: clampFont(o.fonte),
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * @param {Storage} [storage]
 * @returns {{tema: string, fonte: number}}
 */
export function loadPrefs(storage = defaultStorage()) {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return normalize(null);
    return normalize(JSON.parse(raw));
  } catch {
    return normalize(null);
  }
}

/**
 * @param {{tema?: string, fonte?: number}} prefs
 * @param {Storage} [storage]
 */
export function savePrefs(prefs, storage = defaultStorage()) {
  try {
    storage.setItem(KEY, JSON.stringify(normalize(prefs)));
  } catch {
    // Sem storage: a preferência vale só para esta sessão.
  }
}
