/**
 * Minimal XLSX writer.
 *
 * SheetJS can lay out cells but cannot embed pictures, and the export has to
 * carry the uploaded photos on tabs of their own. The OOXML package is
 * small enough to emit by hand, so the workbook is assembled here and zipped
 * with the store-only writer already used for downloads.
 *
 * Excel 2016 is the oldest version the warehouse runs and the strictest reader
 * of the three parts this writer used to get wrong, so the package now mirrors
 * what Excel itself writes:
 *
 *  - Cell text goes through `xl/sharedStrings.xml`. Inline strings are legal
 *    OOXML but 2016 carries them as cached values, and pasting them into
 *    another workbook drops the text — the reason a download could be read on
 *    screen but not copied out of.
 *  - Every `sheetView` carries a `selection` for its active pane. A frozen
 *    pane with no selection leaves 2016 without a valid copy source.
 *  - An `autoFilter` is paired with the `_xlnm._FilterDatabase` defined name
 *    Excel keeps alongside it, and is left out of a sheet that has no rows to
 *    filter.
 *
 * `scripts/fix-xlsx.mjs` applies the same rules to a file that was already
 * downloaded, and `--check` audits one against them.
 */

import { createZip, type ZipEntry } from "./zip.js";

export type SheetColumn = {
  label: string;
  width: number;
  /** Header fill as an RGB hex string, e.g. "92D050". */
  fill: string;
};

export type SheetImage = {
  data: Uint8Array;
  contentType: string;
};

/** One tab per line that actually has photos, named by the export. */
export type ImageSheet = {
  name: string;
  images: SheetImage[];
};

export type DataSheet = {
  name: string;
  columns: SheetColumn[];
  rows: string[][];
};

const EMU_PER_PIXEL = 9525;
const MAX_IMAGE_WIDTH = 720;
const DEFAULT_ROW_HEIGHT = 20;
const FALLBACK_IMAGE_SIZE = { width: 800, height: 600 };

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const DRAWING_MAIN_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const CORE_PROPS_NS =
  "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const EXTENDED_PROPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";
const DC_NS = "http://purl.org/dc/elements/1.1/";
const DCTERMS_NS = "http://purl.org/dc/terms/";
const XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";

/** Excel 2016's own calculation-chain stamp; 2016 rewrites it on first save. */
const CALC_ID = "162913";

/** Named in the package properties so a repaired file can be traced back here. */
const APPLICATION = "GyorDHG Export";

/** Printing defaults Excel writes into every sheet, in inches. */
const PAGE_MARGINS =
  `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>`;

const encoder = new TextEncoder();

function xmlFile(body: string) {
  return encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`);
}

function escapeXml(value: string) {
  return value
    // Control characters are illegal in XML 1.0 and make Excel reject the file.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let name = "";
  let cursor = index;
  while (cursor >= 0) {
    name = String.fromCharCode(65 + (cursor % 26)) + name;
    cursor = Math.floor(cursor / 26) - 1;
  }
  return name;
}

/**
 * Excel rejects a few punctuation marks in tab names and caps them at 31
 * characters, so a name is trimmed to fit before it becomes a sheet name.
 */
function sheetName(value: string, fallback: string) {
  const cleaned = value
    .replace(/[\\/?*[\]:]/g, "-")
    .replace(/^'+|'+$/g, "")
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function imageExtensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function contentTypeForExtension(extension: string) {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

/**
 * Excel needs an explicit size for every picture, so the intrinsic dimensions
 * are read straight from the file header. Unknown encodings fall back to 4:3.
 */
function readImageSize(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let cursor = 2;
    while (cursor + 9 < data.length) {
      if (data[cursor] !== 0xff) {
        cursor += 1;
        continue;
      }
      const marker = data[cursor + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        cursor += 2;
        continue;
      }
      const length = view.getUint16(cursor + 2);
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) {
        return { height: view.getUint16(cursor + 5), width: view.getUint16(cursor + 7) };
      }
      cursor += 2 + length;
    }
  }

  if (data.length > 30 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42) {
    const chunk = String.fromCharCode(data[12], data[13], data[14], data[15]);
    if (chunk === "VP8X") {
      return {
        width: (data[24] | (data[25] << 8) | (data[26] << 16)) + 1,
        height: (data[27] | (data[28] << 8) | (data[29] << 16)) + 1,
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
  }

  return FALLBACK_IMAGE_SIZE;
}

function displaySize(data: Uint8Array) {
  const { width, height } = readImageSize(data);
  const safeWidth = width > 0 ? width : FALLBACK_IMAGE_SIZE.width;
  const safeHeight = height > 0 ? height : FALLBACK_IMAGE_SIZE.height;
  const scale = Math.min(1, MAX_IMAGE_WIDTH / safeWidth);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function buildStyles(fills: string[]) {
  const fillXml = fills
    .map(
      (color) =>
        `<fill><patternFill patternType="solid"><fgColor rgb="FF${color.toUpperCase()}"/><bgColor indexed="64"/></patternFill></fill>`,
    )
    .join("");

  // xf 0: plain, xf 1: bordered body cell, xf 2+: one header style per fill.
  const headerXfs = fills
    .map(
      (_, index) =>
        `<xf numFmtId="49" fontId="1" fillId="${index + 2}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`,
    )
    .join("");

  return xmlFile(
    `<styleSheet xmlns="${MAIN_NS}">` +
      `<fonts count="2">` +
      // Spelled out in RGB rather than as a theme index: the package carries no
      // theme part, and 2016 treats a dangling theme colour as a damaged file.
      `<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>` +
      `</fonts>` +
      `<fills count="${fills.length + 2}">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      fillXml +
      `</fills>` +
      `<borders count="2">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border>` +
      `<left style="thin"><color rgb="FF7F7F7F"/></left>` +
      `<right style="thin"><color rgb="FF7F7F7F"/></right>` +
      `<top style="thin"><color rgb="FF7F7F7F"/></top>` +
      `<bottom style="thin"><color rgb="FF7F7F7F"/></bottom>` +
      `<diagonal/>` +
      `</border>` +
      `</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${fills.length + 2}">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>` +
      headerXfs +
      `</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `<dxfs count="0"/>` +
      `<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>` +
      `</styleSheet>`,
  );
}

/**
 * The shared string table.
 *
 * Every text cell points at an entry here instead of carrying its own
 * `inlineStr`. Excel 2016 hands inline text to the clipboard as a cached value
 * and pastes it into another workbook as an empty cell, which is what stopped
 * the download from being copied anywhere.
 */
function createStringTable() {
  const items: string[] = [];
  const lookup = new Map<string, number>();
  let uses = 0;

  return {
    /** Interns a value and returns the index the cell should reference. */
    add(value: string) {
      uses += 1;
      const existing = lookup.get(value);
      if (existing !== undefined) return existing;

      const index = items.length;
      items.push(value);
      lookup.set(value, index);
      return index;
    },
    build() {
      return xmlFile(
        `<sst xmlns="${MAIN_NS}" count="${uses}" uniqueCount="${items.length}">` +
          items
            .map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`)
            .join("") +
          `</sst>`,
      );
    },
  };
}

type StringTable = ReturnType<typeof createStringTable>;

function textCell(reference: string, style: number, value: string, strings: StringTable) {
  if (!value) return `<c r="${reference}" s="${style}"/>`;
  return `<c r="${reference}" s="${style}" t="s"><v>${strings.add(value)}</v></c>`;
}

function buildDataSheet(sheet: DataSheet, headerStyles: number[], strings: StringTable) {
  // Every export names its columns from a constant, so a grid with none is not
  // a case that arises — but a dimension has to name a column either way.
  const lastColumn = columnName(Math.max(sheet.columns.length - 1, 0));
  const lastRow = sheet.rows.length + 1;
  const span = `1:${Math.max(sheet.columns.length, 1)}`;

  const cols = sheet.columns
    .map(
      (column, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`,
    )
    .join("");

  const header =
    `<row r="1" spans="${span}" ht="30" customHeight="1">` +
    sheet.columns
      .map((column, index) =>
        textCell(`${columnName(index)}1`, headerStyles[index], column.label, strings),
      )
      .join("") +
    `</row>`;

  const body = sheet.rows
    .map((row, rowIndex) => {
      const reference = rowIndex + 2;
      const cells = sheet.columns
        .map((_, index) =>
          textCell(`${columnName(index)}${reference}`, 1, row[index] ?? "", strings),
        )
        .join("");
      return `<row r="${reference}" spans="${span}">${cells}</row>`;
    })
    .join("");

  // A filter over the header alone is what Excel drops on save, so a grid with
  // no rows yet gets none. The same range becomes the _FilterDatabase name.
  const filterRef =
    sheet.columns.length > 0 && sheet.rows.length > 0 ? `A1:${lastColumn}${lastRow}` : null;

  const data = xmlFile(
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      `<dimension ref="A1:${lastColumn}${lastRow}"/>` +
      `<sheetViews><sheetView tabSelected="1" workbookViewId="0">` +
      `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
      // The frozen pane needs a selection of its own. Without one the active
      // pane has no anchor cell and 2016 refuses to copy out of the sheet.
      `<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>` +
      `</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      (cols ? `<cols>${cols}</cols>` : ``) +
      `<sheetData>${header}${body}</sheetData>` +
      (filterRef ? `<autoFilter ref="${filterRef}"/>` : ``) +
      PAGE_MARGINS +
      `</worksheet>`,
  );

  return { data, filterRef };
}

function buildImageSheet() {
  return xmlFile(
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      `<dimension ref="A1"/>` +
      `<sheetViews><sheetView workbookViewId="0">` +
      `<selection activeCell="A1" sqref="A1"/>` +
      `</sheetView></sheetViews>` +
      `<sheetFormatPr defaultRowHeight="15"/>` +
      `<sheetData/>` +
      PAGE_MARGINS +
      `<drawing r:id="rId1"/>` +
      `</worksheet>`,
  );
}

function buildDrawing(images: { width: number; height: number }[]) {
  let row = 0;

  const anchors = images
    .map((image, index) => {
      const from = row;
      row += Math.ceil(image.height / DEFAULT_ROW_HEIGHT) + 2;

      return (
        `<xdr:oneCellAnchor>` +
        `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff>` +
        `<xdr:row>${from}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${image.width * EMU_PER_PIXEL}" cy="${image.height * EMU_PER_PIXEL}"/>` +
        `<xdr:pic>` +
        `<xdr:nvPicPr>` +
        `<xdr:cNvPr id="${index + 1}" name="Photo ${index + 1}"/>` +
        `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>` +
        `</xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr>` +
        `<a:xfrm><a:off x="0" y="0"/>` +
        `<a:ext cx="${image.width * EMU_PER_PIXEL}" cy="${image.height * EMU_PER_PIXEL}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
        `</xdr:spPr>` +
        `</xdr:pic>` +
        `<xdr:clientData/>` +
        `</xdr:oneCellAnchor>`
      );
    })
    .join("");

  return xmlFile(
    `<xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${DRAWING_MAIN_NS}" xmlns:r="${REL_NS}">${anchors}</xdr:wsDr>`,
  );
}

/**
 * A relationship type is given as a suffix under the officeDocument namespace,
 * which is where all but one of them live. The core properties hang off the
 * package namespace instead, so an absolute type is passed through as-is.
 */
function relationships(items: { id: string; type: string; target: string }[]) {
  return xmlFile(
    `<Relationships xmlns="${PACKAGE_REL_NS}">` +
      items
        .map((item) => {
          const type = item.type.startsWith("http") ? item.type : `${REL_NS}/${item.type}`;
          return `<Relationship Id="${item.id}" Type="${type}" Target="${item.target}"/>`;
        })
        .join("") +
      `</Relationships>`,
  );
}

/**
 * Excel 2016 expects a package to describe itself. The properties carry nothing
 * the warehouse needs, but a package without them opens on the repair path.
 */
function buildCoreProps(created: Date) {
  const stamp = `${created.toISOString().slice(0, 19)}Z`;

  return xmlFile(
    `<cp:coreProperties xmlns:cp="${CORE_PROPS_NS}" xmlns:dc="${DC_NS}" ` +
      `xmlns:dcterms="${DCTERMS_NS}" xmlns:xsi="${XSI_NS}">` +
      `<dc:creator>${APPLICATION}</dc:creator>` +
      `<cp:lastModifiedBy>${APPLICATION}</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
      `</cp:coreProperties>`,
  );
}

function buildAppProps() {
  return xmlFile(
    `<Properties xmlns="${EXTENDED_PROPS_NS}">` +
      `<Application>${APPLICATION}</Application>` +
      `</Properties>`,
  );
}

/** `A1:L25` becomes `$A$1:$L$25`, the form a defined name has to be written in. */
function absoluteRef(ref: string) {
  return ref.replace(/([A-Z]+)(\d+)/g, (_match, column, row) => `$${column}$${row}`);
}

/**
 * A sheet name inside a defined name is always quoted. Excel only needs the
 * quotes for names carrying spaces or punctuation, but quoting every one of
 * them is just as valid and saves deciding which is which.
 */
function quotedSheetRef(name: string, ref: string) {
  return `'${name.replace(/'/g, "''")}'!${absoluteRef(ref)}`;
}

/**
 * Builds the whole package: the data grid on the first tab, then one tab per
 * photographed line carrying its pictures.
 */
export function buildXlsx(dataSheet: DataSheet, imageSheets: ImageSheet[], created = new Date()) {
  const fills: string[] = [];
  const headerStyles = dataSheet.columns.map((column) => {
    const key = column.fill.replace("#", "").toUpperCase();
    const existing = fills.indexOf(key);
    if (existing >= 0) return existing + 2;
    fills.push(key);
    return fills.length + 1;
  });

  const usedSheetNames = new Set([dataSheet.name.toLowerCase()]);
  const tabs = imageSheets
    .filter((sheet) => sheet.images.length > 0)
    .map((sheet, index) => {
      // Two tabs can genuinely want the same name — the pieces of one qty share
      // a serial number — so repeats are numbered off the original name rather
      // than off the last attempt, which would stack suffixes.
      const base = sheetName(sheet.name, `Photos ${index + 1}`);
      let name = base;
      let attempt = 2;
      while (usedSheetNames.has(name.toLowerCase())) {
        name = `${base.slice(0, 27)} (${attempt})`;
        attempt += 1;
      }
      usedSheetNames.add(name.toLowerCase());
      return { ...sheet, name };
    });

  const strings = createStringTable();
  const entries: ZipEntry[] = [];
  const overrides: string[] = [
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`,
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ];
  const extensions = new Set<string>();

  const grid = buildDataSheet(dataSheet, headerStyles, strings);
  entries.push({ name: "xl/worksheets/sheet1.xml", data: grid.data });

  let mediaCount = 0;
  tabs.forEach((tab, tabIndex) => {
    const sheetNumber = tabIndex + 2;
    const drawingNumber = tabIndex + 1;
    const media = tab.images.map((image) => {
      mediaCount += 1;
      const extension = imageExtensionFor(image.contentType);
      extensions.add(extension);
      const target = `image${mediaCount}.${extension}`;
      entries.push({ name: `xl/media/${target}`, data: image.data });
      return { target, ...displaySize(image.data) };
    });

    entries.push({
      name: `xl/worksheets/sheet${sheetNumber}.xml`,
      data: buildImageSheet(),
    });
    entries.push({
      name: `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`,
      data: relationships([
        { id: "rId1", type: "drawing", target: `../drawings/drawing${drawingNumber}.xml` },
      ]),
    });
    entries.push({
      name: `xl/drawings/drawing${drawingNumber}.xml`,
      data: buildDrawing(media),
    });
    entries.push({
      name: `xl/drawings/_rels/drawing${drawingNumber}.xml.rels`,
      data: relationships(
        media.map((image, index) => ({
          id: `rId${index + 1}`,
          type: "image",
          target: `../media/${image.target}`,
        })),
      ),
    });

    overrides.push(
      `<Override PartName="/xl/worksheets/sheet${sheetNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      `<Override PartName="/xl/drawings/drawing${drawingNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    );
  });

  const sheets = [dataSheet.name, ...tabs.map((tab) => tab.name)];

  // Excel keeps a hidden built-in name pointing at every filtered range and
  // reads the filter through it. An autoFilter on its own leaves the sheet
  // half-filtered: the arrows are drawn but the range behind them is unknown.
  const definedNames = grid.filterRef
    ? `<definedNames>` +
      `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">` +
      escapeXml(quotedSheetRef(dataSheet.name, grid.filterRef)) +
      `</definedName>` +
      `</definedNames>`
    : ``;

  const workbook = xmlFile(
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      `<fileVersion appName="xl" lastEdited="6" lowestEdited="6" rupBuild="14420"/>` +
      `<workbookPr/>` +
      // 2016 needs a window to open the workbook into and a tab to land on.
      `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20490" windowHeight="7620" activeTab="0"/></bookViews>` +
      `<sheets>` +
      sheets
        .map(
          (name, index) =>
            `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("") +
      `</sheets>` +
      definedNames +
      `<calcPr calcId="${CALC_ID}"/>` +
      `</workbook>`,
  );

  const workbookRels = relationships([
    ...sheets.map((_, index) => ({
      id: `rId${index + 1}`,
      type: "worksheet",
      target: `worksheets/sheet${index + 1}.xml`,
    })),
    { id: `rId${sheets.length + 1}`, type: "styles", target: "styles.xml" },
    { id: `rId${sheets.length + 2}`, type: "sharedStrings", target: "sharedStrings.xml" },
  ]);

  const contentTypes = xmlFile(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      Array.from(extensions)
        .map(
          (extension) =>
            `<Default Extension="${extension}" ContentType="${contentTypeForExtension(extension)}"/>`,
        )
        .join("") +
      overrides.join("") +
      `</Types>`,
  );

  return createZip(
    [
      { name: "[Content_Types].xml", data: contentTypes },
      {
        name: "_rels/.rels",
        data: relationships([
          { id: "rId1", type: "officeDocument", target: "xl/workbook.xml" },
          {
            id: "rId2",
            type: `${PACKAGE_REL_NS}/metadata/core-properties`,
            target: "docProps/core.xml",
          },
          { id: "rId3", type: "extended-properties", target: "docProps/app.xml" },
        ]),
      },
      { name: "docProps/core.xml", data: buildCoreProps(created) },
      { name: "docProps/app.xml", data: buildAppProps() },
      { name: "xl/workbook.xml", data: workbook },
      { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
      { name: "xl/styles.xml", data: buildStyles(fills) },
      // Built last: the table only knows its contents once every cell has been
      // laid out, and the parts above are what point at it.
      { name: "xl/sharedStrings.xml", data: strings.build() },
      ...entries,
    ],
    created,
  );
}
