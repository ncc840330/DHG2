import { useEffect, useRef, useState } from "react";
import { decodeBarcodeImage } from "./barcode-1d";

/**
 * A web page cannot pull the trigger on a PDA's scan engine — that sits behind
 * vendor firmware no browser API can reach. This module is the way in that is
 * left when a device refuses to wedge its barcodes into the page at all: the
 * camera takes the picture and a decoder reads it.
 *
 * Which decoder depends on the browser. Chrome on Android has BarcodeDetector,
 * which is the whole platform's decoder and reads 2D codes as well, so it is
 * used wherever it exists. Everywhere else — desktop Chrome, Firefox, every iOS
 * browser — the 1D decoder in `barcode-1d.ts` reads the frames instead, because
 * a camera button that is missing on half the devices is not a camera button.
 */

type DetectedBarcode = {
  rawValue?: string;
  boundingBox?: { width: number; height: number };
};

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Rack labels here are 1D, the newer asset tags are 2D — both have to read. */
const WANTED_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "data_matrix",
  "qr_code",
  "pdf417",
  "aztec",
];

/** Slow enough to leave the decoder room, fast enough to feel instant. */
const DETECT_INTERVAL_MS = 160;

/**
 * Frame width the fallback decoder works on. Wide enough that the thinnest bar
 * of a label held inside the reticle is still a few pixels across, small enough
 * that a frame is read well inside the interval above.
 */
const FALLBACK_FRAME_WIDTH = 960;

/** Reads one frame. Answers with the barcode in it, or "" for keep looking. */
type FrameReader = (video: HTMLVideoElement) => Promise<string>;

function getBarcodeDetector() {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
}

/**
 * A camera is all that is needed now: whatever the browser cannot decode itself,
 * `barcode-1d.ts` decodes from the frames. Without a camera there is nothing to
 * aim, and the caller hides the button.
 */
export function isCameraScanSupported() {
  return typeof navigator?.mediaDevices?.getUserMedia === "function";
}

/** Asking for a format the device cannot decode makes the detector throw. */
async function pickFormats(detector: BarcodeDetectorConstructor) {
  try {
    const supported = await detector.getSupportedFormats?.();
    if (!supported || supported.length === 0) return [];
    return WANTED_FORMATS.filter((format) => supported.includes(format));
  } catch {
    return [];
  }
}

function boxArea(code: DetectedBarcode) {
  const box = code.boundingBox;
  return box ? box.width * box.height : 0;
}

/**
 * One frame, one answer. Frames the decoder cannot use are the normal case —
 * most of them are motion blur — so a rejection here is not worth reporting.
 */
async function readFrame(
  detector: BarcodeDetectorInstance,
  video: HTMLVideoElement,
) {
  if (video.readyState < 2 || !video.videoWidth) return "";

  let codes: DetectedBarcode[] = [];
  try {
    codes = await detector.detect(video);
  } catch {
    return "";
  }

  // With several labels in shot, the biggest one is the one being aimed at.
  const best = codes
    .filter((code) => (code.rawValue ?? "").trim() !== "")
    .sort((left, right) => boxArea(right) - boxArea(left))[0];

  return best ? (best.rawValue ?? "").trim() : "";
}

/** The browser's own decoder, where there is one. It reads 2D codes as well. */
async function createDetectorReader(): Promise<FrameReader | null> {
  const detectorConstructor = getBarcodeDetector();
  if (!detectorConstructor) return null;

  const formats = await pickFormats(detectorConstructor);
  let detector: BarcodeDetectorInstance;
  try {
    detector = new detectorConstructor(
      formats.length > 0 ? { formats } : undefined,
    );
  } catch {
    // The API is there but the platform never shipped the decoder behind it.
    return null;
  }

  return (video) => readFrame(detector, video);
}

/**
 * Everywhere else: the frame is copied into a canvas and read by our own 1D
 * decoder. A barcode has to come back the same from two frames in a row before
 * it counts — a single misread digit in a serial number would be copied into the
 * record as if it had been scanned properly.
 */
function createCanvasReader(): FrameReader | null {
  const canvas = document.createElement("canvas");
  // Not in the DOM's own typings yet, and the frames are read on every tick, so
  // the hint is worth the cast: without it the browser keeps the canvas on the
  // GPU and every read copies it back.
  const options = { willReadFrequently: true } as unknown as
    CanvasRenderingContext2DSettings;

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d", options);
  } catch {
    return null;
  }
  if (!context) return null;

  const surface = context;
  let seen = "";

  return async (video) => {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return "";

    const scale = Math.min(1, FALLBACK_FRAME_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    let frame: ImageData;
    try {
      surface.drawImage(video, 0, 0, width, height);
      frame = surface.getImageData(0, 0, width, height);
    } catch {
      return "";
    }

    const code = decodeBarcodeImage(frame);
    if (!code) return "";
    if (code !== seen) {
      seen = code;
      return "";
    }
    return code;
  };
}

function describeCameraError(error: unknown) {
  const name = (error as { name?: string } | null)?.name ?? "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "A kamera használata le van tiltva. Engedélyezd a böngésző beállításaiban, majd próbáld újra.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Nem található használható kamera ezen a készüléken.";
  }
  if (name === "NotReadableError") {
    return "A kamerát egy másik alkalmazás használja. Zárd be azt, majd próbáld újra.";
  }
  return "A kamera nem indítható el. Próbáld újra, vagy írd be az értéket kézzel.";
}

type CameraScanOverlayProps = {
  /** Which field the code is going into, shown in the viewfinder. */
  label: string;
  onDetect: (code: string) => void;
  onCancel: () => void;
};

/**
 * The viewfinder. It owns the camera for exactly as long as it is on screen:
 * the stream is stopped on the first decoded barcode, on cancel and on unmount,
 * because a PDA left holding an open camera drains its shift battery.
 */
export function CameraScanOverlay({
  label,
  onDetect,
  onCancel,
}: CameraScanOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  const [status, setStatus] = useState<"starting" | "scanning" | "error">(
    "starting",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [hasLight, setHasLight] = useState(false);
  const [isLightOn, setIsLightOn] = useState(false);

  // The dialog itself takes focus, not the cancel button: a hardware scanner's
  // trailing Enter would otherwise close the viewfinder the operator just opened.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    let isStopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;

    const stop = () => {
      isStopped = true;
      window.clearTimeout(timer);
      trackRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      // A decoded barcode stops the camera, then unmount stops it again — the
      // second pass has nothing left to do.
      stream = null;
    };

    const fail = (message: string) => {
      setStatus("error");
      setErrorMessage(message);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (streamError) {
        if (!isStopped) fail(describeCameraError(streamError));
        return;
      }

      const video = videoRef.current;
      if (isStopped || !video) {
        stop();
        return;
      }

      video.srcObject = stream;
      try {
        // Muted and inline, so this is allowed without a gesture — and it was
        // a button press that got us here anyway.
        await video.play();
      } catch {
        /* A rejected play still leaves a stream we can read frames from. */
      }

      const [track] = stream.getVideoTracks();
      trackRef.current = track ?? null;
      const capabilities = track?.getCapabilities?.() as unknown as
        | { torch?: boolean }
        | undefined;
      if (!isStopped && capabilities?.torch) setHasLight(true);

      const reader = (await createDetectorReader()) ?? createCanvasReader();
      if (isStopped) return;

      if (!reader) {
        stop();
        fail("Ez a böngésző nem tud vonalkódot olvasni a kamerából.");
        return;
      }

      setStatus("scanning");

      const tick = async () => {
        if (isStopped) return;

        const code = await reader(video);
        if (isStopped) return;

        if (code) {
          // Camera off first: the operator gets the hit and the light dies at
          // the same moment, which is what makes it feel like a scanner.
          stop();
          navigator.vibrate?.(60);
          onDetectRef.current(code);
          return;
        }

        timer = window.setTimeout(() => void tick(), DETECT_INTERVAL_MS);
      };

      void tick();
    };

    void start();
    return stop;
  }, []);

  const toggleLight = async () => {
    const track = trackRef.current;
    if (!track) return;

    const next = !isLightOn;
    try {
      // The torch is not in the standard constraint set, but it is the only way
      // to light a dim rack aisle from a web page.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setIsLightOn(next);
    } catch {
      setHasLight(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="camera-scan"
      role="dialog"
      aria-modal="true"
      aria-label={`Scan ${label} with the camera`}
      tabIndex={-1}
    >
      <div className="camera-scan-view">
        <video ref={videoRef} playsInline muted autoPlay />
        {status !== "error" && <div className="camera-scan-reticle" aria-hidden="true" />}
        <p className="camera-scan-target">{label}</p>
        {status === "error" ? (
          <p className="camera-scan-error">{errorMessage}</p>
        ) : (
          <p className="camera-scan-hint">
            {status === "starting"
              ? "STARTING CAMERA…"
              : "HOLD THE BARCODE INSIDE THE FRAME"}
          </p>
        )}
      </div>

      <div className="camera-scan-actions">
        {hasLight && (
          <button
            className={isLightOn ? "camera-scan-light is-on" : "camera-scan-light"}
            type="button"
            onClick={() => void toggleLight()}
          >
            {isLightOn ? "LIGHT OFF" : "LIGHT ON"}
          </button>
        )}
        <button className="camera-scan-cancel" type="button" onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </div>
  );
}
