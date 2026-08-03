/**
 * The task side of HW check requests: an imported spreadsheet — or a hand-typed
 * row — has to become task rows the operator can work, a photographed row has to
 * reach the server as two slots, and a checked seal as a pass or a fail.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import * as XLSX from "xlsx";
import {
  downloadTemplate,
  expandByQty,
  groupByLocator,
  parseSealGrid,
  parseTaskFile,
  TEMPLATE_HEADERS,
} from "./excel";
import HwCheckRequestTab from "./HwCheckRequestTab";
import HwCheckTaskPhotos from "./HwCheckTaskPhotos";
import HwCheckTaskSeals from "./HwCheckTaskSeals";

let container;
let root;
let calls;

/** parseTaskFile only reads a name and the bytes, so a stub file is enough. */
function workbookFile(grid, name = "task.xlsx") {
  const sheet = XLSX.utils.aoa_to_sheet(grid);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return { name, arrayBuffer: async () => buffer };
}

const TAB_PROPS = {
  isActive: true,
  selectedDate: "2026-07-27",
  rangeFrom: "2026-07-13",
  rangeTo: "2026-07-27",
  refreshToken: 0,
  onCounts: () => {},
  onSynced: () => {},
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url, method: (options && options.method) || "GET", body: options && options.body });

    if (options && options.method === "POST" && url.includes("hw-check-task-photos")) {
      return { ok: true, json: async () => ({ line: null, task: null }) };
    }
    if (options && options.method === "POST") {
      return {
        ok: true,
        json: async () => ({
          task: { id: 7, taskCode: "Photo.20260727.01", lineCount: 2 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        counts: [],
        tasks: [],
        nextTaskCodes: { "photo-upload": "Photo.20260727.01" },
      }),
    };
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function pick(selector) {
  return container.querySelector(selector);
}

function findButton(label) {
  return Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent.includes(label),
  );
}

async function attachFile(input, file) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** React listens for the native setter, so a plain assignment is not seen. */
async function setValue(element, value) {
  const prototype =
    element.tagName === "SELECT"
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;

  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", {
      bubbles: true,
    }));
  });
}

/** The warehouse's own sheet: a two-storey header with OK and NO underneath. */
const SEAL_GRID = [
  [
    "No.",
    "From Subinv",
    "Locator",
    "Item",
    "Bar Code",
    "Whether The Original Seal Is Intact？",
    "",
    "Checked BY",
    "Confirmed BY",
    "Signature",
    "Remark",
  ],
  ["", "", "", "", "", "OK", "NO ", "", "", "", ""],
  [
    "1",
    "FGI",
    "A-1",
    "ITEM-1",
    "4210000123456789",
    "",
    "",
    "tundebalogh",
    "brigitabarak",
    "",
    "",
  ],
  ["2", "FGI", "A-1", "ITEM-2", "4210000123456790", "", "X", "", "", "", "Sérült"],
  ["3", "", "", "", "", "", "", "", "", "", ""],
];

test("a template-shaped file becomes task rows with the warehouse filled in", async () => {
  const result = await parseTaskFile(
    workbookFile([
      TEMPLATE_HEADERS,
      ["ITEM-1", "SN-1", "2", "", "SUB-1", "LOC-A"],
      ["ITEM-2", "SN-2", "", "FXN-OTHER", "", "LOC-B"],
    ]),
  );

  expect(result.rows).toEqual([
    {
      item: "ITEM-1",
      sn: "SN-1",
      qty: "2",
      warehouseCode: "FXN-GYOR",
      subinvCode: "SUB-1",
      locator: "LOC-A",
    },
    {
      item: "ITEM-2",
      sn: "SN-2",
      qty: "1",
      warehouseCode: "FXN-OTHER",
      subinvCode: "",
      locator: "LOC-B",
    },
  ]);
});

test("columns are read by header name, wherever the export put them", async () => {
  const result = await parseTaskFile(
    workbookFile([
      ["Photo upload list"],
      ["Locator", "Serial number", "Item code", "Subinv Code"],
      ["LOC-9", "SN-9", "ITEM-9", "SUB-9"],
    ]),
  );

  expect(result.rows).toEqual([
    {
      item: "ITEM-9",
      sn: "SN-9",
      qty: "1",
      warehouseCode: "FXN-GYOR",
      subinvCode: "SUB-9",
      locator: "LOC-9",
    },
  ]);
});

test("a row without an SN is still photographable, named by its item", async () => {
  const result = await parseTaskFile(
    workbookFile([
      TEMPLATE_HEADERS,
      ["ITEM-1", "SN-1", "1", "", "", "LOC-A"],
      ["ITEM-2", "", "1", "", "", "LOC-B"],
    ]),
  );

  expect(result.error).toBeUndefined();
  expect(result.rows.map((row) => [row.item, row.sn])).toEqual([
    ["ITEM-1", "SN-1"],
    ["ITEM-2", ""],
  ]);
});

test("a row nothing identifies is named by its spreadsheet row number", async () => {
  const result = await parseTaskFile(
    workbookFile([
      TEMPLATE_HEADERS,
      ["ITEM-1", "SN-1", "1", "", "", "LOC-A"],
      ["", "", "1", "", "", "LOC-B"],
    ]),
  );

  expect(result.rows).toBeUndefined();
  expect(result.error).toContain("3");
});

test("a qty of more than one becomes a photo line per piece", async () => {
  const result = await parseTaskFile(
    workbookFile([
      TEMPLATE_HEADERS,
      ["ITEM-1", "SN-1", "3", "", "", "LOC-A"],
      ["ITEM-2", "SN-2", "1", "", "", "LOC-B"],
    ]),
  );

  // The rows stay as the file listed them; the server splits them the same way.
  expect(result.rows).toHaveLength(2);
  expect(
    result.lines.map((line) => [line.sn, line.qty, line.unitIndex, line.unitCount]),
  ).toEqual([
    ["SN-1", "1", 1, 3],
    ["SN-1", "1", 2, 3],
    ["SN-1", "1", 3, 3],
    ["SN-2", "1", 1, 1],
  ]);
});

test("an unreadable qty is one piece, not none", () => {
  const row = {
    item: "ITEM-1",
    sn: "SN-1",
    qty: "",
    warehouseCode: "FXN-GYOR",
    subinvCode: "",
    locator: "LOC-A",
  };

  expect(expandByQty([{ ...row, qty: "" }])).toHaveLength(1);
  expect(expandByQty([{ ...row, qty: "alma" }])).toHaveLength(1);
  expect(expandByQty([{ ...row, qty: "0" }])).toHaveLength(1);
  expect(expandByQty([{ ...row, qty: "2 pcs" }])).toHaveLength(2);
});

test("the template hands out text cells, so a long SN survives typing", () => {
  const written = [];
  const write = jest
    .spyOn(XLSX, "writeFile")
    .mockImplementation((workbook) => written.push(workbook));

  downloadTemplate();

  const sheet = written[0].Sheets["Photo upload"];
  // Header, the prefilled row and a blank one well down the grid: all Text.
  ["A1", "B2", "B300"].forEach((address) => {
    expect(sheet[address].z).toBe("@");
    expect(sheet[address].t).toBe("s");
  });
  expect(sheet["!ref"]).toBe("A1:F501");
  write.mockRestore();
});

test("a file without the expected columns points at the template", async () => {
  const result = await parseTaskFile(workbookFile([["Alma", "Korte"], ["1", "2"]]));

  expect(result.error).toContain("TEMPLATE");
});

test("rows are grouped by locator, in the order the file listed them", () => {
  const groups = groupByLocator([
    { locator: "LOC-A", id: 1 },
    { locator: "LOC-B", id: 2 },
    { locator: "LOC-A", id: 3 },
  ]);

  expect(groups.map((group) => group.locator)).toEqual(["LOC-A", "LOC-B"]);
  expect(groups[0].items).toHaveLength(2);
});

test("SEND TASK waits for a task type and a file, then posts the rows", async () => {
  await act(async () => {
    root.render(React.createElement(HwCheckRequestTab, TAB_PROPS));
  });

  // The upload sheet has no input fields any more, only the CREATE TASK button.
  await act(async () => findButton("UPLOAD TASK").click());
  expect(container.querySelectorAll("form")).toHaveLength(0);
  expect(pick("select")).toBeNull();

  await act(async () => findButton("CREATE TASK").click());
  const select = pick('select[name="taskType"]');
  expect(select).not.toBeNull();
  // Photo upload and the yellow seal check can both be picked; SN-Bom announces
  // itself instead.
  const options = Array.from(select.options).filter((option) => option.value);
  expect(options.map((option) => [option.value, option.disabled])).toEqual([
    ["photo-upload", false],
    ["yellow-seal", false],
    ["sn-bom-mismatch", true],
  ]);

  expect(findButton("SEND TASK").disabled).toBe(true);

  await setValue(select, "photo-upload");

  // A type on its own is not a task: the file still has to come in.
  expect(findButton("SEND TASK").disabled).toBe(true);

  await attachFile(
    pick(".import-button input"),
    workbookFile([TEMPLATE_HEADERS, ["ITEM-1", "SN-1", "1", "", "SUB-1", "LOC-A"]]),
  );

  const sendTask = findButton("SEND TASK");
  expect(sendTask.disabled).toBe(false);
  await act(async () => sendTask.click());

  const posted = calls.find((call) => call.method === "POST");
  expect(posted.url).toBe("/api/hw-check-tasks");
  const payload = JSON.parse(posted.body);
  expect(payload.taskType).toBe("photo-upload");
  expect(payload.recordDate).toBe("2026-07-27");
  expect(payload.fileName).toBe("task.xlsx");
  expect(payload.rows).toHaveLength(1);
  expect(payload.rows[0].warehouseCode).toBe("FXN-GYOR");
  expect(pick(".success-message").textContent).toContain("Photo.20260727.01");
});

test("a photographed row is saved slot by slot and reads as ready", async () => {
  const line = {
    id: 31,
    rowIndex: 1,
    item: "ITEM-1",
    sn: "SN-1",
    qty: "1",
    unitIndex: 2,
    unitCount: 3,
    warehouseCode: "FXN-GYOR",
    subinvCode: "SUB-1",
    locator: "LOC-A",
    images: [],
  };
  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url, method: (options && options.method) || "GET", body: options && options.body });
    if (options && options.method === "POST") {
      return { ok: true, json: async () => ({ line, task: null }) };
    }
    return {
      ok: true,
      json: async () => ({
        task: {
          id: 7,
          taskCode: "Photo.20260727.01",
          taskType: "photo-upload",
          sourceFileName: "task.xlsx",
          lineCount: 1,
          completedLines: calls.some((call) => call.method === "POST") ? 1 : 0,
          photoCount: 0,
          isComplete: false,
          lines: [line],
        },
      }),
    };
  });

  await act(async () => {
    root.render(
      React.createElement(HwCheckTaskPhotos, {
        taskId: 7,
        onClose: () => {},
        onChanged: () => {},
      }),
    );
  });

  expect(pick(".locator-name").textContent).toBe("LOC-A");
  // The line is the second piece of a qty of three, and says so.
  expect(pick(".line-cells").textContent).toContain("PIECE2/3");
  expect(pick(".line-status").textContent).toContain("0/2");
  expect(findButton("SAVE PHOTOS").disabled).toBe(true);

  const photoInputs = container.querySelectorAll(".line-photos input[type=file]");
  expect(photoInputs).toHaveLength(2);
  for (const input of photoInputs) {
    await attachFile(
      input,
      new File(["photo"], `${input === photoInputs[0] ? "front" : "back"}.jpg`, {
        type: "image/jpeg",
      }),
    );
  }

  // Both photos are in, so the row already reads as done before it is saved.
  expect(pick(".line-status").textContent).toContain("READY");
  expect(pick(".task-line").className).toContain("is-ready");

  await act(async () => findButton("SAVE PHOTOS").click());

  const saved = calls.find((call) => call.method === "POST");
  expect(saved.url).toBe("/api/hw-check-task-photos?lineId=31");
  expect(saved.body.get("image1Action")).toBe("replace");
  expect(saved.body.get("image2Action")).toBe("replace");
  expect(saved.body.get("image1").name).toBe("front.jpg");
  // One request per row, not one per photo.
  expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  expect(pick(".success-message").textContent).toContain("1 sor mentve");
});

test("the seal sheet's two-storey header is read, and its signers copied", () => {
  const result = parseSealGrid(SEAL_GRID);

  expect(result.rows.map((row) => [row.item, row.barcode, row.sealResult])).toEqual([
    ["ITEM-1", "4210000123456789", ""],
    ["ITEM-2", "4210000123456790", "fail"],
  ]);
  // H3, I3 and J3 speak for the whole task, so they are read once from the top.
  expect(result.header).toEqual({
    checkedBy: "tundebalogh",
    confirmedBy: "brigitabarak",
    signature: "",
  });
  // A numbered but otherwise empty template row is not a box to check.
  expect(result.skippedRows).toBe(1);
});

test("a mark in OK is a pass, and both marked at once is refused", () => {
  const passed = parseSealGrid([
    ...SEAL_GRID.slice(0, 2),
    ["1", "FGI", "A-1", "ITEM-1", "421000012345", "X", "", "", "", "", ""],
  ]);
  expect(passed.rows[0].sealResult).toBe("pass");

  const both = parseSealGrid([
    ...SEAL_GRID.slice(0, 2),
    ["1", "FGI", "A-1", "ITEM-1", "421000012345", "X", "X", "", "", "", ""],
  ]);
  expect(both.rows).toBeUndefined();
  expect(both.error).toContain("3");
});

test("a seal row without an SN is named by its spreadsheet row number", () => {
  const result = parseSealGrid([
    ...SEAL_GRID.slice(0, 3),
    ["2", "FGI", "A-1", "ITEM-2", "", "", "", "", "", "", ""],
  ]);

  expect(result.rows).toBeUndefined();
  expect(result.error).toContain("4");
  expect(result.error).toContain("SN");
});

test("Bar Code and SN are one column, whichever way the file spells it", () => {
  // The warehouse's template heads the serial number column Bar Code; a sheet
  // that heads it SN says the same thing and is read into the same field.
  const asSn = parseSealGrid([
    ["No.", "From Subinv", "Locator", "Item", "Serial Number", "Remark"],
    ["1", "FGI", "A-1", "ITEM-1", "4210000123456789", ""],
  ]);

  expect(asSn.rows).toEqual([
    {
      subinvCode: "FGI",
      locator: "A-1",
      item: "ITEM-1",
      barcode: "4210000123456789",
      sealResult: "",
      remark: "",
    },
  ]);
});

test("a one-row seal task can be typed in instead of imported", async () => {
  await act(async () => {
    root.render(React.createElement(HwCheckRequestTab, TAB_PROPS));
  });

  await act(async () => findButton("UPLOAD TASK").click());
  await act(async () => findButton("CREATE TASK").click());
  await setValue(pick('select[name="taskType"]'), "yellow-seal");

  // The manual fields sit above the TEMPLATE and IMPORT buttons.
  const panel = pick(".create-task-form");
  const manual = pick(".manual-rows");
  const importRow = pick(".import-row");
  const order = Array.from(panel.children);
  expect(order.indexOf(manual)).toBeLessThan(order.indexOf(importRow));

  // Nothing has been typed yet, so there is nothing to send.
  expect(findButton("SEND TASK").disabled).toBe(true);

  // The signers are the printed sheet's business, so the panel does not ask.
  expect(pick('input[name="checkedBy"]')).toBe(null);
  expect(pick('input[name="confirmedBy"]')).toBe(null);
  expect(pick('input[name="signature"]')).toBe(null);

  await setValue(manual.querySelector('input[name="subinvCode"]'), "FGI");
  await setValue(manual.querySelector('input[name="locator"]'), "A-12-3-4");
  await setValue(manual.querySelector('input[name="item"]'), "ITEM-1");

  // A row is not added while a required cell is empty, and it says which.
  await act(async () => findButton("ADD ROW").click());
  expect(pick(".error-message").textContent).toContain("SN");
  expect(findButton("SEND TASK").disabled).toBe(true);

  // One field, named SN, stored in the sheet's Bar Code column.
  const snInput = manual.querySelector('input[name="barcode"]');
  expect(snInput.closest("label").querySelector("span").textContent).toBe("SN *");
  expect(manual.querySelector('input[name="sn"]')).toBe(null);
  await setValue(snInput, "4210000123456789");
  await act(async () => findButton("ADD ROW").click());

  const sendTask = findButton("SEND TASK");
  expect(sendTask.disabled).toBe(false);
  await act(async () => sendTask.click());

  const posted = calls.find((call) => call.method === "POST");
  const payload = JSON.parse(posted.body);
  expect(payload.taskType).toBe("yellow-seal");
  // A hand-typed task has no signers: the paper is signed after printing.
  expect(payload.checkedBy).toBe("");
  expect(payload.confirmedBy).toBe("");
  expect(payload.rows).toEqual([
    {
      subinvCode: "FGI",
      locator: "A-12-3-4",
      item: "ITEM-1",
      barcode: "4210000123456789",
    },
  ]);
});

test("a seal row is answered from a dropdown, and only a finished task prints", async () => {
  const line = {
    id: 41,
    rowIndex: 1,
    item: "ITEM-1",
    sn: "",
    qty: "1",
    unitIndex: 1,
    unitCount: 1,
    warehouseCode: "FXN-GYOR",
    subinvCode: "FGI",
    locator: "A-12-3-4",
    barcode: "4210000123456789",
    sealResult: "",
    remark: "",
    images: [],
  };
  const task = (answered) => ({
    id: 9,
    recordDate: "2026-07-27",
    taskCode: "Yellow_seal_20260727-001",
    taskType: "yellow-seal",
    sourceFileName: "seal.xlsx",
    checkedBy: "tundebalogh",
    confirmedBy: "brigitabarak",
    signature: "",
    lineCount: 1,
    completedLines: answered ? 1 : 0,
    photoCount: 0,
    passCount: 0,
    failCount: answered ? 1 : 0,
    isComplete: answered,
    lines: [
      answered ? { ...line, sealResult: "fail", remark: "Sérült a pecsét" } : line,
    ],
  });

  global.fetch = jest.fn(async (url, options) => {
    calls.push({ url, method: (options && options.method) || "GET", body: options && options.body });
    if (options && options.method === "POST") {
      return { ok: true, json: async () => ({ task: task(true) }) };
    }
    return { ok: true, json: async () => ({ task: task(false) }) };
  });

  await act(async () => {
    root.render(
      React.createElement(HwCheckTaskSeals, {
        taskId: 9,
        onClose: () => {},
        onChanged: () => {},
      }),
    );
  });

  expect(pick(".locator-name").textContent).toBe("A-12-3-4");
  expect(pick(".seal-signers").textContent).toContain("tundebalogh");
  // The serial number is shown once, under the name the sheet's Bar Code column
  // now goes by. There is no second SN cell to disagree with it.
  const cells = Array.from(container.querySelectorAll(".line-cells > div")).map(
    (cell) => cell.textContent,
  );
  expect(cells).toEqual(["FROM SUBINVFGI", "ITEMITEM-1", "SN4210000123456789"]);
  expect(pick(".line-status").textContent).toContain("NOT CHECKED");
  // Nothing to print while a box is unanswered, and nothing to save either.
  expect(findButton("DOWNLOAD PDF").disabled).toBe(true);
  expect(findButton("SAVE CHECKS").disabled).toBe(true);

  const dropdown = pick('select[name="sealResult-41"]');
  expect(Array.from(dropdown.options).map((option) => option.value)).toEqual([
    "",
    "pass",
    "fail",
  ]);

  await setValue(dropdown, "fail");
  await setValue(pick('input[name="remark-41"]'), "Sérült a pecsét");

  expect(pick(".task-line").className).toContain("is-failed");
  expect(findButton("SAVE CHECKS").disabled).toBe(false);
  // The answer is not on the server yet, so the PDF still waits.
  expect(findButton("DOWNLOAD PDF").disabled).toBe(true);

  await act(async () => findButton("SAVE CHECKS").click());

  const saved = calls.find((call) => call.method === "POST");
  expect(saved.url).toBe("/api/hw-check-task-seals");
  expect(JSON.parse(saved.body)).toEqual({
    taskId: 9,
    lines: [{ id: 41, sealResult: "fail", remark: "Sérült a pecsét" }],
  });
  expect(pick(".success-message").textContent).toContain("1 sor mentve");
  expect(findButton("DOWNLOAD PDF").disabled).toBe(false);
});
