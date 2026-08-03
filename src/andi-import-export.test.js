/**
 * The Andi worksheet: the day's pictures have to show up as cards, a card renamed
 * on the spot has to reach the server under the new name, and a selection has to
 * leave either as one JPEG per picture or as a single ZIP — which is the whole
 * point of the tab, so it is the part worth holding still.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import AndiImportExportTab from "./AndiImportExportTab";

let container;
let root;
let calls;
let downloads;

const TAB_PROPS = {
  isActive: true,
  selectedDate: "2026-08-03",
  rangeFrom: "2026-07-20",
  rangeTo: "2026-08-03",
  refreshToken: 0,
  onCounts: () => {},
  onSynced: () => {},
};

const PHOTOS = [
  {
    id: 11,
    recordDate: "2026-08-03",
    fileName: "raktar-01.jpg",
    contentType: "image/jpeg",
    byteSize: 512 * 1024,
    createdAt: "2026-08-03T08:00:00.000Z",
  },
  {
    id: 12,
    recordDate: "2026-08-03",
    fileName: "raktar-02.jpg",
    contentType: "image/jpeg",
    byteSize: 480 * 1024,
    createdAt: "2026-08-03T08:01:00.000Z",
  },
];

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  // A download is an object URL handed to an anchor, and jsdom has neither the
  // URL helpers nor anywhere to navigate — so the anchor only records its name.
  downloads = [];
  URL.createObjectURL = jest.fn(() => "blob:andi");
  URL.revokeObjectURL = jest.fn();
  jest
    .spyOn(window.HTMLAnchorElement.prototype, "click")
    .mockImplementation(function record() {
      downloads.push(this.download);
    });

  global.fetch = jest.fn(async (url, options) => {
    const method = (options && options.method) || "GET";
    calls.push({ url, method, body: options && options.body });

    if (method === "PATCH") {
      // The server is what puts the extension back on, as the endpoint does.
      const sent = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ photo: { ...PHOTOS[0], fileName: `${sent.fileName}.jpg` } }),
      };
    }
    if (url.includes("/export")) {
      return {
        ok: true,
        headers: { get: () => null },
        blob: async () => new Blob(["zip"], { type: "application/zip" }),
      };
    }
    if (url.includes("/api/andi-photo?")) {
      return {
        ok: true,
        headers: { get: () => null },
        blob: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
      };
    }
    if (url.includes("from=")) {
      return { ok: true, json: async () => ({ counts: [] }) };
    }
    return { ok: true, json: async () => ({ photos: PHOTOS }) };
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

function findButton(label) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent.includes(label),
  );
}

/** React listens for the native setter, so a plain assignment is not seen. */
async function setValue(element, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;

  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function render() {
  await act(async () => {
    root.render(React.createElement(AndiImportExportTab, TAB_PROPS));
  });
}

async function selectAll() {
  await act(async () => container.querySelector(".select-all input").click());
}

test("the day's pictures arrive as cards, sized and numbered", async () => {
  await render();

  const cards = container.querySelectorAll(".andi-card");
  expect(cards).toHaveLength(2);
  expect(cards[0].querySelector("img").getAttribute("src")).toBe(
    "/api/andi-photo?id=11",
  );
  expect(cards[0].querySelector(".andi-name-input input").value).toBe("raktar-01");
  expect(container.textContent).toContain("2 PHOTO");
  expect(container.textContent).toContain("992 KB");
});

test("a card renamed on the spot is sent as a bare name, the extension left to the server", async () => {
  await render();

  const input = container.querySelector(".andi-card .andi-name-input input");
  await setValue(input, "atadas kep 1");
  expect(findButton("RENAME")).toBeTruthy();

  await act(async () => findButton("RENAME").click());

  const rename = calls.find((call) => call.method === "PATCH");
  expect(rename.url).toBe("/api/andi-photos?id=11");
  expect(JSON.parse(rename.body)).toEqual({ fileName: "atadas kep 1" });
  expect(container.textContent).toContain("atadas kep 1.jpg saved.");
});

test("a selection goes out as one JPEG per picture, or as a single ZIP", async () => {
  await render();
  await selectAll();
  expect(container.textContent).toContain("2 photos selected");
  expect(container.textContent).toContain("as separate JPEG files");

  await act(async () => findButton("DOWNLOAD").click());

  const jpegs = calls.filter((call) => call.url.includes("/api/andi-photo?"));
  expect(jpegs.map((call) => call.url)).toEqual([
    "/api/andi-photo?id=11&download=1",
    "/api/andi-photo?id=12&download=1",
  ]);
  expect(downloads).toEqual(["raktar-01.jpg", "raktar-02.jpg"]);
  expect(container.textContent).toContain("2 photos downloaded as JPEG.");

  await act(async () => findButton("ZIP").click());
  expect(container.textContent).toContain("in one ZIP file");

  await act(async () => findButton("DOWNLOAD").click());

  const archive = calls.find((call) => call.url.includes("/export"));
  expect(archive.method).toBe("POST");
  expect(JSON.parse(archive.body)).toEqual({ ids: [11, 12] });
  expect(downloads.at(-1)).toBe("Andi_2026-08-03.zip");
  expect(container.textContent).toContain("Andi_2026-08-03.zip downloaded (2 photos).");
});
