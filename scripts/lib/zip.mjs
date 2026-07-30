/**
 * ZIP reading and writing for the .xlsx cleaner.
 *
 * `netlify/shared/zip.ts` writes stored entries inside a Netlify function and
 * has no reader, and a file that came out of Excel is deflated, so the cleaner
 * gets its own pair built on node:zlib. Output is deflated too: a repaired file
 * lands on the same shared drive the broken one did, and nobody wants it four
 * times the size.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const UTF8_NAME_FLAG = 0x0800;
const STORED = 0;
const DEFLATED = 8;

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

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * The end record sits at the tail but a zip may carry a comment after it, so it
 * is looked for from the back.
 */
function findEndRecord(view, length) {
  const limit = Math.max(0, length - 0xffff - END_RECORD_SIZE);
  for (let offset = length - END_RECORD_SIZE; offset >= limit; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset;
  }
  throw new Error("Not a ZIP file: no end-of-central-directory record.");
}

/** Reads an archive into its parts, keeping the order they were stored in. */
export function readZip(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const decoder = new TextDecoder();

  const end = findEndRecord(view, data.length);
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);

  const parts = new Map();

  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`Damaged ZIP directory at entry ${index + 1}.`);
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(
      data.subarray(cursor + CENTRAL_HEADER_SIZE, cursor + CENTRAL_HEADER_SIZE + nameLength),
    );

    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Damaged ZIP entry: ${name}`);
    }

    // The local header repeats the name and carries its own extra field, which
    // is usually a different length from the one in the directory.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + LOCAL_HEADER_SIZE + localNameLength + localExtraLength;
    const stored = data.subarray(start, start + compressedSize);

    // A directory entry has no content and no place in an OOXML package.
    if (!name.endsWith("/")) {
      if (method === STORED) parts.set(name, new Uint8Array(stored));
      else if (method === DEFLATED) parts.set(name, new Uint8Array(inflateRawSync(stored)));
      else throw new Error(`Unsupported compression in ${name} (method ${method}).`);
    }

    cursor += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }

  return parts;
}

function toDosStamp(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time:
      Math.floor(date.getSeconds() / 2) | (date.getMinutes() << 5) | (date.getHours() << 11),
    date: date.getDate() | ((date.getMonth() + 1) << 5) | ((year - 1980) << 9),
  };
}

/**
 * Writes the parts back out. `[Content_Types].xml` goes first because that is
 * where a reader looks for it before it has walked the directory.
 */
export function writeZip(parts, modified = new Date()) {
  const stamp = toDosStamp(modified);
  const encoder = new TextEncoder();
  const names = Array.from(parts.keys()).sort((left, right) => {
    if (left === "[Content_Types].xml") return -1;
    if (right === "[Content_Types].xml") return 1;
    return 0;
  });

  const chunks = [];
  const directory = [];
  let offset = 0;

  for (const entryName of names) {
    const content = parts.get(entryName);
    const name = encoder.encode(entryName);
    const checksum = crc32(content);
    const packed = deflateRawSync(content, { level: 9 });
    // Deflate can grow content that is already compressed, such as a photo.
    const useDeflate = packed.length < content.length;
    const body = useDeflate ? packed : content;
    const method = useDeflate ? DEFLATED : STORED;

    const local = new Uint8Array(LOCAL_HEADER_SIZE + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, UTF8_NAME_FLAG, true);
    localView.setUint16(8, method, true);
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, content.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, LOCAL_HEADER_SIZE);
    chunks.push(local, body);

    const central = new Uint8Array(CENTRAL_HEADER_SIZE + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_SIGNATURE, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, UTF8_NAME_FLAG, true);
    centralView.setUint16(10, method, true);
    centralView.setUint16(12, stamp.time, true);
    centralView.setUint16(14, stamp.date, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, CENTRAL_HEADER_SIZE);
    directory.push(central);

    offset += local.length + body.length;
  }

  const directorySize = directory.reduce((total, item) => total + item.length, 0);
  const end = new Uint8Array(END_RECORD_SIZE);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_SIGNATURE, true);
  endView.setUint16(8, names.length, true);
  endView.setUint16(10, names.length, true);
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
