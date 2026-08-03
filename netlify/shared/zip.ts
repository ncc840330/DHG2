/**
 * Minimal ZIP writer (store method, no compression).
 *
 * It packs an .xlsx — small XML parts plus the JPEG/PNG photos — and the Andi
 * gallery downloads, which are JPEGs and nothing else. Both are already
 * compressed, so deflating them again would buy little and would mean pulling in
 * a compression dependency.
 */

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

/**
 * One entry whose bytes are still in the blob store. Reading is deferred so a
 * gallery download never holds more than the picture it is writing, and a
 * picture that has gone missing can be skipped by answering null.
 */
export type ZipSource = {
  name: string;
  read: () => Promise<Uint8Array | null>;
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

type DosStamp = { time: number; date: number };

function localHeader(
  name: Uint8Array,
  checksum: number,
  size: number,
  stamp: DosStamp,
) {
  const local = new Uint8Array(LOCAL_HEADER_SIZE + name.length);
  const view = new DataView(local.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, UTF8_NAME_FLAG, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, stamp.time, true);
  view.setUint16(12, stamp.date, true);
  view.setUint32(14, checksum, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  local.set(name, LOCAL_HEADER_SIZE);
  return local;
}

function centralHeader(
  name: Uint8Array,
  checksum: number,
  size: number,
  stamp: DosStamp,
  offset: number,
) {
  const central = new Uint8Array(CENTRAL_HEADER_SIZE + name.length);
  const view = new DataView(central.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, UTF8_NAME_FLAG, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, stamp.time, true);
  view.setUint16(14, stamp.date, true);
  view.setUint32(16, checksum, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  central.set(name, CENTRAL_HEADER_SIZE);
  return central;
}

function endRecord(count: number, directorySize: number, offset: number) {
  const end = new Uint8Array(END_RECORD_SIZE);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  return end;
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

    const local = localHeader(name, checksum, size, stamp);
    chunks.push(local, entry.data);
    directory.push(centralHeader(name, checksum, size, stamp, offset));

    offset += local.length + size;
  }

  const directorySize = directory.reduce((total, item) => total + item.length, 0);
  const end = endRecord(entries.length, directorySize, offset);

  const archive = new Uint8Array(offset + directorySize + END_RECORD_SIZE);
  let cursor = 0;
  for (const chunk of [...chunks, ...directory, end]) {
    archive.set(chunk, cursor);
    cursor += chunk.length;
  }

  return archive;
}

/**
 * The same archive, written out as it is built. A gallery download can run to
 * hundreds of megabytes of photos, which is more than a function may answer with
 * in one buffered response — and more than it should hold in memory to find out.
 * Sources that read back nothing are left out of the archive entirely.
 */
export function streamZip(sources: ZipSource[], modified = new Date()) {
  const stamp = toDosStamp(modified);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const directory: Uint8Array[] = [];
      let offset = 0;

      try {
        for (const source of sources) {
          const data = await source.read();
          if (!data) continue;

          const name = encoder.encode(source.name);
          const checksum = crc32(data);
          const local = localHeader(name, checksum, data.length, stamp);

          controller.enqueue(local);
          controller.enqueue(data);
          directory.push(
            centralHeader(name, checksum, data.length, stamp, offset),
          );

          offset += local.length + data.length;
        }

        const directorySize = directory.reduce(
          (total, item) => total + item.length,
          0,
        );
        for (const central of directory) controller.enqueue(central);
        controller.enqueue(endRecord(directory.length, directorySize, offset));
        controller.close();
      } catch (error) {
        // A half-written archive is worse than none: erroring the stream makes
        // the browser throw the partial download away instead of saving it.
        controller.error(error);
      }
    },
  });
}
