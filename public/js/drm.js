// Decide se um livro tem DRM. Regra pura (sem DOM): recebe o texto dos arquivos e o campo
// do cabeçalho que o adaptador leu.

// Algoritmos de ofuscação de fontes, que não são DRM e o foliate sabe desfazer.
export const FONT_OBFUSCATION = [
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
];

/** Valores de Algorithm de cada EncryptionMethod de um META-INF/encryption.xml. */
export function encryptionAlgorithms(xml) {
  if (typeof xml !== 'string') return [];
  const re = /<(?:[\w.-]+:)?EncryptionMethod\b[^>]*?\bAlgorithm\s*=\s*(["'])(.*?)\1/g;
  return [...xml.matchAll(re)].map((m) => m[2].trim());
}

/**
 * @param {{rightsXml?: string|null, encryptionXml?: string|null, mobiEncryption?: number|null}} input
 *   rightsXml: META-INF/rights.xml do ePub (null se não existe);
 *   encryptionXml: META-INF/encryption.xml do ePub (null se não existe);
 *   mobiEncryption: campo encryption do cabeçalho PalmDOC do MOBI/AZW3 (0 = sem criptografia).
 */
export function hasDrm({ rightsXml = null, encryptionXml = null, mobiEncryption = 0 } = {}) {
  if (rightsXml != null) return true;
  if (encryptionAlgorithms(encryptionXml).some((a) => !FONT_OBFUSCATION.includes(a))) return true;
  return mobiEncryption != null && Number(mobiEncryption) !== 0;
}

/** Erro que as telas reconhecem por `code === 'drm'`. */
export function drmError() {
  const err = new Error('Livro com DRM');
  err.code = 'drm';
  return err;
}
