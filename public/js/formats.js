// Detecção de formato pelos bytes do início do arquivo. A extensão só desempata ZIP.
// Regra pura (sem DOM): recebe o nome e os primeiros bytes.

export const ACCEPT = '.pdf,.epub,.mobi,.azw3,.azw,.fb2,.fbz,.cbz';

const EPUB_MIMETYPE = 'mimetypeapplication/epub+zip';

function hasAscii(bytes, offset, text) {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * @param {string} name nome do arquivo, usado só para desempatar ZIP
 * @param {Uint8Array} head primeiros 4096 bytes (pode ser menor)
 * @returns {'pdf'|'epub'|'mobi'|'fb2'|'cbz'|null}
 */
export function detectFormat(name, head) {
  const bytes = head ?? new Uint8Array(0);
  const lowerName = String(name ?? '').toLowerCase();

  if (hasAscii(bytes, 0, '%PDF-')) return 'pdf';

  if (hasAscii(bytes, 0, 'PK\u0003\u0004')) {
    if (hasAscii(bytes, 30, EPUB_MIMETYPE)) return 'epub';
    if (lowerName.endsWith('.cbz')) return 'cbz';
    if (lowerName.endsWith('.fbz')) return 'fb2';
    return null;
  }

  if (hasAscii(bytes, 60, 'BOOKMOBI')) return 'mobi';

  if (new TextDecoder().decode(bytes).includes('<FictionBook')) return 'fb2';

  return null;
}
