/**
 * A very small PDF writer. The printed yellow seal sheet is a grid of text and
 * rules on A4 with one picture stamped into it — the signature the warehouse left
 * in its template — and that is the whole of what this builds. Netlify functions
 * have no PDF library at hand and the sheet needs no transparency or embedded
 * fonts, so the file is written out by hand the way `xlsx.ts` writes workbooks.
 */

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export type PdfText = {
  text: string;
  x: number;
  /** Baseline, measured from the bottom of the page like PDF itself does. */
  y: number;
  size?: number;
  bold?: boolean;
  /** `x` is the left edge by default, the centre or the right edge otherwise. */
  align?: "left" | "center" | "right";
  gray?: number;
};

export type PdfLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width?: number;
  gray?: number;
};

/**
 * A picture as PDF carries it. Only the shape of PNG that needs no unpacking is
 * accepted: 8 bits a channel, RGB, no alpha, not interlaced. Such a file's IDAT
 * is a zlib stream of PNG-filtered rows, which is exactly what a PDF image with
 * `/Predictor 15` expects, so the compressed bytes go in as they came out.
 */
export type PdfImage = {
  width: number;
  height: number;
  /** The IDAT bytes, still deflated. */
  data: Uint8Array;
};

/** Where a page puts the image, and which way up. */
export type PdfStamp = {
  /** The left edge, and the bottom edge, of the box the picture fills. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * A quarter turn anticlockwise, for a picture stored on its side. The box is
   * still measured on the page, so `width` is the turned picture's width.
   */
  turn?: "none" | "left";
};

export type PdfPage = {
  texts: PdfText[];
  lines: PdfLine[];
  stamps?: PdfStamp[];
};

const DEFAULT_SIZE = 8;

const PNG_MAGIC = "\x89PNG\r\n\x1a\n";

function readUint32(bytes: Uint8Array, at: number) {
  return (
    bytes[at] * 0x1000000 + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]
  );
}

/**
 * Reads the header and the pixel data out of a base64 PNG. Anything PDF cannot
 * carry verbatim throws rather than being drawn wrong: the pictures here are
 * assets checked into the repo, so a bad one is a mistake to be seen at once.
 */
export function pngImage(base64: string): PdfImage {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index) & 0xff;
  }

  if (binary.slice(0, 8) !== PNG_MAGIC) throw new Error("Not a PNG.");

  let width = 0;
  let height = 0;
  const chunks: Uint8Array[] = [];

  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = readUint32(bytes, at);
    const type = binary.slice(at + 4, at + 8);
    const body = at + 8;

    if (type === "IHDR") {
      width = readUint32(bytes, body);
      height = readUint32(bytes, body + 4);
      const [depth, colorType, , , interlace] = bytes.slice(body + 8, body + 13);
      if (depth !== 8 || colorType !== 2 || interlace !== 0) {
        throw new Error(
          "Only an 8-bit RGB PNG without alpha or interlacing can be embedded.",
        );
      }
    }
    if (type === "IDAT") chunks.push(bytes.subarray(body, body + length));
    if (type === "IEND") break;

    at = body + length + 4;
  }

  if (!width || !height || chunks.length === 0) throw new Error("The PNG has no image.");

  // A writer may split the pixels over several IDATs; together they are the one
  // zlib stream, so they are joined back into it.
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }

  return { width, height, data };
}

/**
 * Helvetica's own advance widths, in 1/1000 em, for the printable ASCII range.
 * Accented letters are measured as their base letter, which is what Helvetica
 * does for all of Latin-1 anyway.
 */
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/**
 * WinAnsiEncoding is what the fonts are declared with, and it has no room for
 * the Hungarian ő and ű or for the fullwidth question mark the source template
 * carries. They are folded onto the nearest letter that does fit, because a
 * printed sheet reading "Tunde" is worth more than one reading "T?nde".
 */
const FOLDED: Record<string, string> = {
  ő: "ö",
  Ő: "Ö",
  ű: "ü",
  Ű: "Ü",
  "？": "?",
  "…": "...",
  "‐": "-",
  "–": "-",
  "—": "-",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  " ": " ",
};

/** The bytes WinAnsi can carry; anything else becomes a question mark. */
export function toWinAnsi(value: string) {
  let out = "";

  for (const char of value.replace(/[\r\n\t]+/g, " ")) {
    const folded = FOLDED[char] ?? char;
    const code = folded.charCodeAt(0);
    out += code >= 32 && code <= 255 ? folded : "?";
  }

  return out;
}

/** Accents are dropped for measuring only — never for what gets printed. */
function measuredCode(char: string) {
  const base = char
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0);
  return (base || char).charCodeAt(0);
}

export function textWidth(text: string, size = DEFAULT_SIZE, bold = false) {
  let units = 0;

  for (const char of toWinAnsi(text)) {
    const code = measuredCode(char);
    units += code >= 32 && code <= 126 ? WIDTHS[code - 32] : 556;
  }

  // Helvetica-Bold is a touch wider than Helvetica. The exact table is not worth
  // carrying: widths are used to fit text into cells, and erring wide only ever
  // truncates a character early.
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

/** The longest head of the text that fits, with an ellipsis when it was cut. */
export function fitText(
  text: string,
  maxWidth: number,
  size = DEFAULT_SIZE,
  bold = false,
) {
  if (textWidth(text, size, bold) <= maxWidth) return text;

  let cut = text;
  while (cut.length > 1 && textWidth(`${cut}…`, size, bold) > maxWidth) {
    cut = cut.slice(0, -1);
  }

  return `${cut}…`;
}

/**
 * Breaks text into lines that fit the width, at spaces where it can and mid-word
 * where it must — a barcode is one long word and still has to be readable.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  size = DEFAULT_SIZE,
  maxLines = 2,
  bold = false,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let dropped = false;

  const flush = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      current = candidate;
      continue;
    }

    flush();
    if (lines.length >= maxLines) {
      dropped = true;
      break;
    }

    if (textWidth(word, size, bold) <= maxWidth) {
      current = word;
      continue;
    }

    // A word wider than the cell is broken across the lines that are left.
    let rest = word;
    while (rest && lines.length < maxLines) {
      let head = rest;
      while (head.length > 1 && textWidth(head, size, bold) > maxWidth) {
        head = head.slice(0, -1);
      }
      rest = rest.slice(head.length);
      if (rest) lines.push(head);
      else current = head;
    }
    if (rest) dropped = true;
  }

  flush();

  const kept = lines.slice(0, maxLines);
  // Text that did not fit is never dropped in silence: the last line it did fit
  // on says so, because a printed sheet gives no way of asking what was cut.
  if (dropped || lines.length > maxLines) {
    const last = kept.length - 1;
    kept[last] = fitText(`${kept[last]}…`, maxWidth, size, bold);
  }

  return kept;
}

function escapeString(value: string) {
  return toWinAnsi(value).replace(/[\\()]/g, (char) => `\\${char}`);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function pageContent(page: PdfPage) {
  const parts: string[] = [];

  for (const line of page.lines) {
    parts.push(
      `q ${round(line.gray ?? 0.35)} G ${round(line.width ?? 0.5)} w ${round(
        line.x1,
      )} ${round(line.y1)} m ${round(line.x2)} ${round(line.y2)} l S Q`,
    );
  }

  // The picture is placed by the matrix that maps the unit square onto its box.
  // Upright that is the box itself; turned left, the axes swap, so the square's
  // bottom-right corner lands where the box's bottom-left is.
  for (const stamp of page.stamps ?? []) {
    const matrix =
      stamp.turn === "left"
        ? [0, stamp.height, -stamp.width, 0, stamp.x + stamp.width, stamp.y]
        : [stamp.width, 0, 0, stamp.height, stamp.x, stamp.y];
    parts.push(`q ${matrix.map(round).join(" ")} cm /Im0 Do Q`);
  }

  for (const item of page.texts) {
    if (!item.text) continue;
    const size = item.size ?? DEFAULT_SIZE;
    const font = item.bold ? "/F2" : "/F1";
    const width = textWidth(item.text, size, item.bold);
    const x =
      item.align === "center"
        ? item.x - width / 2
        : item.align === "right"
          ? item.x - width
          : item.x;

    parts.push(
      `BT ${round(item.gray ?? 0)} g ${font} ${round(size)} Tf ${round(x)} ${round(
        item.y,
      )} Td (${escapeString(item.text)}) Tj ET`,
    );
  }

  return parts.join("\n");
}

/** The image data as a Latin-1 string, so it joins the rest of the file. */
function streamBytes(data: Uint8Array) {
  let out = "";
  for (let index = 0; index < data.length; index += 1) {
    out += String.fromCharCode(data[index]);
  }
  return out;
}

/**
 * Assembles the document. Every string in it is Latin-1, so a character is a
 * byte and the cross-reference table can be built from string offsets.
 *
 * One image is enough for what this writes, so it is a single XObject named
 * `/Im0` that every page may stamp as often as it likes — the sheet puts the
 * signature on every row, and it is carried once.
 */
export function buildPdf(pages: PdfPage[], title = "", image?: PdfImage) {
  const usable = pages.length > 0 ? pages : [{ texts: [], lines: [] }];
  const imageId = image ? 5 : 0;
  const firstPageId = image ? 6 : 5;
  const pageObjectIds = usable.map((_, index) => firstPageId + index * 2);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${usable.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];

  if (image) {
    // /Predictor 15 is what makes this cheap: PDF undoes the same per-row filters
    // PNG applied, so the deflated pixels travel from the .xlsx to the .pdf
    // without being unpacked on the way.
    objects.push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${
        image.height
      } /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${
        image.width
      } >> /Length ${image.data.length} >>\nstream\n${streamBytes(
        image.data,
      )}\nendstream`,
    );
  }

  usable.forEach((page, index) => {
    const contentId = pageObjectIds[index] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(PAGE_WIDTH)} ${round(
        PAGE_HEIGHT,
      )}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${
        image ? ` /XObject << /Im0 ${imageId} 0 R >>` : ""
      } >> /Contents ${contentId} 0 R >>`,
    );

    const content = pageContent(image ? page : { ...page, stamps: [] });
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });

  if (title) {
    objects.push(`<< /Title (${escapeString(title)}) /Producer (GyorDHG) >>`);
  }

  let file = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(file.length);
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    file += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${
    title ? ` /Info ${objects.length} 0 R` : ""
  } >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let index = 0; index < file.length; index += 1) {
    bytes[index] = file.charCodeAt(index) & 0xff;
  }

  return bytes;
}
