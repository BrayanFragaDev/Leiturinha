// Gera arquivos de exemplo em fixtures/. Os testes importam buildFixtures().
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crc32, makeZip } from './zip.js';

const latin1 = (s) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
const utf8 = (s) => new TextEncoder().encode(s);

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

// PDF 1.4 escrito à mão. Os offsets do xref são calculados durante a montagem.
function buildPdf() {
  const pages = 3;
  const bodies = new Map(); // número do objeto -> bytes do corpo
  const kids = [];
  bodies.set(1, latin1('<< /Type /Catalog /Pages 2 0 R >>'));
  bodies.set(3, latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  for (let i = 1; i <= pages; i++) {
    const pageNum = 3 + i * 2 - 1;
    const contentNum = pageNum + 1;
    kids.push(`${pageNum} 0 R`);
    // "á" em WinAnsiEncoding é o byte único 0xE1.
    const stream = latin1(`BT /F1 24 Tf 72 700 Td (P\xe1gina ${i}) Tj ET`);
    bodies.set(
      pageNum,
      latin1(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`,
      ),
    );
    bodies.set(
      contentNum,
      concat([latin1(`<< /Length ${stream.length} >>\nstream\n`), stream, latin1('\nendstream')]),
    );
  }
  bodies.set(2, latin1(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`));

  const total = 3 + pages * 2;
  const parts = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let length = parts[0].length;
  const offsets = [];
  for (let n = 1; n <= total; n++) {
    offsets[n] = length;
    const obj = concat([latin1(`${n} 0 obj\n`), bodies.get(n), latin1('\nendobj\n')]);
    parts.push(obj);
    length += obj.length;
  }
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= total; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`;
  parts.push(latin1(xref));
  return concat(parts);
}

const DEFAULT_CAP1 =
  `<h1>Capítulo 1</h1>\n<p>Era uma vez um leitor curioso que abriu o primeiro capítulo numa tarde tranquila.</p>`;

// cap1: corpo do capítulo 1; extra: entradas a mais no zip (ex.: META-INF/encryption.xml).
function buildEpub({ cap1 = DEFAULT_CAP1, extra = [] } = {}) {
  const xhtml = (title, body) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="pt-BR">\n` +
    `<head><meta charset="utf-8"/><title>${title}</title></head>\n<body>\n${body}\n</body>\n</html>\n`;

  return makeZip([
    { name: 'mimetype', data: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      data:
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n` +
        `  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n` +
        `</container>\n`,
    },
    {
      name: 'OEBPS/content.opf',
      data:
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="pt-BR">\n` +
        `  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n` +
        `    <dc:identifier id="bookid">urn:uuid:5f0c1b7e-3a1d-4c55-9a3e-0a7d9c6b2e11</dc:identifier>\n` +
        `    <dc:title>Livro de Amostra</dc:title>\n` +
        `    <dc:creator>Autora Teste</dc:creator>\n` +
        `    <dc:language>pt-BR</dc:language>\n` +
        `    <meta property="dcterms:modified">2024-01-01T00:00:00Z</meta>\n` +
        `  </metadata>\n` +
        `  <manifest>\n` +
        `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n` +
        `    <item id="cap1" href="cap1.xhtml" media-type="application/xhtml+xml"/>\n` +
        `    <item id="cap2" href="cap2.xhtml" media-type="application/xhtml+xml"/>\n` +
        `  </manifest>\n` +
        `  <spine>\n    <itemref idref="cap1"/>\n    <itemref idref="cap2"/>\n  </spine>\n` +
        `</package>\n`,
    },
    {
      name: 'OEBPS/nav.xhtml',
      data: xhtml(
        'Sumário',
        `<nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>\n` +
          `<li><a href="cap1.xhtml">Capítulo 1</a></li>\n` +
          `<li><a href="cap2.xhtml">Capítulo 2</a></li>\n</ol></nav>`,
      ),
    },
    {
      name: 'OEBPS/cap1.xhtml',
      data: xhtml('Capítulo 1', cap1),
    },
    {
      name: 'OEBPS/cap2.xhtml',
      data: xhtml(
        'Capítulo 2',
        `<h1>Capítulo 2</h1>\n<p>No segundo capítulo, um girassol cresceu devagar ao lado da janela.</p>`,
      ),
    },
    ...extra,
  ]);
}

// ePub com DRM: rights.xml (Adobe ADEPT) e capítulo cifrado com AES no encryption.xml.
function buildDrmEpub() {
  return buildEpub({
    extra: [
      {
        name: 'META-INF/rights.xml',
        data:
          `<?xml version="1.0"?>\n` +
          `<adept:rights xmlns:adept="http://ns.adobe.com/adept"><adept:licenseToken/></adept:rights>\n`,
      },
      {
        name: 'META-INF/encryption.xml',
        data:
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ` +
          `xmlns:enc="http://www.w3.org/2001/04/xmlenc#">\n` +
          `  <enc:EncryptedData>\n` +
          `    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>\n` +
          `    <enc:CipherData><enc:CipherReference URI="OEBPS/cap1.xhtml"/></enc:CipherData>\n` +
          `  </enc:EncryptedData>\n` +
          `</encryption>\n`,
      },
    ],
  });
}

// ePub de sonda: script inline e recursos remotos que a CSP do app deve bloquear.
function buildProbeEpub() {
  return buildEpub({
    cap1:
      `<h1>Capítulo 1</h1>\n` +
      `<script>window.top.document.title = 'SONDA EXECUTOU'; window.top.__sonda = true;</script>\n` +
      `<p onclick="window.top.__sonda = true">Sonda de segurança.</p>\n` +
      `<img src="http://127.0.0.1:9/sonda.png" alt="sonda"/>\n` +
      `<link rel="stylesheet" href="http://127.0.0.1:9/sonda.css"/>`,
  });
}

// PNG 1×1 válido (CRCs corretos).
function buildPng(r, g, b) {
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(latin1(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, 1);
  v.setUint32(4, 1);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // RGB
  const idat = new Uint8Array(deflateSync(Uint8Array.from([0, r, g, b])));
  return concat([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function buildCbz() {
  return makeZip([
    { name: '001.png', data: buildPng(255, 0, 0) },
    { name: '002.png', data: buildPng(0, 0, 255) },
  ]);
}

export function buildFixtures() {
  return {
    'amostra.pdf': buildPdf(),
    'amostra.epub': buildEpub(),
    'amostra.cbz': buildCbz(),
    'drm.epub': buildDrmEpub(),
    'sonda.epub': buildProbeEpub(),
    'falso.pdf': utf8('isto não é pdf'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = fileURLToPath(new URL('../fixtures/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const [name, bytes] of Object.entries(buildFixtures())) {
    writeFileSync(dir + name, bytes);
    console.log(`fixtures/${name} (${bytes.length} bytes)`);
  }
}
