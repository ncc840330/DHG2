/**
 * The .xlsx clean-up rules, and the export they were derived from.
 *
 * Run with `npm run test:xlsx`. These are Node tests rather than the jsdom ones
 * in src/: the writer is a Netlify function module and the cleaner is a CLI, and
 * neither has anything to do with the browser bundle react-scripts tests.
 *
 * The fixture is the export as it used to be written — inline strings, a frozen
 * pane with no selection, an autoFilter with nothing behind it — because that is
 * what the downloads already sitting on the shared drive look like.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readZip, writeZip } from "./lib/zip.mjs";
import { assertWorkbook, repairWorkbook } from "./lib/xlsx-repair.mjs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const root = fileURLToPath(new URL("..", import.meta.url));
const decoder = new TextDecoder();
const encoder = new TextEncoder();

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

const GRID = [
  ["Line ID", "System SN", "Problem description"],
  ["L-001", "4210000123456789", "Missing & damaged <label>"],
  ["L-002", "0012", "Other - fűtésszabályzó hiba"],
];

function xml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function inlineCell(reference, value) {
  return (
    `<c r="${reference}" s="1" t="inlineStr">` +
    `<is><t xml:space="preserve">${value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</t></is>` +
    `</c>`
  );
}

/**
 * The export as it was written before the fix, with the faults the downloads
 * carry: inline strings, a frozen pane with no selection for it, an autoFilter
 * whose range runs past the sheet and has no _FilterDatabase name behind it, an
 * invented sheetView attribute, an empty cols, and a theme colour in a package
 * with no theme part.
 */
function brokenWorkbook() {
  const rows = GRID.map(
    (row, rowIndex) =>
      `<row r="${rowIndex + 1}">` +
      row
        .map((value, column) => inlineCell(`${String.fromCharCode(65 + column)}${rowIndex + 1}`, value))
        .join("") +
      `</row>`,
  ).join("");

  const parts = new Map();
  const put = (name, text) => parts.set(name, encoder.encode(text));

  put(
    "[Content_Types].xml",
    xml(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `</Types>`,
    ),
  );
  put(
    "_rels/.rels",
    xml(
      `<Relationships xmlns="${PACKAGE_REL_NS}">` +
        `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    ),
  );
  put(
    "xl/workbook.xml",
    xml(
      `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        `<sheets><sheet name="DHG jelentés" sheetId="1" r:id="rId1"/></sheets>` +
        `</workbook>`,
    ),
  );
  put(
    "xl/_rels/workbook.xml.rels",
    xml(
      `<Relationships xmlns="${PACKAGE_REL_NS}">` +
        `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    ),
  );
  put(
    "xl/styles.xml",
    xml(
      `<styleSheet xmlns="${MAIN_NS}">` +
        `<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts>` +
        `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
        `<borders count="1"><border/></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
        `</styleSheet>`,
    ),
  );
  put(
    "xl/worksheets/sheet1.xml",
    xml(
      `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
        `<dimension ref="A1:C3"/>` +
        `<sheetViews><sheetView tabSelected="1" freezeHeader="1" workbookViewId="0">` +
        `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
        `</sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"/>` +
        `<cols></cols>` +
        `<sheetData>${rows}</sheetData>` +
        `<autoFilter ref="A1:C501"/>` +
        `</worksheet>`,
    ),
  );

  return parts;
}

function textOf(parts, name) {
  return decoder.decode(parts.get(name));
}

function codesIn(issues) {
  return new Set(issues.map((issue) => issue.code));
}

/** Reads a package back the way Excel would: cell by cell, through SheetJS. */
function gridOf(parts) {
  const workbook = XLSX.read(writeZip(parts), { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

test("the zip writer round-trips every part", () => {
  const parts = brokenWorkbook();
  const reread = readZip(writeZip(parts));

  assert.deepEqual(Array.from(reread.keys()).sort(), Array.from(parts.keys()).sort());
  for (const [name, data] of parts) {
    assert.deepEqual(reread.get(name), data, name);
  }
});

test("a photo survives a round-trip it cannot be deflated into", () => {
  // Random bytes stand in for a JPEG: deflate grows them, so the writer has to
  // fall back to storing the entry rather than trusting the compressed size.
  const noise = new Uint8Array(4096);
  for (let index = 0; index < noise.length; index += 1) {
    noise[index] = (index * 2654435761) % 251;
  }

  const parts = brokenWorkbook();
  parts.set("xl/media/image1.jpg", noise);

  assert.deepEqual(readZip(writeZip(parts)).get("xl/media/image1.jpg"), noise);
});

test("the broken export is recognised as a workbook", () => {
  assert.doesNotThrow(() => assertWorkbook(brokenWorkbook()));
  assert.throws(() => assertWorkbook(new Map()), /Not an \.xlsx workbook/);
});

test("every fault in the old export is reported", () => {
  const { issues } = repairWorkbook(brokenWorkbook());
  const codes = codesIn(issues);

  for (const code of [
    "inline-strings",
    "sheet-view",
    "auto-filter",
    "empty-cols",
    "theme-color",
    "doc-props",
    "workbook",
  ]) {
    assert.ok(codes.has(code), `${code} was not reported: ${JSON.stringify(issues, null, 2)}`);
  }
});

test("inline strings move into the shared string table", () => {
  const { parts } = repairWorkbook(brokenWorkbook());
  const sheet = textOf(parts, "xl/worksheets/sheet1.xml");

  assert.ok(!sheet.includes("inlineStr"), "an inline string was left behind");
  assert.ok(!sheet.includes("<is>"), "an inline string body was left behind");
  assert.match(sheet, /<c r="A1" s="1" t="s"><v>0<\/v><\/c>/);

  const strings = textOf(parts, "xl/sharedStrings.xml");
  // Nine cells, but "L-001" and the rest are all distinct, so nine entries.
  assert.match(strings, /count="9" uniqueCount="9"/);
  assert.ok(strings.includes("Missing &amp; damaged &lt;label&gt;"));

  assert.ok(
    textOf(parts, "[Content_Types].xml").includes("/xl/sharedStrings.xml"),
    "the table was not declared in the content types",
  );
  assert.ok(
    textOf(parts, "xl/_rels/workbook.xml.rels").includes("sharedStrings.xml"),
    "the table was not related to the workbook",
  );
});

test("repeated text is stored once and shared", () => {
  const parts = brokenWorkbook();
  const sheet = textOf(parts, "xl/worksheets/sheet1.xml").replace("L-002", "L-001");
  parts.set("xl/worksheets/sheet1.xml", encoder.encode(sheet));

  const repaired = repairWorkbook(parts).parts;
  assert.match(textOf(repaired, "xl/sharedStrings.xml"), /count="9" uniqueCount="8"/);
});

test("the frozen pane gets the selection Excel copies through", () => {
  const sheet = textOf(repairWorkbook(brokenWorkbook()).parts, "xl/worksheets/sheet1.xml");

  assert.match(
    sheet,
    /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/><selection pane="bottomLeft" activeCell="A2" sqref="A2"\/>/,
  );
  assert.ok(!sheet.includes("freezeHeader"), "an invented sheetView attribute survived");
});

test("a sheet view with no pane still gets a selection", () => {
  const parts = brokenWorkbook();
  parts.set(
    "xl/worksheets/sheet1.xml",
    encoder.encode(
      textOf(parts, "xl/worksheets/sheet1.xml").replace(
        /<sheetViews>[\s\S]*?<\/sheetViews>/,
        `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`,
      ),
    ),
  );

  const sheet = textOf(repairWorkbook(parts).parts, "xl/worksheets/sheet1.xml");
  assert.match(sheet, /<sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"\/><\/sheetView>/);
});

test("a sheet view with no workbookViewId gets one", () => {
  const parts = brokenWorkbook();
  parts.set(
    "xl/worksheets/sheet1.xml",
    encoder.encode(
      textOf(parts, "xl/worksheets/sheet1.xml").replace(` workbookViewId="0"`, ""),
    ),
  );

  const { parts: repaired, issues } = repairWorkbook(parts);
  assert.ok(issues.some((issue) => /workbookViewId/.test(issue.message)));
  assert.match(textOf(repaired, "xl/worksheets/sheet1.xml"), /workbookViewId="0"/);
});

test("the filter is narrowed to the sheet and named in the workbook", () => {
  const { parts } = repairWorkbook(brokenWorkbook());

  assert.match(
    textOf(parts, "xl/worksheets/sheet1.xml"),
    /<\/sheetData><autoFilter ref="A1:C3"\/>/,
  );
  assert.match(
    textOf(parts, "xl/workbook.xml"),
    /<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">&apos;DHG jelentés&apos;!\$A\$1:\$C\$3<\/definedName><\/definedNames>/,
  );
});

test("a filter over a header with no rows under it is dropped", () => {
  const parts = brokenWorkbook();
  const sheet = textOf(parts, "xl/worksheets/sheet1.xml")
    .replace(`<dimension ref="A1:C3"/>`, `<dimension ref="A1:C1"/>`)
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, "<sheetData/>");
  parts.set("xl/worksheets/sheet1.xml", encoder.encode(sheet));

  const { parts: repaired } = repairWorkbook(parts);
  assert.ok(!textOf(repaired, "xl/worksheets/sheet1.xml").includes("autoFilter"));
  assert.ok(!textOf(repaired, "xl/workbook.xml").includes("_FilterDatabase"));
});

test("a filter written before the sheet data is moved after it", () => {
  const parts = brokenWorkbook();
  const sheet = textOf(parts, "xl/worksheets/sheet1.xml")
    .replace(`<autoFilter ref="A1:C501"/>`, "")
    .replace("<sheetData>", `<autoFilter ref="A1:C3"/><sheetData>`);
  parts.set("xl/worksheets/sheet1.xml", encoder.encode(sheet));

  const { parts: repaired, issues } = repairWorkbook(parts);
  assert.ok(issues.some((issue) => /out of order/.test(issue.message)));
  assert.match(
    textOf(repaired, "xl/worksheets/sheet1.xml"),
    /<\/sheetData><autoFilter ref="A1:C3"\/>/,
  );
});

test("--strip-filters leaves no filter and no name behind", () => {
  const { parts } = repairWorkbook(brokenWorkbook(), { stripFilters: true });

  assert.ok(!textOf(parts, "xl/worksheets/sheet1.xml").includes("autoFilter"));
  assert.ok(!textOf(parts, "xl/workbook.xml").includes("_FilterDatabase"));
});

test("defined names that are not the filter's are kept", () => {
  const parts = brokenWorkbook();
  parts.set(
    "xl/workbook.xml",
    encoder.encode(
      textOf(parts, "xl/workbook.xml").replace(
        "</sheets>",
        `</sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'DHG jelentés'!$A$1:$C$3</definedName></definedNames>`,
      ),
    ),
  );

  const workbook = textOf(repairWorkbook(parts).parts, "xl/workbook.xml");
  assert.ok(workbook.includes("_xlnm.Print_Area"));
  assert.ok(workbook.includes("_xlnm._FilterDatabase"));
});

test("a theme colour is spelled out when the package carries no theme", () => {
  const { parts } = repairWorkbook(brokenWorkbook());
  assert.match(textOf(parts, "xl/styles.xml"), /<color rgb="FF000000"\/>/);

  const withTheme = brokenWorkbook();
  withTheme.set("xl/theme/theme1.xml", encoder.encode("<a:theme/>"));
  assert.match(textOf(repairWorkbook(withTheme).parts, "xl/styles.xml"), /<color theme="1"\/>/);
});

test("the package gains the properties and the window it was missing", () => {
  const { parts } = repairWorkbook(brokenWorkbook());

  assert.ok(parts.has("docProps/core.xml"));
  assert.ok(textOf(parts, "[Content_Types].xml").includes("/docProps/core.xml"));
  assert.ok(textOf(parts, "_rels/.rels").includes("docProps/core.xml"));
  assert.match(textOf(parts, "xl/workbook.xml"), /<bookViews><workbookView /);
  assert.match(textOf(parts, "xl/workbook.xml"), /<calcPr calcId="\d+"\/><\/workbook>/);
});

test("a repaired workbook has nothing left to repair", () => {
  const once = repairWorkbook(brokenWorkbook()).parts;
  const { issues } = repairWorkbook(once);

  assert.deepEqual(issues, [], `a second pass still found work: ${JSON.stringify(issues)}`);
});

test("the data reads back cell for cell after repair", () => {
  const { parts } = repairWorkbook(brokenWorkbook());
  assert.deepEqual(gridOf(parts), GRID);
});

test("the CLI cleans a file and then reports it clean", () => {
  const directory = mkdtempSync(join(tmpdir(), "fix-xlsx-"));
  const source = join(directory, "DHG_2026-02-06.xlsx");
  writeFileSync(source, writeZip(brokenWorkbook()));

  const cli = join(root, "scripts", "fix-xlsx.mjs");
  const output = execFileSync(process.execPath, [cli, source], { encoding: "utf8" });
  assert.match(output, /problems/);

  const cleaned = join(directory, "DHG_2026-02-06.cleaned.xlsx");
  assert.ok(existsSync(cleaned), "the cleaned file was not written");
  assert.deepEqual(gridOf(readZip(readFileSync(cleaned))), GRID);

  const checked = execFileSync(process.execPath, [cli, "--check", cleaned], { encoding: "utf8" });
  assert.match(checked, /already Excel 2016 compatible/);
});

test("--check fails on a file that still needs cleaning", () => {
  const directory = mkdtempSync(join(tmpdir(), "fix-xlsx-"));
  const source = join(directory, "broken.xlsx");
  writeFileSync(source, writeZip(brokenWorkbook()));

  assert.throws(
    () =>
      execFileSync(process.execPath, [join(root, "scripts", "fix-xlsx.mjs"), "--check", source], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    (error) => error.status === 1,
  );
});

/**
 * The export itself, run through the same rules. Nothing to fix means the
 * function writes what the cleaner would have produced, which is the only way
 * the two stay in step as either changes.
 */
test("the export writes a workbook the cleaner finds nothing wrong with", async (t) => {
  const esbuild = join(root, "node_modules", ".bin", "esbuild");
  if (!existsSync(esbuild)) {
    t.skip("esbuild is not installed, so the TypeScript export cannot be loaded");
    return;
  }

  const directory = mkdtempSync(join(tmpdir(), "xlsx-writer-"));
  const bundle = join(directory, "xlsx.mjs");
  execFileSync(esbuild, [
    join(root, "netlify", "shared", "xlsx.ts"),
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${bundle}`,
  ]);

  const { buildXlsx } = await import(bundle);

  const columns = GRID[0].map((label) => ({ label, width: 18, fill: "92D050" }));
  const parts = readZip(
    buildXlsx(
      { name: "DHG", columns, rows: GRID.slice(1) },
      [{ name: "L-001", images: [] }],
      new Date("2026-02-06T08:00:00Z"),
    ),
  );

  assert.doesNotThrow(() => assertWorkbook(parts));
  assert.deepEqual(gridOf(parts), GRID);

  const { issues } = repairWorkbook(parts);
  assert.deepEqual(issues, [], `the export still writes faults: ${JSON.stringify(issues, null, 2)}`);
});
