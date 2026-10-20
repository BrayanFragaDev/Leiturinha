// ZIP sem compressão (método 0) com CRC-32. Usado só para gerar fixtures.

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name);
    const body = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(body);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão necessária
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true); // método: sem compressão
    local.setUint16(10, 0, true); // hora
    local.setUint16(12, 0x21, true); // data (1980-01-01)
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, body.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, body);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true); // versão de criação
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, 0, true);
    cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, body.length, true);
    cen.setUint32(24, body.length, true);
    cen.setUint16(28, nameBytes.length, true);
    cen.setUint32(42, offset, true); // offset do cabeçalho local
    central.push(new Uint8Array(cen.buffer), nameBytes);

    offset += 30 + nameBytes.length + body.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
