// Cor de fundo da capa gerada, derivada do id do livro. Regra pura (sem DOM).

/**
 * @param {string} id
 * @returns {string} cor HSL estável para o mesmo id
 */
export function coverColor(id) {
  let h = 0;
  for (const ch of String(id ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 45%, 38%)`;
}
