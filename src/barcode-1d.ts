/**
 * A 1D barcode decoder for the camera path, used where the browser has no
 * BarcodeDetector of its own — which is most of them: outside Chrome on Android
 * and Safari on macOS/iOS 17+, `window.BarcodeDetector` simply does not exist,
 * and the camera button used to disappear with it. The formats here are the ones
 * on a warehouse label: Code 128 and Code 39 for task IDs, serials, RFID tags
 * and locators, EAN/UPC for the goods themselves.
 *
 * Nothing about this is a picture-processing pipeline. One horizontal line of
 * pixels is turned into the widths of the bars and spaces it crossed, and the
 * widths are matched against the symbology tables — the same way a laser scanner
 * reads its own sweep. Several lines are tried per frame because a hand-held
 * aim is never level, and every result is checksum-verified before it leaves
 * here: a misread barcode in a discrepancy record is worse than no read at all.
 */

/**
 * Widths of the 107 Code 128 symbols, in modules. Index = symbol value. The
 * tables below are exported for `barcode-fixtures.js`, which prints barcodes
 * from them so the decoder can be tested against pixels rather than mocks.
 */
export const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
].map((pattern) => Array.from(pattern, Number));

/**
 * A symbol is read from its first six elements. The stop symbol has a seventh,
 * the trailing bar that closes the barcode, and it is not needed to recognise it.
 */
const CODE128_MATCH = CODE128_PATTERNS.map((pattern) => pattern.slice(0, 6));

const CODE128_START_A = 103;
const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Code 39 characters as nine wide/narrow flags, most significant bit first.
 * Every one of them has exactly three wide elements, which is what makes the
 * symbology readable without knowing the module width up front.
 */
const CODE39_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*";
export const CODE39_ENCODINGS = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
  0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c,
  0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
  0x181, 0x0c1, 0x1c0, 0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8,
  0x0a2, 0x08a, 0x02a, 0x094,
];

/** Widths of an EAN/UPC digit. The G and R codes are these read backwards. */
export const EAN_PATTERNS = [
  [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
  [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2],
];

/**
 * Which of the first six EAN-13 digits use the G code. The pattern is the
 * thirteenth digit: it has no bars of its own, only this.
 */
export const EAN13_FIRST_DIGIT = [
  0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a,
];

const EAN_GUARD = [1, 1, 1];
const EAN_MIDDLE_GUARD = [1, 1, 1, 1, 1];

/** How far the widths of a real symbol may drift, as a share of one module. */
const MAX_AVG_VARIANCE = 0.25;
const MAX_INDIVIDUAL_VARIANCE = 0.7;

/** Guards drift more than symbols do, being on the edge of the label. */
const MAX_GUARD_VARIANCE = 0.42;

/** Lines to try per frame, spread over the height of the picture. */
const SCAN_LINES = 21;

/** Below this a row is a flat surface, not black bars on white paper. */
const MIN_CONTRAST = 40;

export type ImageDataLike = {
  data: Uint8ClampedArray | Uint8Array | number[];
  width: number;
  height: number;
};

/**
 * How far the measured widths are from a symbol's, or Infinity when they are too
 * far to be that symbol at all. Scale is worked out from the widths themselves,
 * so it holds whether the label fills the frame or sits in a corner of it.
 */
function patternVariance(
  runs: number[],
  offset: number,
  pattern: number[],
  maxIndividualVariance = MAX_INDIVIDUAL_VARIANCE,
) {
  let total = 0;
  let patternLength = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const run = runs[offset + index];
    if (run === undefined) return Infinity;
    total += run;
    patternLength += pattern[index];
  }
  // Fewer pixels than modules: the reading is below the resolution of a guess.
  if (total < patternLength) return Infinity;

  const unit = total / patternLength;
  const maxVariance = unit * maxIndividualVariance;
  let variance = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    const drift = Math.abs(runs[offset + index] - pattern[index] * unit);
    if (drift > maxVariance) return Infinity;
    variance += drift;
  }
  return variance / total;
}

function matchesPattern(runs: number[], offset: number, pattern: number[]) {
  return (
    patternVariance(runs, offset, pattern, MAX_GUARD_VARIANCE) <
    MAX_GUARD_VARIANCE
  );
}

/** The Code 128 symbol the widths at `offset` spell out, or -1. */
function readCode128Symbol(runs: number[], offset: number) {
  let best = -1;
  let bestVariance = MAX_AVG_VARIANCE;
  for (let value = 0; value < CODE128_MATCH.length; value += 1) {
    const variance = patternVariance(runs, offset, CODE128_MATCH[value]);
    if (variance < bestVariance) {
      bestVariance = variance;
      best = value;
    }
  }
  return best;
}

/** Code set A and B share this much: printable ASCII sits at value + 32. */
function code128Character(value: number, codeSet: number) {
  if (codeSet === CODE128_START_A) {
    if (value < 64) return String.fromCharCode(value + 32);
    // 64…95 are the control characters. Nothing types those into a text field.
    return "";
  }
  return value < 96 ? String.fromCharCode(value + 32) : "";
}

/**
 * Turns the data symbols into text. The code set is a running state — a barcode
 * may switch between A, B and C part-way through, and Code C spells two digits
 * per symbol, which is how a long task ID stays short enough to print.
 */
function code128Text(values: number[], startCode: number) {
  let codeSet = startCode;
  let shiftedSet = 0;
  let text = "";

  for (const value of values) {
    if (codeSet === CODE128_START_C) {
      if (value < 100) {
        text += String(value).padStart(2, "0");
      } else if (value === 100) {
        codeSet = CODE128_START_B;
      } else if (value === 101) {
        codeSet = CODE128_START_A;
      }
      // 102 is FNC1, an application marker with no character of its own.
      continue;
    }

    const activeSet = shiftedSet || codeSet;
    shiftedSet = 0;

    if (value < 96) {
      text += code128Character(value, activeSet);
      continue;
    }

    if (value === 98) {
      // SHIFT borrows the other set for the next character only.
      shiftedSet = activeSet === CODE128_START_A ? CODE128_START_B : CODE128_START_A;
    } else if (value === 99) {
      codeSet = CODE128_START_C;
    } else if (value === 100 && activeSet === CODE128_START_A) {
      codeSet = CODE128_START_B;
    } else if (value === 101 && activeSet === CODE128_START_B) {
      codeSet = CODE128_START_A;
    }
    // 96, 97 and the remaining 100/101 are FNC2…FNC4: markers, not characters.
  }

  return text;
}

/** Reads a Code 128 barcode that starts at `start`, checksum and all. */
function readCode128(runs: number[], start: number, startCode: number) {
  const values: number[] = [];
  let offset = start + 6;

  while (offset + 6 <= runs.length) {
    const value = readCode128Symbol(runs, offset);
    if (value < 0) return "";
    offset += 6;

    if (value === CODE128_STOP) {
      // Start, one character, its check symbol and the stop is the shortest
      // barcode there is; anything less is a stretch of noise that fit.
      if (values.length < 2) return "";

      const checkSymbol = values[values.length - 1];
      const data = values.slice(0, -1);
      let checksum = startCode;
      data.forEach((symbol, index) => {
        checksum += (index + 1) * symbol;
      });
      if (checksum % 103 !== checkSymbol) return "";

      return code128Text(data, startCode);
    }

    values.push(value);
  }

  return "";
}

function decodeCode128(runs: number[]) {
  // Bars sit at the even indices: the widths always begin with one.
  for (let start = 0; start + 6 <= runs.length; start += 2) {
    let startCode = -1;
    let bestVariance = MAX_AVG_VARIANCE;
    for (const candidate of [CODE128_START_A, CODE128_START_B, CODE128_START_C]) {
      const variance = patternVariance(runs, start, CODE128_MATCH[candidate]);
      if (variance < bestVariance) {
        bestVariance = variance;
        startCode = candidate;
      }
    }
    if (startCode < 0) continue;

    const text = readCode128(runs, start, startCode);
    if (text) return text;
  }
  return "";
}

/**
 * The nine widths at `offset` as wide/narrow flags. Which is which is decided
 * per character rather than per barcode, so a label photographed at an angle —
 * wider on one side than the other — still reads.
 */
function readCode39Symbol(runs: number[], offset: number) {
  let narrowest = Infinity;
  let widest = 0;
  for (let index = 0; index < 9; index += 1) {
    const run = runs[offset + index];
    if (run === undefined) return -1;
    if (run < narrowest) narrowest = run;
    if (run > widest) widest = run;
  }
  // A wide element is at least twice a narrow one; without that spread the nine
  // widths are all the same and this is not Code 39.
  if (widest < narrowest * 1.5) return -1;

  const threshold = (narrowest + widest) / 2;
  let pattern = 0;
  let wideCount = 0;
  for (let index = 0; index < 9; index += 1) {
    if (runs[offset + index] > threshold) {
      pattern |= 1 << (8 - index);
      wideCount += 1;
    }
  }
  return wideCount === 3 ? pattern : -1;
}

function code39Character(runs: number[], offset: number) {
  const pattern = readCode39Symbol(runs, offset);
  if (pattern < 0) return "";
  const index = CODE39_ENCODINGS.indexOf(pattern);
  return index < 0 ? "" : CODE39_ALPHABET[index];
}

function decodeCode39(runs: number[]) {
  for (let start = 0; start + 9 <= runs.length; start += 2) {
    if (code39Character(runs, start) !== "*") continue;

    let text = "";
    // Ten elements per character: the nine of the symbol and the gap after it.
    for (let offset = start + 10; offset + 9 <= runs.length; offset += 10) {
      const character = code39Character(runs, offset);
      if (!character) break;
      if (character === "*") return text;
      text += character;
    }
  }
  return "";
}

/** An EAN digit, and whether it was printed in the G code. */
function readEanDigit(runs: number[], offset: number, allowEvenParity: boolean) {
  let digit = -1;
  let isEvenParity = false;
  let bestVariance = MAX_AVG_VARIANCE;

  for (let candidate = 0; candidate < 10; candidate += 1) {
    const pattern = EAN_PATTERNS[candidate];
    const variance = patternVariance(runs, offset, pattern);
    if (variance < bestVariance) {
      bestVariance = variance;
      digit = candidate;
      isEvenParity = false;
    }
    if (!allowEvenParity) continue;

    const evenVariance = patternVariance(runs, offset, [...pattern].reverse());
    if (evenVariance < bestVariance) {
      bestVariance = evenVariance;
      digit = candidate;
      isEvenParity = true;
    }
  }

  return digit < 0 ? null : { digit, isEvenParity };
}

/** The last digit of an EAN or UPC number is a check over the ones before it. */
function hasValidEanChecksum(code: string) {
  let sum = 0;
  for (let index = code.length - 2; index >= 0; index -= 1) {
    const digit = code.charCodeAt(index) - 48;
    // Counting back from the check digit, every second one is tripled.
    sum += (code.length - index) % 2 === 0 ? digit * 3 : digit;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === code.charCodeAt(code.length - 1) - 48;
}

function readEanHalf(
  runs: number[],
  offset: number,
  digitCount: number,
  allowEvenParity: boolean,
) {
  let digits = "";
  let parity = 0;

  for (let index = 0; index < digitCount; index += 1) {
    const found = readEanDigit(runs, offset + index * 4, allowEvenParity);
    if (!found) return null;
    if (found.isEvenParity) parity |= 1 << (digitCount - 1 - index);
    digits += found.digit;
  }

  return { digits, parity };
}

function readEan(runs: number[], start: number, digitsPerHalf: number) {
  const leftOffset = start + EAN_GUARD.length;
  const left = readEanHalf(runs, leftOffset, digitsPerHalf, digitsPerHalf === 6);
  if (!left) return "";

  const middleOffset = leftOffset + digitsPerHalf * 4;
  if (!matchesPattern(runs, middleOffset, EAN_MIDDLE_GUARD)) return "";

  const rightOffset = middleOffset + EAN_MIDDLE_GUARD.length;
  const right = readEanHalf(runs, rightOffset, digitsPerHalf, false);
  if (!right) return "";

  if (!matchesPattern(runs, rightOffset + digitsPerHalf * 4, EAN_GUARD)) {
    return "";
  }

  let code = `${left.digits}${right.digits}`;
  if (digitsPerHalf === 6) {
    // EAN-13 prints its first digit as the parity of the left half.
    const firstDigit = EAN13_FIRST_DIGIT.indexOf(left.parity);
    if (firstDigit < 0) return "";
    code = `${firstDigit}${code}`;
  }

  if (!hasValidEanChecksum(code)) return "";

  // A 13-digit number starting with zero is how EAN-13 writes a UPC-A, and the
  // label under it prints the twelve digits without it.
  return code.length === 13 && code.startsWith("0") ? code.slice(1) : code;
}

function decodeEan(runs: number[]) {
  for (let start = 0; start + 43 <= runs.length; start += 2) {
    if (!matchesPattern(runs, start, EAN_GUARD)) continue;
    const text = readEan(runs, start, 6) || readEan(runs, start, 4);
    if (text) return text;
  }
  return "";
}

/**
 * Reads one line of widths. A barcode aimed at upside down arrives with its
 * widths in reverse, which costs one more pass to rule out and nothing to
 * support, so the operator never has to think about which way up the label is.
 */
export function decodeRuns(runs: number[]): string {
  if (runs.length < 9) return "";

  const orders = [runs, [...runs].reverse()];
  for (const order of orders) {
    const text = decodeCode128(order) || decodeCode39(order) || decodeEan(order);
    if (text) return text;
  }
  return "";
}

/**
 * The widths of the bars and spaces one row of pixels crosses. Leading and
 * trailing white is the quiet zone around the label and is dropped, so the
 * first and last width are always bars.
 */
export function rowToRuns(image: ImageDataLike, y: number): number[] {
  const { data, width } = image;
  const rowStart = y * width * 4;
  const luma = new Uint8Array(width);
  let darkest = 255;
  let lightest = 0;

  for (let x = 0; x < width; x += 1) {
    const offset = rowStart + x * 4;
    // Integer luma, the same weights every scanner uses. Alpha is ignored: a
    // camera frame has none to speak of.
    const value =
      (data[offset] * 77 + data[offset + 1] * 151 + data[offset + 2] * 28) >> 8;
    luma[x] = value;
    if (value < darkest) darkest = value;
    if (value > lightest) lightest = value;
  }

  if (lightest - darkest < MIN_CONTRAST) return [];

  const threshold = (darkest + lightest) / 2;
  let x = 0;
  while (x < width && luma[x] > threshold) x += 1;
  if (x >= width) return [];

  const runs: number[] = [];
  let isDark = true;
  let run = 0;
  for (; x < width; x += 1) {
    const dark = luma[x] <= threshold;
    if (dark === isDark) {
      run += 1;
    } else {
      runs.push(run);
      run = 1;
      isDark = dark;
    }
  }
  // Whatever white is left is the quiet zone on the far side of the label.
  if (isDark) runs.push(run);

  return runs;
}

/**
 * Reads a frame. Several rows are tried because the label is somewhere in the
 * picture rather than exactly across the middle of it, and a row that crosses
 * the printed text under the barcode has to be allowed to fail.
 */
export function decodeBarcodeImage(image: ImageDataLike): string {
  const { width, height } = image;
  if (width < 32 || height < 4) return "";

  for (let line = 1; line <= SCAN_LINES; line += 1) {
    const y = Math.min(height - 1, Math.floor((line * height) / (SCAN_LINES + 1)));
    const text = decodeRuns(rowToRuns(image, y));
    if (text) return text;
  }
  return "";
}
