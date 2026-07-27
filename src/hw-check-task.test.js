/**
 * The task side of HW check requests: an imported spreadsheet has to become task
 * rows the operator can photograph, and a photographed row has to reach the
 * server as two slots. Both used to be typed in by hand, so both are new ground.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import * as XLSX from "xlsx";
import {
  downloadTemplate,
  expandByQty,
  groupByLocator,
  parseTaskFile,
  TEMPLATE_HEADERS,
} from "./excel";
import HwCheckRequestTab from "./HwCheckRequestTab";
import HwCheckTaskPhotos from "./HwCheckTaskPhotos";

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
  // Only photo upload can be picked; the other two announce themselves instead.
  const options = Array.from(select.options).filter((option) => option.value);
  expect(options.map((option) => [option.value, option.disabled])).toEqual([
    ["photo-upload", false],
    ["yellow-seal", true],
    ["sn-bom-mismatch", true],
  ]);

  expect(findButton("SEND TASK").disabled).toBe(true);

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    ).set;
    setter.call(select, "photo-upload");
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

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
