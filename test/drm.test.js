import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasDrm, encryptionAlgorithms, drmError, FONT_OBFUSCATION } from '../public/js/drm.js';
import { buildFixtures } from '../tools/make-fixtures.js';

// Lê as entradas de um zip sem compressão (como os gerados por tools/zip.js).
function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  let pos = 0;
  while (pos + 30 <= bytes.length && view.getUint32(pos, true) === 0x04034b50) {
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const start = pos + 30 + nameLen + extraLen;
    out[name] = bytes.subarray(start, start + size);
    pos = start + size;
  }
  return out;
}

const encryption = (...algorithms) =>
  `<?xml version="1.0"?>\n<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" ` +
  `xmlns:enc="http://www.w3.org/2001/04/xmlenc#">` +
  algorithms
    .map(
      (a, i) =>
        `<enc:EncryptedData><enc:EncryptionMethod Algorithm="${a}"/>` +
        `<enc:CipherData><enc:CipherReference URI="f${i}"/></enc:CipherData></enc:EncryptedData>`,
    )
    .join('') +
  `</encryption>`;

test('livro sem rights.xml, encryption.xml nem criptografia MOBI não tem DRM', () => {
  assert.equal(hasDrm({}), false);
  assert.equal(hasDrm(), false);
  assert.equal(hasDrm({ rightsXml: null, encryptionXml: null, mobiEncryption: 0 }), false);
});

test('rights.xml presente indica DRM', () => {
  assert.equal(hasDrm({ rightsXml: '<rights/>' }), true);
  assert.equal(hasDrm({ rightsXml: '' }), true);
});

test('ofuscação de fontes (IDPF e Adobe) não é DRM', () => {
  assert.equal(hasDrm({ encryptionXml: encryption(...FONT_OBFUSCATION) }), false);
});

test('algoritmo de criptografia desconhecido no encryption.xml é DRM', () => {
  const aes = 'http://www.w3.org/2001/04/xmlenc#aes128-cbc';
  assert.equal(hasDrm({ encryptionXml: encryption(aes) }), true);
  assert.equal(hasDrm({ encryptionXml: encryption(FONT_OBFUSCATION[0], aes) }), true);
});

test('encryptionAlgorithms lê com e sem prefixo e com aspas simples', () => {
  const xml =
    `<EncryptionMethod Algorithm="a"/><enc:EncryptionMethod  Algorithm='b' />` +
    `<x:EncryptionMethod Id="m" Algorithm="c"></x:EncryptionMethod>`;
  assert.deepEqual(encryptionAlgorithms(xml), ['a', 'b', 'c']);
  assert.deepEqual(encryptionAlgorithms(null), []);
});

test('MOBI/AZW3 com campo encryption diferente de 0 tem DRM', () => {
  assert.equal(hasDrm({ mobiEncryption: 2 }), true);
  assert.equal(hasDrm({ mobiEncryption: 1 }), true);
  assert.equal(hasDrm({ mobiEncryption: 0 }), false);
  assert.equal(hasDrm({ mobiEncryption: null }), false);
});

test('drmError tem code "drm"', () => {
  const err = drmError();
  assert.ok(err instanceof Error);
  assert.equal(err.code, 'drm');
});

test('fixture drm.epub é reconhecida como DRM e amostra.epub não', () => {
  const fixtures = buildFixtures();
  const read = (bytes, name) => {
    const entry = readStoredZip(bytes)[name];
    return entry ? new TextDecoder().decode(entry) : null;
  };
  const check = (name) =>
    hasDrm({
      rightsXml: read(fixtures[name], 'META-INF/rights.xml'),
      encryptionXml: read(fixtures[name], 'META-INF/encryption.xml'),
    });
  assert.equal(check('drm.epub'), true);
  assert.equal(check('amostra.epub'), false);
});
