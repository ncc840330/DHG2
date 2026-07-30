#!/usr/bin/env node

/**
 * Cleans a downloaded .xlsx so Excel 2016 will copy out of it.
 *
 * Exports downloaded before `netlify/shared/xlsx.ts` was fixed carry three
 * problems: text in inline-string cells, which 2016 pastes into another
 * workbook as blanks; sheet views with a frozen pane and no selection, which
 * leaves the sheet with no copy source; and autoFilters with no matching
 * `_FilterDatabase` name behind them. This applies the same rules the export
 * now writes by, so an old download does not have to be pulled again.
 *
 *   node scripts/fix-xlsx.mjs DHG_2026-02-06.xlsx
 *   node scripts/fix-xlsx.mjs --check downloads/*.xlsx
 *   node scripts/fix-xlsx.mjs --in-place --strip-filters DHG_2026-02-06.xlsx
 *
 * Writes `<name>.cleaned.xlsx` next to the original unless `--in-place` is
 * given. `--check` reports what is wrong and writes nothing; it exits non-zero
 * when a file needs cleaning, so it can gate a script.
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { readZip, writeZip } from "./lib/zip.mjs";
import { assertWorkbook, repairWorkbook } from "./lib/xlsx-repair.mjs";

const USAGE = `Usage: node scripts/fix-xlsx.mjs [options] <file.xlsx>...

  --check           report what is wrong and write nothing
  --in-place        overwrite the original instead of writing <name>.cleaned.xlsx
  --strip-filters   drop the autoFilters instead of repairing them
  --quiet           only report files that needed work
  -h, --help        show this message`;

function parseArgs(argv) {
  const options = {
    check: false,
    inPlace: false,
    stripFilters: false,
    quiet: false,
    files: [],
  };

  for (const argument of argv) {
    if (argument === "--check") options.check = true;
    else if (argument === "--in-place") options.inPlace = true;
    else if (argument === "--strip-filters") options.stripFilters = true;
    else if (argument === "--quiet") options.quiet = true;
    else if (argument === "-h" || argument === "--help") options.help = true;
    else if (argument.startsWith("-")) throw new Error(`Unknown option: ${argument}`);
    else options.files.push(argument);
  }

  return options;
}

function cleanedPath(path) {
  const extension = extname(path);
  return join(dirname(path), `${basename(path, extension)}.cleaned${extension || ".xlsx"}`);
}

/** One line per problem, grouped so a 40-sheet workbook does not scroll away. */
function reportIssues(issues) {
  const counts = new Map();
  for (const issue of issues) {
    const label = issue.sheet ? `${issue.message} (${issue.sheet})` : issue.message;
    const key = `${issue.code}: ${label}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const [line, count] of counts) {
    console.log(`    - ${line}${count > 1 ? ` [×${count}]` : ""}`);
  }
}

async function run(path, options) {
  const parts = readZip(await readFile(path));
  assertWorkbook(parts);

  const { parts: repaired, issues } = repairWorkbook(parts, {
    stripFilters: options.stripFilters,
  });

  if (issues.length === 0) {
    if (!options.quiet) console.log(`  ${path}: already Excel 2016 compatible`);
    return { changed: false };
  }

  console.log(`  ${path}: ${issues.length} problem${issues.length === 1 ? "" : "s"}`);
  reportIssues(issues);

  if (options.check) return { changed: true };

  const target = options.inPlace ? path : cleanedPath(path);
  await writeFile(target, writeZip(repaired));
  const { size } = await stat(target);
  console.log(`    → ${target} (${Math.round(size / 1024)} kB)`);

  return { changed: true };
}

const options = parseArgs(process.argv.slice(2));

if (options.help || options.files.length === 0) {
  console.log(USAGE);
  process.exit(options.help ? 0 : 1);
}

let needed = 0;
let failed = 0;

for (const path of options.files) {
  try {
    const { changed } = await run(path, options);
    if (changed) needed += 1;
  } catch (error) {
    failed += 1;
    console.error(`  ${path}: ${error.message}`);
  }
}

if (failed > 0) process.exit(2);
// --check is a gate, so a file that still needs cleaning is a failure there and
// a plain result of the run everywhere else.
if (options.check && needed > 0) process.exit(1);
