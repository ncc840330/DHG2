/**
 * Minimal ZIP writer (store method, no compression).
 *
 * It only ever packs an .xlsx: small XML parts plus the JPEG/PNG photos, which
 * are already compressed. Deflating them again would buy little and would mean
 * pulling in a compression dependency.
 */

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const UTF8_NAME_FLAG = 0x0800;

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosStamp(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time:
      Math.floor(date.getSeconds() / 2) |
      (date.getMinutes() << 5) |
      (date.getHours() << 11),
    date: date.getDate() | ((date.getMonth() + 1) << 5) | ((year - 1980) << 9),
  };
}

export function createZip(entries: ZipEntry[], modified = new Date()) {
  const stamp = toDosStamp(modified);
  const chunks: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.data.length;
    const checksum = crc32(entry.data);

    const local = new Uint8Array(LOCAL_HEADER_SIZE + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, UTF8_NAME_FLAG, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, size, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, LOCAL_HEADER_SIZE);
    chunks.push(local, entry.data);

    const central = new Uint8Array(CENTRAL_HEADER_SIZE + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, UTF8_NAME_FLAG, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, size, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, CENTRAL_HEADER_SIZE);
    directory.push(central);

    offset += local.length + size;
  }

  const directorySize = directory.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(END_RECORD_SIZE);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const archive = new Uint8Array(offset + directorySize + END_RECORD_SIZE);
  let cursor = 0;
  for (const chunk of [...chunks, ...directory, end]) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }

  return archive;
}
