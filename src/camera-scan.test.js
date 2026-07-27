/**
 * The camera fallback. On a PDA whose scan engine never reaches the browser,
 * this is the only path a barcode can take into a field, so it is covered from
 * the button press down to the released camera.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import DeletionRequestTab from "./DeletionRequestTab";
import DhgTab from "./DhgTab";

function jsonResponse(body) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

let container;
let root;
let codeQueue;
let stoppedTracks;
let streamRequests;

/** jsdom has neither a camera nor a decoder, so both are stood in for. */
function installCameraStubs() {
  const track = {
    kind: "video",
    stop: () => {
      stoppedTracks += 1;
    },
    getCapabilities: () => ({}),
    applyConstraints: () => Promise.resolve(),
  };
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: jest.fn(() => {
        streamRequests += 1;
        return Promise.resolve(stream);
      }),
    },
  });

  window.BarcodeDetector = class {
    static getSupportedFormats() {
      return Promise.resolve(["code_128", "qr_code"]);
    }

    detect() {
      const next = codeQueue.shift();
      return Promise.resolve(
        next ? [{ rawValue: next, boundingBox: { width: 90, height: 40 } }] : [],
      );
    }
  };

  // A video element in jsdom never has a frame to give, so it is told it does.
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  Object.defineProperty(window.HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, "readyState", {
    configurable: true,
    get: () => 4,
  });
  Object.defineProperty(window.HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 1280,
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  codeQueue = [];
  stoppedTracks = 0;
  streamRequests = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn(() =>
    jsonResponse({ counts: [], records: [], nextLineId: "20260727-001" }),
  );
  installCameraStubs();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.BarcodeDetector;
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

async function renderDeletionTab() {
  await act(async () => {
    root.render(
      React.createElement(DeletionRequestTab, {
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

const cameraButton = (name) =>
  field(name).parentElement.querySelector(".camera-scan-button");

const overlay = () => document.querySelector(".camera-scan");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Lets the getUserMedia → play → detect chain run to its first frame. */
async function settle() {
  await act(async () => {
    await wait(80);
  });
}

test("a decoded barcode lands in the field the camera was opened for", async () => {
  await renderTab();
  codeQueue.push("CAM-4711");

  await act(async () => cameraButton("rfid").click());
  await settle();

  expect(field("rfid").value).toBe("CAM-4711");
  expect(overlay()).toBeNull();
  expect(stoppedTracks).toBe(1);
  expect(document.activeElement.name).toBe("problemDescription");
});

test("the viewfinder stays up until something decodes", async () => {
  await renderTab();

  await act(async () => cameraButton("systemItem").click());
  await settle();

  expect(overlay()).not.toBeNull();
  expect(field("systemItem").value).toBe("");

  codeQueue.push("LATE-1");
  await settle();

  expect(field("systemItem").value).toBe("LATE-1");
});

test("cancel releases the camera and gives the field back", async () => {
  await renderTab();

  await act(async () => cameraButton("locator").click());
  await settle();
  await act(async () => {
    container.ownerDocument
      .querySelector(".camera-scan-cancel")
      .click();
  });

  expect(overlay()).toBeNull();
  expect(stoppedTracks).toBe(1);
  expect(field("locator").value).toBe("");
  expect(document.activeElement.name).toBe("locator");
});

test("a hardware scan is ignored while the viewfinder is open", async () => {
  await renderTab();

  await act(async () => cameraButton("locator").click());
  await settle();

  await act(async () => {
    "STRAY-9".split("").forEach((char) => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, keyCode: 65, bubbles: true }),
      );
    });
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }),
    );
  });

  expect(field("systemItem").value).toBe("");

  // …and the wedge is listening again once the camera is closed. A camera scan
  // leaves the caret in the next field, which owns its own keystrokes, so the
  // stray path only reopens after that field is left.
  codeQueue.push("CAM-5");
  await settle();
  document.activeElement.blur();
  await act(async () => {
    "WEDGE-1".split("").forEach((char) => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, keyCode: 65, bubbles: true }),
      );
    });
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }),
    );
  });

  expect(field("locator").value).toBe("CAM-5");
  expect(field("systemItem").value).toBe("WEDGE-1");
});

test("a refused camera permission is reported instead of failing silently", async () => {
  const denial = new Error("denied");
  denial.name = "NotAllowedError";
  navigator.mediaDevices.getUserMedia = jest.fn(() => Promise.reject(denial));

  await renderTab();
  await act(async () => cameraButton("systemSn").click());
  await settle();

  expect(document.querySelector(".camera-scan-error").textContent).toContain(
    "kamera",
  );
  expect(overlay()).not.toBeNull();
});

test("no camera button where the browser cannot decode a barcode", async () => {
  delete window.BarcodeDetector;
  await renderTab();

  expect(container.querySelector(".camera-scan-button")).toBeNull();
  expect(streamRequests).toBe(0);
});

test("deletion requests scan by camera too", async () => {
  await renderDeletionTab();
  codeQueue.push("DEL-88");

  await act(async () => cameraButton("systemSn").click());
  await settle();

  expect(field("systemSn").value).toBe("DEL-88");
  expect(document.activeElement.name).toBe("rfid");
});
