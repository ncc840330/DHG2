/**
 * The yellow seal PDF: the sheet the warehouse signs and files.
 *
 * Run with `npm run test:pdf`. Like the .xlsx tests these are Node tests rather
 * than the jsdom ones in src/: the writer is a Netlify function module with no
 * part in the browser bundle. There is no PDF parser here on purpose — the point
 * is that the bytes we hand-roll are structurally sound (every xref offset lands
 * on the object it claims, every stream is as long as it says) and that the text
 * a reader would draw is the text the check produced, accents and all.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Loaded once: bundling the module for every test would dominate the runtime. */
let sealSheet = null;

async function loadSealSheet(t) {
  if (sealSheet) return sealSheet;

  const esbuild = join(root, "node_modules", ".bin", "esbuild");
  if (!existsSync(esbuild)) {
    t.skip("esbuild is not installed, so the TypeScript writer cannot be loaded");
    return null;
  }

  const bundle = join(mkdtempSync(join(tmpdir(), "seal-sheet-")), "seal-sheet.mjs");
  execFileSync(esbuild, [
    join(root, "netlify", "shared", "seal-sheet.ts"),
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${bundle}`,
  ]);

  sealSheet = await import(bundle);
  return sealSheet;
}

function makeLine(index, overrides = {}) {
  return {
    rowIndex: index + 1,
    subinvCode: "FGI-STOCK",
    locator: "A-12-3-4",
    item: `ITEM-${1000 + index}`,
    barcode: `42100001234567${String(index).padStart(2, "0")}`,
    sealResult: "pass",
    remark: "",
    ...overrides,
  };
}

function makeTask(lines, overrides = {}) {
  return {
    taskCode: "Yellow_seal_20260803-001",
    recordDate: "2026-08-03",
    checkedBy: "tundebalogh",
    confirmedBy: "brigitabarak",
    signature: "",
    lines,
    ...overrides,
  };
}

/** The file is Latin-1 by construction, so this is a lossless view of it. */
function asText(bytes) {
  return Buffer.from(bytes).toString("latin1");
}

/** Every string a PDF reader would draw, in the order the page draws it. */
function drawnText(bytes) {
  return [...asText(bytes).matchAll(/\((.*?)\) Tj/g)].map((match) => match[1]);
}

function pageCount(bytes) {
  return Number(/\/Count (\d+)/.exec(asText(bytes))[1]);
}

/** Every placement of the signature picture, as the matrix that put it there. */
function stamps(bytes) {
  return [...asText(bytes).matchAll(/q ([-\d. ]+) cm \/Im0 Do Q/g)].map((match) =>
    match[1].split(" ").map(Number),
  );
}

test("a finished check prints as a signed sheet with a row per line", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  const bytes = module.buildSealSheetPdf([
    makeTask([
      makeLine(0),
      makeLine(1, { sealResult: "fail", remark: "Sérült a pecsét" }),
    ]),
  ]);

  assert.equal(asText(bytes).slice(0, 8), "%PDF-1.4");
  assert.equal(pageCount(bytes), 1);

  const drawn = drawnText(bytes).join("\n");
  assert.match(drawn, /Yellow_seal_20260803-001/);
  assert.match(drawn, /ITEM-1000/);
  assert.match(drawn, /ITEM-1001/);
  // The serial number, under the SN heading the column now carries.
  assert.match(drawn, /^SN$/m);
  assert.match(drawn, /4210000123456700/);
  // H3 and I3 belong to the task, so the sheet repeats them on both rows —
  // three times each in all, counting the once they are named in the header.
  assert.equal(drawn.match(/tundebalogh/g).length, 3);
  assert.equal(drawn.match(/brigitabarak/g).length, 3);
  // The answer is an X under OK or under NO, the way the template asks it.
  assert.equal(drawn.match(/^X$/gm).length, 2);
});

test("Hungarian accents survive, and the ones Helvetica lacks fold to a near letter", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  const bytes = module.buildSealSheetPdf([
    makeTask([
      makeLine(0, {
        locator: "ÁÉÍÓÜ-1",
        sealResult: "fail",
        remark: "Felszakadt fűtésszabályzó — ŰŐ",
      }),
    ]),
  ]);

  const drawn = drawnText(bytes).join("\n");
  // WinAnsi has these, so they are drawn as themselves.
  assert.match(drawn, /ÁÉÍÓÜ-1/);
  // It has no ő or ű: the umlaut form is closer to right than a question mark.
  assert.match(drawn, /fütésszabályzó/);
  assert.match(drawn, /ÜÖ/);
  // The only question mark on the sheet is the column header's own, folded down
  // from the template's fullwidth ？. Nothing the checker typed became one.
  assert.equal(drawn.match(/\?/g).length, 1);
  assert.match(drawn, /Intact\?/);
});

test("a long remark is wrapped or trimmed, never spilled onto another page", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  const bytes = module.buildSealSheetPdf([
    makeTask([
      makeLine(0, {
        sealResult: "fail",
        remark:
          "Nagyon hosszú megjegyzés arról, hogy a pecsét sérült, a doboz oldala be " +
          "van szakadva és a tartalom ellenőrzésre vár a raktárvezetővel egyeztetve.",
      }),
    ]),
  ]);

  assert.equal(pageCount(bytes), 1);
  const drawn = drawnText(bytes);
  // Whatever is cut is marked as cut, and the mark is three periods: WinAnsi
  // draws no ellipsis, and an unfolded one would have measured wrong too.
  assert.doesNotMatch(drawn.join("\n"), /…/);
  for (const piece of drawn) {
    assert.ok(piece.length < 200, `a drawn string ran long: ${piece.slice(0, 40)}…`);
  }
});

test("more rows than fit start a second page, and the count says so", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  const perPage = module.ROWS_PER_PAGE;
  assert.ok(perPage > 1, "a page has to hold more than one row to be worth printing");

  const oneFull = Array.from({ length: perPage }, (_, index) => makeLine(index));
  const oneOver = [...oneFull, makeLine(perPage)];

  assert.equal(pageCount(module.buildSealSheetPdf([makeTask(oneFull)])), 1);
  assert.equal(pageCount(module.buildSealSheetPdf([makeTask(oneOver)])), 2);
  assert.equal(module.sealSheetPageCount(makeTask(oneOver)), 2);

  // Each task starts its own sheet: two tasks never share a page.
  const two = module.buildSealSheetPdf([
    makeTask([makeLine(0)]),
    makeTask([makeLine(1)], { taskCode: "Yellow_seal_20260803-002" }),
  ]);
  assert.equal(pageCount(two), 2);
  assert.match(drawnText(two).join("\n"), /Yellow_seal_20260803-002/);
});

test("an unsigned sheet keeps the columns empty for a pen", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  // The normal case: nobody typed the signers, so the export is what carries
  // them — as columns the warehouse writes into after printing.
  const bytes = module.buildSealSheetPdf([
    makeTask([makeLine(0), makeLine(1, { sealResult: "fail" })], {
      checkedBy: "",
      confirmedBy: "",
      signature: "",
    }),
  ]);

  const drawn = drawnText(bytes);
  const joined = drawn.join("\n");
  // The headings stay: they are what the columns are for.
  assert.match(joined, /Checked BY/);
  assert.match(joined, /Confirmed BY/);
  assert.match(joined, /Signature/);
  // Nothing is written into them, and the title block does not print a dash
  // where a name is not missing so much as not yet written.
  assert.doesNotMatch(joined, /Checked by/);
  assert.doesNotMatch(joined, /Confirmed by/);
  assert.doesNotMatch(joined, /—/);
  // The rows themselves are unaffected: two lines, two answers.
  assert.match(joined, /ITEM-1000/);
  assert.match(joined, /ITEM-1001/);
  assert.equal(joined.match(/^X$/gm).length, 2);
  assert.equal(pageCount(bytes), 1);
});

/**
 * The template signs itself: the warehouse left a picture of a signature on J3,
 * which is the Signature cell of its first data row. It is not text and cannot be
 * read out of an imported sheet, so the writer carries it and stamps it into every
 * printed row — the same as H3 and I3, which are copied in as words.
 */
test("the template's signature is stamped into every row", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  const bytes = module.buildSealSheetPdf([
    makeTask([makeLine(0), makeLine(1), makeLine(2, { sealResult: "fail" })]),
  ]);
  const text = asText(bytes);

  // The picture is carried once and drawn three times, rather than three copies
  // of a 5 kB image being written into the file.
  assert.equal(text.match(/\/Subtype \/Image/g).length, 1);
  assert.match(text, /\/XObject << \/Im0 \d+ 0 R >>/);
  assert.match(text, /\/DecodeParms << \/Predictor 15 \/Colors 3/);
  assert.equal(stamps(bytes).length, 3);

  // Laid along the row, which is a quarter turn from how the workbook stores it:
  // the picture is written up the page there, and reads across the sheet here.
  for (const [a, b, c, d] of stamps(bytes)) {
    assert.equal(a, 0, "the signature was placed upright, not turned");
    assert.equal(d, 0, "the signature was placed upright, not turned");
    assert.ok(b > 0 && c < 0, "the signature was turned the wrong way");
  }

  // A page of its own gets its own stamps: none of them go missing at a break.
  const perPage = module.ROWS_PER_PAGE;
  const long = Array.from({ length: perPage + 2 }, (_, index) => makeLine(index));
  assert.equal(stamps(module.buildSealSheetPdf([makeTask(long)])).length, perPage + 2);
});

test("a signature typed into the sheet is printed instead of the template's", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  // Somebody wrote a name into J3, so the sheet says in words who signs and the
  // template's own hand stays off it: two signatures for one row would be a lie
  // about who checked the box.
  const bytes = module.buildSealSheetPdf([
    makeTask([makeLine(0), makeLine(1)], { signature: "gaborkiss" }),
  ]);

  assert.equal(stamps(bytes).length, 0);
  // Written into both rows, and nowhere else: only the two signers are named in
  // the title block.
  assert.equal(drawnText(bytes).join("\n").match(/gaborkiss/g).length, 2);
});

/**
 * The structural check. A reader trusts the xref table to find objects and the
 * /Length of a stream to know where it ends; either being off by a byte is the
 * failure mode of a hand-rolled writer, and it shows up as "cannot open file"
 * rather than as anything visible in the text above.
 */
test("the cross-reference table and every stream length are exact", async (t) => {
  const module = await loadSealSheet(t);
  if (!module) return;

  const lines = Array.from({ length: 47 }, (_, index) =>
    makeLine(index, {
      locator: index % 3 === 0 ? `RAKTÁR-Ő-${index}` : "A-12-3-4",
      sealResult: index % 5 === 0 ? "fail" : "pass",
      remark: index % 5 === 0 ? "A pecsét felszakadt szállítás közben (ő, ű)" : "",
    }),
  );
  const text = asText(module.buildSealSheetPdf([makeTask(lines)]));

  const startxref = Number(/startxref\s+(\d+)/.exec(text)[1]);
  const offsets = [
    ...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm),
  ].map((match) => Number(match[1]));
  assert.ok(offsets.length > 0, "the xref table listed no objects");
  assert.equal(Number(/\/Size (\d+)/.exec(text.slice(startxref))[1]), offsets.length + 1);

  offsets.forEach((offset, index) => {
    assert.equal(
      text.slice(offset, offset + `${index + 1} 0 obj`.length),
      `${index + 1} 0 obj`,
      `object ${index + 1} is not where the xref table says`,
    );
  });

  // One content stream a page, and one more for the signature picture.
  const streams = [...text.matchAll(/\/Length (\d+) >>\nstream\n/g)];
  assert.equal(
    streams.length,
    pageCount(module.buildSealSheetPdf([makeTask(lines)])) + 1,
  );
  for (const stream of streams) {
    const start = stream.index + stream[0].length;
    const declared = Number(stream[1]);
    assert.equal(
      text.slice(start + declared, start + declared + "\nendstream\n".length),
      "\nendstream\n",
      "a stream is not as long as its /Length claims",
    );
  }

  assert.equal(text.trimEnd().endsWith("%%EOF"), true);
});
