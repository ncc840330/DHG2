/**
 * The Andi gallery: what a picture ends up called, and the ZIP it is handed back
 * in.
 *
 * Run with `npm run test:andi`. Node tests rather than the jsdom ones in src/,
 * because the naming rules and the archive writer are Netlify function modules.
 * The archive is read back with the cleaner's own ZIP reader — the download is
 * only worth anything if something other than the writer can open it.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readZip } from "./lib/zip.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const loaded = new Map();

/** Bundled once per module: esbuild dominates the runtime otherwise. */
async function load(t, relativePath) {
  if (loaded.has(relativePath)) return loaded.get(relativePath);

  const esbuild = join(root, "node_modules", ".bin", "esbuild");
  if (!existsSync(esbuild)) {
    t.skip("esbuild is not installed, so the TypeScript modules cannot be loaded");
    return null;
  }

  const name = relativePath.split("/").pop().replace(/\.ts$/, ".mjs");
  const bundle = join(mkdtempSync(join(tmpdir(), "andi-")), name);
  execFileSync(esbuild, [
    join(root, relativePath),
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${bundle}`,
    "--external:@netlify/*",
  ]);

  const module = await import(bundle);
  loaded.set(relativePath, module);
  return module;
}

const loadNames = (t) => load(t, "netlify/shared/andi-photos.ts");
const loadZip = (t) => load(t, "netlify/shared/zip.ts");
const loadClient = (t) => load(t, "src/andi-photos.ts");

async function collect(stream) {
  const chunks = [];
  const reader = stream.getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

test("a typed name keeps its accents and gains the extension it is stored as", async (t) => {
  const names = await loadNames(t);
  if (!names) return;

  assert.equal(
    names.photoFileName("Raktár A-12 kép", "image/jpeg", "andi-2026-08-03"),
    "Raktár A-12 kép.jpg",
  );
  assert.equal(names.photoFileName("terv", "image/png", "andi"), "terv.png");
});

test("a name typed as nothing at all falls back to the day", async (t) => {
  const names = await loadNames(t);
  if (!names) return;

  for (const value of ["", "   ", "...", null, 42]) {
    assert.equal(
      names.photoFileName(value, "image/jpeg", "andi-2026-08-03"),
      "andi-2026-08-03.jpg",
      `${JSON.stringify(value)} should fall back`,
    );
  }
});

test("what Windows refuses cannot reach a file name", async (t) => {
  const names = await loadNames(t);
  if (!names) return;

  assert.equal(
    names.photoFileName('a/b\\c:d*e?f"g<h>i|j', "image/jpeg", "andi"),
    "a-b-c-d-e-f-g-h-i-j.jpg",
  );
  // A pasted file name should not end up doubled.
  assert.equal(names.photoFileName("kep.jpg", "image/jpeg", "andi"), "kep.jpg");
  assert.equal(names.photoFileName("kep.JPG", "image/jpeg", "andi"), "kep.jpg");
  // An extension that is not the stored one is part of the name, not a suffix.
  assert.equal(names.photoFileName("kep.png", "image/jpeg", "andi"), "kep.png.jpg");
});

test("a name is capped, so the download folder gets a file name and not an essay", async (t) => {
  const names = await loadNames(t);
  if (!names) return;

  const long = names.photoFileName("x".repeat(500), "image/jpeg", "andi");
  assert.equal(long.length, names.MAX_PHOTO_NAME_LENGTH + ".jpg".length);
});

test("two pictures named the same both survive the archive", async (t) => {
  const names = await loadNames(t);
  if (!names) return;

  assert.deepEqual(
    names.uniqueEntryNames(["kep.jpg", "kep.jpg", "KEP.jpg", "más.jpg"]),
    ["kep.jpg", "kep (2).jpg", "KEP (3).jpg", "más.jpg"],
  );
});

test("the streamed archive reads back entry for entry", async (t) => {
  const zip = await loadZip(t);
  if (!zip) return;

  const first = Buffer.from("first picture bytes");
  const second = Buffer.from("második kép");

  const archive = await collect(
    zip.streamZip(
      [
        { name: "kep-01.jpg", read: async () => new Uint8Array(first) },
        { name: "kép-02.jpg", read: async () => new Uint8Array(second) },
      ],
      new Date(Date.UTC(2026, 7, 3, 10, 30, 0)),
    ),
  );

  const parts = readZip(archive);
  assert.deepEqual([...parts.keys()], ["kep-01.jpg", "kép-02.jpg"]);
  assert.equal(Buffer.from(parts.get("kep-01.jpg")).toString(), first.toString());
  assert.equal(Buffer.from(parts.get("kép-02.jpg")).toString(), second.toString());
});

test("a picture that has gone missing from the store is left out, not left empty", async (t) => {
  const zip = await loadZip(t);
  if (!zip) return;

  const archive = await collect(
    zip.streamZip([
      { name: "gone.jpg", read: async () => null },
      { name: "here.jpg", read: async () => new Uint8Array(Buffer.from("bytes")) },
    ]),
  );

  const parts = readZip(archive);
  assert.deepEqual([...parts.keys()], ["here.jpg"]);
});

test("the buffered writer still writes what it always did", async (t) => {
  const zip = await loadZip(t);
  if (!zip) return;

  const modified = new Date(Date.UTC(2026, 7, 3, 10, 30, 0));
  const data = new Uint8Array(Buffer.from("same bytes either way"));

  const buffered = zip.createZip([{ name: "one.txt", data }], modified);
  const streamed = await collect(
    zip.streamZip([{ name: "one.txt", read: async () => data }], modified),
  );

  assert.deepEqual(Buffer.from(buffered), streamed);
});

test("a batch is numbered with enough digits to sort", async (t) => {
  const client = await loadClient(t);
  if (!client) return;

  assert.equal(client.numberedName("raktar", 0, 9), "raktar-01");
  assert.equal(client.numberedName("raktar", 9, 120), "raktar-010");
  // An empty prefix still has to produce a name.
  assert.equal(client.numberedName("  ", 0, 3), "andi-01");
});

test("typing is left alone, sending is tidied up", async (t) => {
  const client = await loadClient(t);
  if (!client) return;

  // A trailing space mid-word must survive, or a name with spaces cannot be typed.
  assert.equal(client.cleanNameInput("raktar A "), "raktar A ");
  assert.equal(client.cleanNameInput("a/b"), "a-b");
  assert.equal(client.finalName("  raktar   A  ", "andi"), "raktar A");
  assert.equal(client.finalName("   ", "andi-2026-08-03"), "andi-2026-08-03");
});

test("names given twice are flagged before anything is downloaded", async (t) => {
  const client = await loadClient(t);
  if (!client) return;

  const twice = client.duplicateNames(["kep", "KEP ", "más", ""]);
  assert.deepEqual([...twice], ["kep"]);
});
