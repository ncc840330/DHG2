/**
 * Saving and synchronising, from the operator's side of the glass: after SAVE
 * the form has to be empty, and after SYNC the app has to have actually gone
 * and asked the server — both of which used to be true only sometimes.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import App from "./App";
import DhgTab from "./DhgTab";

const TEXT_FIELDS = [
  "systemItem",
  "systemSn",
  "physicalItem",
  "physicalSn",
  "rfid",
  "locator",
  "county",
  "sourceTaskId",
];

let container;
let root;
let calls;
let hold;

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  hold = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn(async (url, options) => {
    calls.push({
      url,
      method: (options && options.method) || "GET",
      cache: options && options.cache,
      body: options && options.body,
    });
    if (hold) await hold.promise;
    if (options && options.method) {
      return {
        ok: true,
        json: async () => ({ record: { id: 1, lineId: "20260727-001" } }),
      };
    }
    return {
      ok: true,
      json: async () => ({ counts: [], records: [], nextLineId: "20260727-001" }),
    };
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

function typeInto(input, text) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  ).set;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * The third way a PDA delivers a barcode: the driver assigns the value and
 * fires nothing at all, so React state never hears about it.
 */
function driverWrite(input, text) {
  input.value = text;
}

function selectProblem(value) {
  const select = container.querySelector('select[name="problemDescription"]');
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  ).set;
  setter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function fillForm(skip) {
  await act(async () => {
    TEXT_FIELDS.filter((name) => name !== skip).forEach((name) => {
      typeInto(field(name), `${name}-1`);
    });
  });
  await act(async () => selectProblem("Corrosion"));
}

test("SAVE empties every field, the one React state never saw included", async () => {
  await renderTab();
  await fillForm("rfid");
  await act(async () => driverWrite(field("rfid"), "DRIVER-77"));

  await act(async () => container.querySelector(".save-button").click());

  const saved = calls.find((call) => call.method === "POST");
  expect(saved).toBeDefined();
  // What was on screen is what got saved, not the empty state behind it.
  expect(saved.body.get("rfid")).toBe("DRIVER-77");

  TEXT_FIELDS.forEach((name) => {
    expect(field(name).value).toBe("");
  });
  expect(container.querySelector('select[name="problemDescription"]').value).toBe(
    "",
  );
  expect(container.querySelector(".success-message").textContent).toContain(
    "sikeresen elmentve",
  );
});

test("the save reload asks the server instead of the browser cache", async () => {
  await renderTab();
  await fillForm();

  await act(async () => container.querySelector(".save-button").click());

  const reloads = calls.filter(
    (call) => call.method === "GET" && call.url.includes("date=2026-07-27"),
  );
  expect(reloads.length).toBeGreaterThan(1);
  expect(reloads.every((call) => call.cache === "no-store")).toBe(true);
});

test("an unfilled field is named instead of the press doing nothing", async () => {
  await renderTab();
  await fillForm("rfid");

  await act(async () => container.querySelector(".save-button").click());

  expect(calls.some((call) => call.method === "POST")).toBe(false);
  const reported = container.querySelector(".error-message").textContent;
  expect(reported).toContain("RFID");
  expect(reported).toContain("nem lett elmentve");
  // Nothing was thrown away either, so the operator can fill the gap and save.
  expect(field("systemItem").value).toBe("systemItem-1");
  expect(document.activeElement.name).toBe("rfid");
});

test("a refused save says why and keeps the record on screen", async () => {
  await renderTab();
  await fillForm();

  global.fetch = jest.fn(async () => ({
    ok: false,
    json: async () => ({ error: "Missing or invalid record data." }),
  }));
  await act(async () => container.querySelector(".save-button").click());

  expect(container.querySelector(".error-message").textContent).toContain(
    "Missing or invalid record data.",
  );
  expect(field("systemItem").value).toBe("systemItem-1");
});

test("SYNC refreshes both worksheets and says so while it runs", async () => {
  await act(async () => {
    root.render(React.createElement(App));
  });

  calls.length = 0;
  hold = deferred();

  await act(async () => container.querySelector(".sync-button").click());

  const button = container.querySelector(".sync-button");
  expect(button.className).toContain("is-syncing");
  expect(button.querySelector("span").textContent).toBe("SYNCING…");

  await act(async () => {
    hold.resolve();
    await hold.promise;
  });
  hold = null;
  await act(async () => {});

  expect(button.querySelector("span").textContent).toBe("SYNC");

  // The hidden sheet is refreshed too — its count is on a tab the operator can
  // see from the other worksheet.
  expect(calls.filter((call) => call.url.startsWith("/api/dhg-records")).length)
    .toBe(2);
  expect(
    calls.filter((call) => call.url.startsWith("/api/deletion-requests")).length,
  ).toBe(2);
  expect(calls.every((call) => call.cache === "no-store")).toBe(true);
});

test("a failed SYNC gives the button back instead of spinning for good", async () => {
  await act(async () => {
    root.render(React.createElement(App));
  });

  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  await act(async () => container.querySelector(".sync-button").click());
  await act(async () => {});

  const button = container.querySelector(".sync-button");
  expect(button.className).not.toContain("is-syncing");
  expect(button.querySelector("span").textContent).toBe("SYNC");
});
