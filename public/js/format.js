// Formatação de porcentagem, tamanho e data para a interface em pt-BR.
// Regras puras (sem DOM).

const UNITS = ['KB', 'MB', 'GB'];

/**
 * @param {number} f fração de 0 a 1
 * @returns {string} porcentagem inteira entre 0% e 100%
 */
export function formatPercent(f) {
  if (typeof f !== 'number' || Number.isNaN(f)) return '0%';
  return `${Math.min(100, Math.max(0, Math.round(f * 100)))}%`;
}

/**
 * @param {number} bytes
 * @returns {string} por exemplo "512 B", "1,5 KB", "5,0 MB"
 */
export function formatSize(bytes) {
  const n = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (n < 1024) return `${n} B`;

  let value = n;
  let unit = -1;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  // Se o arredondamento chegar a 1024, sobe para a unidade seguinte.
  if (Number(value.toFixed(1)) >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1).replace('.', ',')} ${UNITS[unit]}`;
}

/**
 * @param {number} ms timestamp em milissegundos
 * @returns {string} data no formato local pt-BR
 */
export function formatDate(ms) {
  return new Date(ms).toLocaleDateString('pt-BR');
}
