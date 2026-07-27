/**
 * Printed barcodes for the tests. The decoder is given pixels here, not mocks:
 * these helpers lay a barcode out as modules, then paint it into an ImageData
 * the same shape a camera frame has, so a test failure means a barcode a scanner
 * would have read did not read.
 */
import {
  CODE128_PATTERNS,
  CODE39_ENCODINGS,
  EAN13_FIRST_DIGIT,
  EAN_PATTERNS,
} from "./barcode-1d";

const CODE39_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*";

/** Bars and spaces of the given widths, as one module per character. */
function widthsToModules(widths, startsWithBar = true) {
  let modules = "";
  widths.forEach((width, index) => {
    const isBar = index % 2 === (startsWithBar ? 0 : 1);
    modules += (isBar ? "1" : "0").repeat(width);
  });
  return modules;
}

/** A Code 128 barcode from raw symbol values, exactly as given. */
export function encodeCode128Symbols(values) {
  return values.map((value) => widthsToModules(CODE128_PATTERNS[value])).join("");
}

/** A Code 128 barcode from raw symbol values, check symbol and stop included. */
export function encodeCode128Values(values) {
  const checksum = values
    .slice(1)
    .reduce((total, value, index) => total + (index + 1) * value, values[0]);
  return encodeCode128Symbols([...values, checksum % 103, 106]);
}

/** Code 128 in code set B: everything printable on a warehouse label. */
export function encodeCode128(text) {
  const values = [104];
  for (const character of text) values.push(character.charCodeAt(0) - 32);
  return encodeCode128Values(values);
}

function encodeCode39Character(character) {
  const bits = CODE39_ENCODINGS[CODE39_ALPHABET.indexOf(character)];
  let modules = "";
  for (let index = 0; index < 9; index += 1) {
    const isWide = (bits >> (8 - index)) & 1;
    modules += (index % 2 === 0 ? "1" : "0").repeat(isWide ? 3 : 1);
  }
  return modules;
}

/** Code 39, framed by the asterisks that mark where it starts and ends. */
export function encodeCode39(text) {
  return [...`*${text}*`]
    .map((character) => encodeCode39Character(character))
    .join("0");
}

/** EAN-13 from all thirteen digits, the check digit included. */
export function encodeEan13(code) {
  const parity = EAN13_FIRST_DIGIT[Number(code[0])];
  let modules = "101";

  for (let index = 0; index < 6; index += 1) {
    const widths = EAN_PATTERNS[Number(code[index + 1])];
    const isEvenParity = (parity >> (5 - index)) & 1;
    modules += widthsToModules(isEvenParity ? [...widths].reverse() : widths, false);
  }

  modules += "01010";
  for (let index = 7; index < 13; index += 1) {
    modules += widthsToModules(EAN_PATTERNS[Number(code[index])]);
  }

  return `${modules}101`;
}

/** EAN-8, whose halves are four digits each and carry no parity. */
export function encodeEan8(code) {
  let modules = "101";
  for (let index = 0; index < 4; index += 1) {
    modules += widthsToModules(EAN_PATTERNS[Number(code[index])], false);
  }
  modules += "01010";
  for (let index = 4; index < 8; index += 1) {
    modules += widthsToModules(EAN_PATTERNS[Number(code[index])]);
  }
  return `${modules}101`;
}

/**
 * Paints the modules into a frame: black bars on white paper, with a quiet zone
 * either side. `scale` is how many pixels one module gets, which is the one
 * thing that decides whether a barcode is readable at all.
 */
export function modulesToImage(
  modules,
  { scale = 3, height = 40, quietZone = 10, ink = 24, paper = 236 } = {},
) {
  const width = (modules.length + quietZone * 2) * scale;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let x = 0; x < width; x += 1) {
    const moduleIndex = Math.floor(x / scale) - quietZone;
    const isBar = modules[moduleIndex] === "1";
    const value = isBar ? ink : paper;
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }

  return { data, width, height };
}

/** The same frame the other way up, as a label read from the wrong end. */
export function reverseModules(modules) {
  return [...modules].reverse().join("");
}
