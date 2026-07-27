/**
 * Scanner input paths. A PDA hands a barcode over in one of three ways and each
 * one used to break somewhere else, so all three are covered here.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import DhgTab from "./DhgTab";

function jsonResponse(body) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

let container;
let root;
let posted;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  posted = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn((url, options) => {
    if (options && options.method) {
      posted.push({ url, method: options.method });
      return jsonResponse({ record: { id: 1, lineId: "20260727-001" } });
    }
    return jsonResponse({ counts: [], records: [], nextLineId: "20260727-001" });
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderTab() {
  await act(async () => {
    root.render(
      React.createElement(DhgTab, {
        isActive: true,
        selectedDate: "2026-07-27",
        rangeFrom: "2026-07-13",
        rangeTo: "2026-07-27",
        refreshToken: 0,
        onCounts: () => {},
        onSynced: () => {},
      }),
    );
  });
}

const field = (name) => container.querySelector(`input[name="${name}"]`);

/** How a keyboard-wedge scanner or a person typing reaches the field. */
function typeInto(input, text) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** How a driver/IME that writes the value itself reaches the field. */
function injectInto(input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressCommitKey(target, key, keyCode) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, keyCode, bubbles: true, cancelable: true }),
  );
}

/** A barcode burst arriving at whatever currently has focus. */
function scanAt(target, text) {
  text.split("").forEach((char) => pressCommitKey(target, char, 65));
  pressCommitKey(target, "Enter", 13);
}

const problemSelect = () =>
  container.querySelector('select[name="problemDescription"]');

function selectOption(select, value) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  ).set;
  setter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("typed value survives a re-render", async () => {
  await renderTab();
  await act(async () => typeInto(field("systemItem"), "ITEM-1"));
  await act(async () => typeInto(field("locator"), "GYOR"));
  expect(field("systemItem").value).toBe("ITEM-1");
});

test("driver-injected value survives a re-render", async () => {
  await renderTab();
  await act(async () => injectInto(field("rfid"), "RFID-999"));
  await act(async () => typeInto(field("locator"), "GYOR"));
  expect(field("rfid").value).toBe("RFID-999");
});

test("unnamed Enter advances instead of submitting", async () => {
  await renderTab();
  const input = field("systemItem");
  input.focus();
  await act(async () => {
    injectInto(input, "ITEM-2");
    pressCommitKey(input, "Unidentified", 13);
  });
  expect(field("systemItem").value).toBe("ITEM-2");
  expect(document.activeElement.name).toBe("systemSn");
  expect(posted).toHaveLength(0);
});

test("named Enter advances too", async () => {
  await renderTab();
  const input = field("physicalSn");
  input.focus();
  await act(async () => pressCommitKey(input, "Enter", 13));
  expect(document.activeElement.name).toBe("rfid");
});

test("scan with nothing focused lands in the first empty field", async () => {
  await renderTab();
  document.body.focus();
  await act(async () => scanAt(document.body, "ABC12345"));
  expect(field("sourceTaskId").value).toBe("ABC12345");
  expect(document.activeElement.name).toBe("systemItem");
});

test("a later scan in the same shift still lands", async () => {
  await renderTab();
  document.body.focus();
  await act(async () => scanAt(document.body, "ABC12345"));

  // The pause between two barcodes must not be mistaken for slow typing.
  await wait(700);
  document.activeElement.blur();
  await act(async () => scanAt(document.body, "XYZ98765"));
  expect(field("systemItem").value).toBe("XYZ98765");
});

test("slow typing with nothing focused is ignored", async () => {
  await renderTab();
  document.body.focus();
  for (const char of "TYPED") {
    await act(async () => pressCommitKey(document.body, char, 65));
    await wait(90);
  }
  await act(async () => pressCommitKey(document.body, "Enter", 13));
  expect(field("sourceTaskId").value).toBe("");
});

async function fillTextFields() {
  await act(async () => {
    typeInto(field("sourceTaskId"), "H");
    typeInto(field("systemItem"), "A");
    typeInto(field("systemSn"), "B");
    typeInto(field("physicalItem"), "C");
    typeInto(field("physicalSn"), "D");
    typeInto(field("rfid"), "E");
    typeInto(field("locator"), "F");
  });
}

/**
 * A burst landing on the dropdown, with the browser's type-ahead treating the
 * barcode as a search string and switching the selection part-way through.
 */
async function scanAtDropdown(select, text, typeAheadValue) {
  select.focus();
  await act(async () => {
    text.split("").forEach((char, index) => {
      pressCommitKey(select, char, 65);
      if (index === 1) selectOption(select, typeAheadValue);
    });
    pressCommitKey(select, "Enter", 13);
  });
}

test("a scan on the problem dropdown keeps the choice and fills the next field", async () => {
  await renderTab();
  await act(async () => {
    typeInto(field("sourceTaskId"), "T");
    typeInto(field("systemItem"), "A");
    typeInto(field("systemSn"), "B");
    typeInto(field("physicalItem"), "C");
    typeInto(field("physicalSn"), "D");
    typeInto(field("rfid"), "E");
  });
  await act(async () => selectOption(problemSelect(), "Corrosion"));

  await scanAtDropdown(problemSelect(), "LOC-42", "Empty box");

  expect(problemSelect().value).toBe("Corrosion");
  expect(field("locator").value).toBe("LOC-42");
});

test("a scan on the dropdown of a full form changes nothing", async () => {
  await renderTab();
  await fillTextFields();
  await act(async () => selectOption(problemSelect(), "Corrosion"));

  await scanAtDropdown(problemSelect(), "STRAY-7", "Burned item");

  expect(problemSelect().value).toBe("Corrosion");
  expect(field("locator").value).toBe("F");
  expect(field("sourceTaskId").value).toBe("H");
});

test("save button still submits", async () => {
  await renderTab();
  await fillTextFields();
  await act(async () => selectOption(problemSelect(), "Corrosion"));
  await act(async () => {
    container.querySelector(".save-button").click();
  });
  expect(posted.map((item) => item.method)).toEqual(["POST"]);
});
