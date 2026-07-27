/**
 * The camera fallback. On a PDA whose scan engine never reaches the browser,
 * this is the only path a barcode can take into a field, so it is covered from
 * the button press down to the released camera.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { encodeCode128, modulesToImage } from "./barcode-fixtures";
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
let originalGetContext;

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
  Object.defineProperty(window.HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 720,
  });
}

/**
 * A canvas that hands the fallback decoder a printed barcode where a browser
 * would hand it a camera frame. jsdom has no canvas of its own to draw on.
 */
function installCanvasStub(frame) {
  window.HTMLCanvasElement.prototype.getContext = () => ({
    drawImage: () => {},
    getImageData: () => frame,
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  codeQueue = [];
  stoppedTracks = 0;
  streamRequests = 0;
  originalGetContext = window.HTMLCanvasElement.prototype.getContext;
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
  window.HTMLCanvasElement.prototype.getContext = originalGetContext;
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

  // …and the wedge is listening again once the camera is closed. LOCATOR is the
  // last field, so the camera scan leaves the caret on the SAVE button; a stray
  // barcode after that belongs in the first field still waiting for one.
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
  expect(field("sourceTaskId").value).toBe("WEDGE-1");
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

test("every text field has a camera button, dropdowns aside", async () => {
  await renderTab();

  const scanned = Array.from(
    container.querySelectorAll(".camera-scan-button"),
  ).map((button) => button.parentElement.querySelector("input").name);

  expect(scanned).toEqual([
    "sourceTaskId",
    "systemItem",
    "systemSn",
    "physicalItem",
    "physicalSn",
    "rfid",
    "locator",
  ]);
});

test("the camera reads 1D barcodes where the browser has no decoder of its own", async () => {
  // No BarcodeDetector: desktop Chrome, Firefox, every browser on iOS. The
  // button used to be missing here, and with it the only way in for a device
  // whose scan engine the page cannot reach.
  delete window.BarcodeDetector;
  installCanvasStub(modulesToImage(encodeCode128("CAM-FALLBACK-1")));

  await renderTab();
  await act(async () => cameraButton("sourceTaskId").click());
  // Two frames have to agree before a value is taken, so this is not one tick.
  await act(async () => {
    await wait(600);
  });

  expect(field("sourceTaskId").value).toBe("CAM-FALLBACK-1");
  expect(overlay()).toBeNull();
  expect(streamRequests).toBe(1);
  expect(stoppedTracks).toBe(1);
});

test("deletion requests scan by camera too", async () => {
  await renderDeletionTab();
  codeQueue.push("DEL-88");

  await act(async () => cameraButton("systemSn").click());
  await settle();

  expect(field("systemSn").value).toBe("DEL-88");
  expect(document.activeElement.name).toBe("rfid");
});
