/**
 * The .xlsx clean-up rules.
 *
 * These are the same rules `netlify/shared/xlsx.ts` now writes by, applied to a
 * file that was downloaded before the export was fixed. A workbook goes in as a
 * map of package parts and comes out normalised, with a list of what was wrong
 * with it — `--check` reports that list and writes nothing.
 *
 * The parts are edited as text rather than through a DOM. An .xlsx is not
 * arbitrary XML: the parts are machine-written, one element deep where it
 * matters, and every rule here anchors on a tag name the format guarantees. A
 * parser would be the better tool for hand-written XML; for this it would only
 * add a dependency and reformat parts nobody asked it to touch.
 */

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const CORE_PROPS_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const EXTENDED_PROPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

const CONTENT_TYPES = "[Content_Types].xml";
const PACKAGE_RELS = "_rels/.rels";
const WORKBOOK = "xl/workbook.xml";
const WORKBOOK_RELS = "xl/_rels/workbook.xml.rels";
const SHARED_STRINGS = "xl/sharedStrings.xml";
const STYLES = "xl/styles.xml";
const CORE_PROPS = "docProps/core.xml";
const APP_PROPS = "docProps/app.xml";

const FILTER_DATABASE = "_xlnm._FilterDatabase";

/** Excel 2016's own calculation-chain stamp; 2016 rewrites it on first save. */
const CALC_ID = "162913";

/** CT_SheetView's attributes. Anything else in there is not a sheet view. */
const SHEET_VIEW_ATTRIBUTES = new Set([
  "windowProtection",
  "showFormulas",
  "showGridLines",
  "showRowColHeaders",
  "showZeros",
  "rightToLeft",
  "tabSelected",
  "showRuler",
  "showOutlineSymbols",
  "defaultGridColor",
  "showWhiteSpace",
  "view",
  "topLeftCell",
  "colorId",
  "zoomScale",
  "zoomScaleNormal",
  "zoomScaleSheetLayoutView",
  "zoomScalePageLayoutView",
  "workbookViewId",
]);

/** Theme colour slots, for a package that references a theme it does not carry. */
const THEME_COLOURS = ["FFFFFFFF", "FF000000", "FFEEECE1", "FF1F497D"];

function xmlFile(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body}`;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readText(parts, name) {
  const data = parts.get(name);
  return data ? decoder.decode(data) : null;
}

function writeText(parts, name, text) {
  parts.set(name, encoder.encode(text));
}

/** Reads one attribute off a start tag. */
function attribute(tag, name) {
  const match = new RegExp(`(?:^|\\s)${name.replace(/[:.]/g, "\\$&")}\\s*=\\s*"([^"]*)"`).exec(
    tag,
  );
  return match ? match[1] : null;
}

function withoutAttribute(tag, name) {
  return tag.replace(
    new RegExp(`\\s${name.replace(/[:.]/g, "\\$&")}\\s*=\\s*"[^"]*"`, "g"),
    "",
  );
}

/**
 * Matches an element by tag name in both spellings, self-closing and with
 * children. Every element these rules touch is one Excel writes without nesting
 * another of the same name inside it, so a lazy body match is exact.
 */
function elementPattern(tag) {
  return new RegExp(`<${tag}\\b[^>]*\\/>|<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "g");
}

function worksheetParts(parts) {
  return Array.from(parts.keys())
    .filter((name) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(name))
    .sort();
}

/** A relationship target, resolved to the package-absolute part name. */
function resolveTarget(base, target) {
  if (target.startsWith("/")) return target.slice(1);

  const segments = base.split("/").slice(0, -1);
  for (const segment of target.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== ".") segments.push(segment);
  }
  return segments.join("/");
}

/**
 * The sheets in workbook order: their names, their position (which is the
 * `localSheetId` a defined name is scoped by) and the part each one lives in.
 */
function readSheets(parts) {
  const workbook = readText(parts, WORKBOOK);
  const rels = readText(parts, WORKBOOK_RELS);
  if (!workbook || !rels) return [];

  const targets = new Map();
  for (const [tag] of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attribute(tag, "Id");
    const target = attribute(tag, "Target");
    if (id && target) targets.set(id, resolveTarget(WORKBOOK, target));
  }

  const sheetsBlock = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(workbook);
  if (!sheetsBlock) return [];

  return Array.from(sheetsBlock[1].matchAll(/<sheet\b[^>]*?\/?>/g)).map(([tag], index) => ({
    name: unescapeXml(attribute(tag, "name") ?? ""),
    localSheetId: index,
    part: targets.get(attribute(tag, "r:id") ?? "") ?? null,
  }));
}

function parseRef(ref) {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec((ref ?? "").replace(/\$/g, ""));
  if (!match) return null;

  return {
    firstColumn: match[1],
    firstRow: Number(match[2]),
    lastColumn: match[3] ?? match[1],
    lastRow: Number(match[4] ?? match[2]),
  };
}

function absoluteRef(ref) {
  return ref.replace(/([A-Z]+)(\d+)/g, (_match, column, row) => `$${column}$${row}`);
}

/** The pane a freeze makes active, when the file does not say. */
function activePaneFor(pane) {
  const xSplit = Number(attribute(pane, "xSplit") ?? "0");
  const ySplit = Number(attribute(pane, "ySplit") ?? "0");
  if (xSplit > 0 && ySplit > 0) return "bottomRight";
  if (xSplit > 0) return "topRight";
  return "bottomLeft";
}

/**
 * Rule: a sheet view has to be a sheet view.
 *
 * `workbookViewId` is required, invented attributes make the part fail
 * validation, and a frozen pane needs a `selection` naming its active pane.
 * Without one the active pane has no anchor cell, and Excel 2016 will not copy
 * out of a sheet whose selection it cannot resolve — the file opens and reads
 * fine, and Ctrl+C comes back with nothing to paste.
 */
function fixSheetViews(text, report) {
  return text.replace(elementPattern("sheetView"), (element) => {
    const openTag = /^<sheetView\b[^>]*?\/?>/.exec(element)[0];
    const isSelfClosing = openTag.endsWith("/>");
    const inner = isSelfClosing
      ? ""
      : element.slice(openTag.length, element.lastIndexOf("</sheetView>"));

    let attributes = "";
    for (const [, name, value] of openTag.matchAll(/\s([\w:]+)\s*=\s*"([^"]*)"/g)) {
      if (SHEET_VIEW_ATTRIBUTES.has(name)) attributes += ` ${name}="${value}"`;
      else report("sheet-view", `dropped unknown sheetView attribute ${name}`);
    }
    if (!attribute(attributes, "workbookViewId")) {
      report("sheet-view", "sheetView had no workbookViewId");
      attributes += ` workbookViewId="0"`;
    }

    const pane = (inner.match(/<pane\b[^>]*\/>/) ?? [])[0] ?? null;
    const selections = Array.from(inner.matchAll(/<selection\b[^>]*\/>/g), ([tag]) => tag);
    // Anything else a view may carry — a pivot selection, an extension list —
    // is kept as it was and stays after the selections, where the schema puts it.
    const rest = inner
      .replace(/<pane\b[^>]*\/>/g, "")
      .replace(/<selection\b[^>]*\/>/g, "")
      .trim();

    let fixedPane = pane;
    if (pane) {
      const state = attribute(pane, "state") ?? "split";
      const active = attribute(pane, "activePane");
      if (!active) {
        report("sheet-view", "frozen pane had no activePane");
        fixedPane = pane.replace(/\/>$/, ` activePane="${activePaneFor(pane)}"/>`);
      }

      const wanted = attribute(fixedPane, "activePane");
      if (!selections.some((selection) => attribute(selection, "pane") === wanted)) {
        report(
          "sheet-view",
          `${state} pane "${wanted}" had no selection, so the sheet had no copy source`,
        );
        const anchor = attribute(fixedPane, "topLeftCell") ?? "A1";
        selections.push(`<selection pane="${wanted}" activeCell="${anchor}" sqref="${anchor}"/>`);
      }
    } else if (selections.length === 0) {
      report("sheet-view", "sheetView had no selection");
      selections.push(`<selection activeCell="A1" sqref="A1"/>`);
    }

    return (
      `<sheetView${attributes}>` +
      (fixedPane ?? "") +
      selections.join("") +
      rest +
      `</sheetView>`
    );
  });
}

/**
 * Elements the schema allows between the sheet data and the filter. None of the
 * exports carry one, but a sheet that does gets its filter left where it is
 * rather than hoisted in front of something it has to follow.
 */
const BETWEEN_DATA_AND_FILTER =
  /<(?:sheetCalcPr|sheetProtection|protectedRanges|scenarios)\b/;

/**
 * Rule: an autoFilter describes a range that exists, sits where the schema puts
 * it, and is not left on a sheet with nothing in it.
 *
 * Returns the range the sheet ends up filtering, so the workbook's built-in
 * `_FilterDatabase` name can be rebuilt to match.
 */
function fixAutoFilter(text, report, stripFilters) {
  const filters = Array.from(text.matchAll(elementPattern("autoFilter")), ([element]) => element);
  if (filters.length === 0) return { text, filterRef: null };

  // A filter can also belong to a custom view, and telling them apart by
  // position is not worth guessing at. Those sheets are reported, not touched.
  if (/<customSheetViews\b/.test(text)) {
    report("auto-filter", "sheet has custom views, so its filters were left alone");
    return { text, filterRef: null };
  }

  const stripped = text.replace(elementPattern("autoFilter"), "");
  if (stripFilters) {
    report("auto-filter", "removed the autoFilter");
    return { text: stripped, filterRef: null };
  }

  const dimension = parseRef(attribute(/<dimension\b[^>]*\/?>/.exec(text)?.[0] ?? "", "ref"));
  if (!dimension) {
    report("auto-filter", "sheet has no dimension, so its filter range cannot be checked");
    return { text, filterRef: null };
  }

  if (dimension.lastRow <= dimension.firstRow) {
    report("auto-filter", "removed a filter over a header with no rows under it");
    return { text: stripped, filterRef: null };
  }

  const dataEnd = text.indexOf("</sheetData>");
  if (dataEnd < 0) {
    report("auto-filter", "sheet has no sheetData, so its filter could not be placed");
    return { text, filterRef: null };
  }

  const filterRef = `${dimension.firstColumn}${dimension.firstRow}:${dimension.lastColumn}${dimension.lastRow}`;
  const current = parseRef(attribute(filters[0], "ref"));
  if (!current) {
    report("auto-filter", "autoFilter had no usable ref");
  } else if (current.lastRow !== dimension.lastRow || current.lastColumn !== dimension.lastColumn) {
    report(
      "auto-filter",
      `autoFilter ref ${attribute(filters[0], "ref")} did not match the sheet, corrected to ${filterRef}`,
    );
  }

  // Rewritten where it stands when the sheet has something the filter has to
  // come after; otherwise it goes straight after the data, where Excel puts it.
  if (BETWEEN_DATA_AND_FILTER.test(text)) {
    return {
      text: text.replace(elementPattern("autoFilter"), `<autoFilter ref="${filterRef}"/>`),
      filterRef,
    };
  }

  const cut = dataEnd + "</sheetData>".length;
  if (!text.startsWith("<autoFilter", cut)) {
    report("auto-filter", "autoFilter was out of order and was moved after the sheet data");
  }

  const strippedCut = stripped.indexOf("</sheetData>") + "</sheetData>".length;
  return {
    text:
      stripped.slice(0, strippedCut) +
      `<autoFilter ref="${filterRef}"/>` +
      stripped.slice(strippedCut),
    filterRef,
  };
}

/** Rule: `<cols>` has to hold at least one column. */
function fixEmptyCols(text, report) {
  if (!/<cols\s*\/>|<cols\b[^>]*>\s*<\/cols>/.test(text)) return text;
  report("empty-cols", "removed an empty cols element");
  return text.replace(/<cols\s*\/>|<cols\b[^>]*>\s*<\/cols>/g, "");
}

/** The strings already in the table, so rewritten cells keep pointing at them. */
function readSharedStrings(parts) {
  const text = readText(parts, SHARED_STRINGS);
  if (!text) return { items: [], lookup: new Map() };

  const items = [];
  const lookup = new Map();
  for (const [element] of text.matchAll(elementPattern("si"))) {
    const body = /^<si\b[^>]*\/>$/.test(element)
      ? ""
      : element.replace(/^<si\b[^>]*>/, "").replace(/<\/si>$/, "");
    if (!lookup.has(body)) lookup.set(body, items.length);
    items.push(body);
  }

  return { items, lookup };
}

/**
 * Rule: text lives in the shared string table.
 *
 * `inlineStr` cells are legal, but Excel 2016 treats inline text as a cached
 * value: the cell displays, and copying it into another workbook pastes an
 * empty cell. This is the one that made the export unusable — the data was all
 * there on screen and none of it would come out.
 *
 * `<si>` and `<is>` hold the same content, so a cell's body moves into the table
 * untouched and formatting runs inside it survive.
 */
function fixInlineStrings(parts, report) {
  const table = readSharedStrings(parts);
  const before = table.items.length;
  let rewritten = 0;

  for (const part of worksheetParts(parts)) {
    const text = readText(parts, part);
    const fixed = text.replace(
      /<c\b[^>]*\bt="inlineStr"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,
      (element) => {
        const openTag = /^<c\b[^>]*?\/?>/.exec(element)[0];
        const cell = withoutAttribute(openTag, "t").replace(/\s*\/?>$/, "");
        rewritten += 1;

        const inline = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(element);
        if (!inline) return `${cell}/>`;

        const body = inline[1];
        let index = table.lookup.get(body);
        if (index === undefined) {
          index = table.items.length;
          table.lookup.set(body, index);
          table.items.push(body);
        }

        return `${cell} t="s"><v>${index}</v></c>`;
      },
    );

    if (fixed !== text) writeText(parts, part, fixed);
  }

  if (rewritten === 0) return;

  report(
    "inline-strings",
    `moved ${rewritten} inline-string cell${rewritten === 1 ? "" : "s"} into the shared string table`,
  );

  // The count is how many cells point into the table, which is every string
  // cell in the workbook, not only the ones just rewritten.
  const uses = worksheetParts(parts).reduce(
    (total, part) => total + (readText(parts, part).match(/<c\b[^>]*\bt="s"/g) ?? []).length,
    0,
  );

  writeText(
    parts,
    SHARED_STRINGS,
    xmlFile(
      `<sst xmlns="${MAIN_NS}" count="${uses}" uniqueCount="${table.items.length}">` +
        table.items.map((body) => `<si>${body}</si>`).join("") +
        `</sst>`,
    ),
  );

  if (before === 0) {
    ensureOverride(
      parts,
      SHARED_STRINGS,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
    );
    ensureWorkbookRelationship(parts, "sharedStrings", "sharedStrings.xml");
  }
}

/**
 * Rule: a colour cannot point into a theme the package does not carry. Excel
 * 2016 reads a dangling theme index as damage and opens the file repaired,
 * which is a state it disables parts of the ribbon in.
 */
function fixThemeColours(parts, report) {
  const text = readText(parts, STYLES);
  if (!text || parts.has("xl/theme/theme1.xml") || !/\btheme="/.test(text)) return;

  const fixed = text.replace(
    /<(color|fgColor|bgColor|tabColor)\b([^>]*)\/>/g,
    (element, tag, attributes) => {
      const theme = attribute(attributes, "theme");
      if (theme === null) return element;
      return `<${tag} rgb="${THEME_COLOURS[Number(theme)] ?? "FF000000"}"/>`;
    },
  );

  if (fixed === text) return;
  report("theme-color", "replaced theme colours with explicit RGB, the package carries no theme");
  writeText(parts, STYLES, fixed);
}

function ensureOverride(parts, partName, contentType) {
  const text = readText(parts, CONTENT_TYPES);
  if (!text || text.includes(`PartName="/${partName}"`)) return;

  writeText(
    parts,
    CONTENT_TYPES,
    text.replace(
      "</Types>",
      `<Override PartName="/${partName}" ContentType="${contentType}"/></Types>`,
    ),
  );
}

function nextRelationshipId(text) {
  const used = Array.from(text.matchAll(/\sId="rId(\d+)"/g), ([, id]) => Number(id));
  return `rId${Math.max(0, ...used) + 1}`;
}

function ensureWorkbookRelationship(parts, type, target) {
  const text = readText(parts, WORKBOOK_RELS);
  if (!text || text.includes(`Target="${target}"`)) return;

  writeText(
    parts,
    WORKBOOK_RELS,
    text.replace(
      "</Relationships>",
      `<Relationship Id="${nextRelationshipId(text)}" Type="${REL_NS}/${type}" Target="${target}"/></Relationships>`,
    ),
  );
}

function ensurePackageRelationship(parts, type, target) {
  const text = readText(parts, PACKAGE_RELS);
  if (!text || text.includes(`Target="${target}"`)) return;

  writeText(
    parts,
    PACKAGE_RELS,
    text.replace(
      "</Relationships>",
      `<Relationship Id="${nextRelationshipId(text)}" Type="${type}" Target="${target}"/></Relationships>`,
    ),
  );
}

/** Rule: the package says who wrote it and when. */
function fixDocProps(parts, report, now) {
  if (parts.has(CORE_PROPS) && parts.has(APP_PROPS)) return;
  report("doc-props", "added the missing package properties");

  const stamp = `${now.toISOString().slice(0, 19)}Z`;
  if (!parts.has(CORE_PROPS)) {
    writeText(
      parts,
      CORE_PROPS,
      xmlFile(
        `<cp:coreProperties xmlns:cp="${CORE_PROPS_NS}" ` +
          `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
          `xmlns:dcterms="http://purl.org/dc/terms/" ` +
          `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
          `<dc:creator>fix-xlsx</dc:creator>` +
          `<cp:lastModifiedBy>fix-xlsx</cp:lastModifiedBy>` +
          `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
          `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
          `</cp:coreProperties>`,
      ),
    );
    ensureOverride(
      parts,
      CORE_PROPS,
      "application/vnd.openxmlformats-package.core-properties+xml",
    );
    ensurePackageRelationship(
      parts,
      `${PACKAGE_REL_NS}/metadata/core-properties`,
      CORE_PROPS,
    );
  }

  if (!parts.has(APP_PROPS)) {
    writeText(
      parts,
      APP_PROPS,
      xmlFile(
        `<Properties xmlns="${EXTENDED_PROPS_NS}">` +
          `<Application>fix-xlsx</Application>` +
          `</Properties>`,
      ),
    );
    ensureOverride(
      parts,
      APP_PROPS,
      "application/vnd.openxmlformats-officedocument.extended-properties+xml",
    );
    ensurePackageRelationship(parts, `${REL_NS}/extended-properties`, APP_PROPS);
  }
}

/**
 * Rule: the workbook opens into a window, recalculates, and keeps a
 * `_FilterDatabase` name for every sheet that filters something.
 *
 * Excel reads a filtered range through that hidden built-in name. An autoFilter
 * with no name behind it leaves the sheet half-filtered — the arrows are drawn
 * over a range Excel cannot resolve.
 */
function fixWorkbook(parts, report, filterRefs) {
  let text = readText(parts, WORKBOOK);
  if (!text) return;

  const original = text;

  if (!/<bookViews\b/.test(text)) {
    report("workbook", "added the missing bookViews");
    text = text.replace(
      /<sheets\b/,
      `<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20490" windowHeight="7620" activeTab="0"/></bookViews><sheets`,
    );
  }

  const kept = [];
  for (const [element] of text.matchAll(elementPattern("definedName"))) {
    if (attribute(element, "name") !== FILTER_DATABASE) kept.push(element);
  }

  const rebuilt = Array.from(
    filterRefs,
    ([localSheetId, ref]) =>
      `<definedName name="${FILTER_DATABASE}" localSheetId="${localSheetId}" hidden="1">` +
      escapeXml(ref) +
      `</definedName>`,
  );

  const names = [...rebuilt, ...kept];
  const block = names.length > 0 ? `<definedNames>${names.join("")}</definedNames>` : "";
  const existing = (text.match(elementPattern("definedNames")) ?? [""])[0];

  if (block !== existing) {
    report(
      "workbook",
      existing.includes(FILTER_DATABASE)
        ? "corrected the _FilterDatabase name behind the autoFilter"
        : "added the _FilterDatabase name the autoFilter needs",
    );
    text = text.replace(elementPattern("definedNames"), "").replace("</sheets>", `</sheets>${block}`);
  }

  if (!/<calcPr\b/.test(text)) {
    report("workbook", "added the missing calcPr");
    text = text.replace("</workbook>", `<calcPr calcId="${CALC_ID}"/></workbook>`);
  }

  if (text !== original) writeText(parts, WORKBOOK, text);
}

/**
 * Applies every rule. Returns the repaired parts and what was wrong; nothing is
 * mutated in place, so the caller can audit a file without rewriting it.
 */
export function repairWorkbook(
  source,
  { stripFilters = false, now = new Date() } = {},
) {
  const parts = new Map(Array.from(source, ([name, data]) => [name, data]));
  const issues = [];

  const sheets = readSheets(parts);
  const filterRefs = new Map();

  for (const part of worksheetParts(parts)) {
    const sheet = sheets.find((candidate) => candidate.part === part);
    const report = (code, message) =>
      issues.push({ part, code, message, sheet: sheet?.name ?? null });

    let text = readText(parts, part);
    text = fixSheetViews(text, report);
    text = fixEmptyCols(text, report);

    const filter = fixAutoFilter(text, report, stripFilters);
    text = filter.text;

    if (filter.filterRef && sheet) {
      const quoted = `'${sheet.name.replace(/'/g, "''")}'!${absoluteRef(filter.filterRef)}`;
      filterRefs.set(sheet.localSheetId, quoted);
    }

    writeText(parts, part, text);
  }

  fixInlineStrings(parts, (code, message) =>
    issues.push({ part: SHARED_STRINGS, code, message, sheet: null }),
  );
  fixThemeColours(parts, (code, message) =>
    issues.push({ part: STYLES, code, message, sheet: null }),
  );
  fixDocProps(
    parts,
    (code, message) => issues.push({ part: CORE_PROPS, code, message, sheet: null }),
    now,
  );
  fixWorkbook(
    parts,
    (code, message) => issues.push({ part: WORKBOOK, code, message, sheet: null }),
    filterRefs,
  );

  return { parts, issues };
}

/**
 * A rough check that the package is a spreadsheet at all, run before the rules
 * so a wrong file gets a clear answer instead of a list of missing parts.
 */
export function assertWorkbook(parts) {
  const missing = [CONTENT_TYPES, WORKBOOK].filter((name) => !parts.has(name));
  if (missing.length > 0) {
    throw new Error(`Not an .xlsx workbook: missing ${missing.join(", ")}.`);
  }
  if (!readText(parts, CONTENT_TYPES).includes(CONTENT_TYPES_NS)) {
    throw new Error("Not an .xlsx workbook: unrecognised content types.");
  }
}
