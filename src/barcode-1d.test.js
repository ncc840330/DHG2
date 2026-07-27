/**
 * The camera's own barcode decoder, the one that runs where the browser has no
 * BarcodeDetector. Every case here is a printed barcode turned into pixels and
 * read back, because that is the only way to know it reads a label rather than a
 * fixture: the widths come from the symbology tables, the tables are checked
 * against the shape the standards give them, and a barcode whose check digit
 * does not add up has to come back empty rather than nearly right.
 */
import { CODE128_PATTERNS, CODE39_ENCODINGS, decodeBarcodeImage, EAN_PATTERNS } from "./barcode-1d";
import {
  encodeCode128,
  encodeCode128Symbols,
  encodeCode128Values,
  encodeCode39,
  encodeEan13,
  encodeEan8,
  modulesToImage,
  reverseModules,
} from "./barcode-fixtures";

const read = (modules, options) =>
  decodeBarcodeImage(modulesToImage(modules, options));

test("a Code 128 label reads back exactly", () => {
  expect(read(encodeCode128("TASK-4711/2026"))).toBe("TASK-4711/2026");
});

test("a Code 128 serial reads at the width a hand-held frame gives it", () => {
  // Two pixels per module is about what a 960px frame leaves of a label held at
  // arm's length, and it still has to read.
  expect(read(encodeCode128("SN0012345678"), { scale: 2 })).toBe("SN0012345678");
});

test("Code 128's digit pairs are unpacked", () => {
  // Code set C, the compact form a long numeric task ID is printed in: START C,
  // then one symbol per two digits.
  expect(read(encodeCode128Values([105, 47, 11, 20, 26]))).toBe("47112026");
});

test("a Code 39 label reads back exactly", () => {
  expect(read(encodeCode39("GYOR-A12 34"))).toBe("GYOR-A12 34");
});

test("an EAN-13 article number reads back exactly", () => {
  expect(read(encodeEan13("4006381333931"))).toBe("4006381333931");
});

test("a UPC-A number comes back as the twelve digits under the label", () => {
  expect(read(encodeEan13("0036000291452"))).toBe("036000291452");
});

test("an EAN-8 article number reads back exactly", () => {
  expect(read(encodeEan8("96385074"))).toBe("96385074");
});

test("a label held the wrong way up still reads", () => {
  expect(read(reverseModules(encodeCode128("UPSIDE-DOWN-1")))).toBe(
    "UPSIDE-DOWN-1",
  );
  expect(read(reverseModules(encodeEan13("4006381333931")))).toBe(
    "4006381333931",
  );
});

test("a barcode whose check symbol is wrong is not read at all", () => {
  // START B, "45", then a check symbol that is not the (104 + 20 + 42) % 103 = 63
  // the barcode adds up to, and the stop pattern.
  const broken = encodeCode128Symbols([104, 20, 21, 99, 106]);

  expect(read(encodeCode128Symbols([104, 20, 21, 63, 106]))).toBe("45");
  expect(read(broken)).toBe("");
});

test("a frame with no barcode in it reads nothing", () => {
  const blank = modulesToImage("0".repeat(200), { ink: 236 });
  expect(decodeBarcodeImage(blank)).toBe("");
});

test("a frame too flat to be paper and ink reads nothing", () => {
  // A camera pointed at a shelf: something is there, but nothing is black.
  const washedOut = modulesToImage(encodeCode128("NOT-READABLE"), {
    ink: 150,
    paper: 170,
  });
  expect(decodeBarcodeImage(washedOut)).toBe("");
});

test("the symbology tables have the shape the standards give them", () => {
  expect(CODE128_PATTERNS).toHaveLength(107);
  CODE128_PATTERNS.slice(0, 106).forEach((pattern) => {
    expect(pattern).toHaveLength(6);
    expect(pattern.reduce((total, width) => total + width, 0)).toBe(11);
  });
  // The stop pattern carries the extra bar that closes the barcode.
  expect(CODE128_PATTERNS[106]).toHaveLength(7);
  expect(CODE128_PATTERNS[106].reduce((total, width) => total + width, 0)).toBe(13);
  expect(new Set(CODE128_PATTERNS.map(String)).size).toBe(107);

  expect(CODE39_ENCODINGS).toHaveLength(44);
  CODE39_ENCODINGS.forEach((bits) => {
    expect(bits).toBeLessThan(1 << 9);
    // Three of the nine elements are wide; that is what Code 39 is.
    expect(bits.toString(2).replace(/0/g, "")).toHaveLength(3);
  });
  expect(new Set(CODE39_ENCODINGS).size).toBe(44);

  expect(EAN_PATTERNS).toHaveLength(10);
  EAN_PATTERNS.forEach((pattern) => {
    expect(pattern).toHaveLength(4);
    expect(pattern.reduce((total, width) => total + width, 0)).toBe(7);
  });
});
