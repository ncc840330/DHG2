import {
  createContext,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CameraScanOverlay, isCameraScanSupported } from "./camera-scan";

/**
 * Everything in this module exists for one reason: a warehouse PDA is not a
 * keyboard. Its scanner hands the barcode over in whichever way the vendor's
 * firmware feels like — a keystroke burst, one IME commit, or a direct write to
 * the input value — and each of those breaks a plain controlled React input in
 * a different place. The helpers here accept all three, plus the camera for
 * devices whose scan engine never reaches the browser at all.
 */

/** Controls a scanner's Enter is allowed to walk through. */
export const SCAN_FIELD_SELECTOR =
  "input:not([disabled]):not([readonly]):not([type=file]):not([type=checkbox]), select:not([disabled])";

const COMMIT_KEY_CODES = [13, 9];
const COMMIT_KEYS = ["Enter", "Tab", "Go", "Next", "Done", "Send", "Search"];
const UNNAMED_KEYS = ["", "Unidentified", "Process"];

/** Fastest a human types on a PDA keypad, in milliseconds between keys. */
const HUMAN_KEY_GAP_MS = 60;
const SCAN_IDLE_MS = 140;
const MIN_SCAN_LENGTH = 3;

/**
 * True while the camera viewfinder owns the screen. The hardware wedge has to
 * stand down for that stretch: its keystrokes would be flushed into a field the
 * operator cannot see, and the camera is already aimed at one specific field.
 */
let isCameraScanOpen = false;

type KeyLike = {
  key?: string;
  keyCode?: number;
  which?: number;
};

/**
 * True for the key a scanner appends after the barcode. Android WebViews and
 * most PDA keyboard drivers report "Unidentified" (or nothing at all) while
 * still carrying the legacy key code, so the name alone is not enough.
 */
export function isCommitKey(event: KeyLike) {
  const key = event.key ?? "";
  if (COMMIT_KEYS.includes(key)) return true;

  const code = event.keyCode ?? event.which ?? 0;
  return UNNAMED_KEYS.includes(key) && COMMIT_KEY_CODES.includes(code);
}

/**
 * Moves focus to the next control so a scanner's trailing Enter walks down the
 * form instead of submitting it early. Falls through to the save button once
 * the last field is done.
 */
export function focusNextControl(
  form: HTMLFormElement | null,
  target: HTMLElement | null,
) {
  if (!form || !target) return;

  const controls = Array.from(
    form.querySelectorAll<HTMLElement>(SCAN_FIELD_SELECTOR),
  );
  const currentIndex = controls.indexOf(target);
  if (currentIndex < 0) return;

  const nextControl = controls[currentIndex + 1];
  if (nextControl) {
    nextControl.focus();
    return;
  }

  form.querySelector<HTMLButtonElement>(".save-button")?.focus();
}

/** First field still waiting for a value — where a stray scan belongs. */
function findEmptyField(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement>(SCAN_FIELD_SELECTOR))
    .filter((control): control is HTMLInputElement => control.tagName === "INPUT")
    .find((control) => control.name && control.value.trim() === "");
}

/** The named controls a scan can land in. */
function scanFields(form: HTMLFormElement | null) {
  if (!form) return [];
  return Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      SCAN_FIELD_SELECTOR,
    ),
  ).filter((control) => control.name !== "");
}

/**
 * What the operator can actually see in the form, keyed by field name. React
 * state is normally the same thing, but a scanner driver that writes straight
 * into `input.value` without firing an event leaves state behind — and then the
 * record would be saved without the barcode that is sitting there on screen.
 */
export function readScanFields(form: HTMLFormElement | null) {
  const values: Record<string, string> = {};
  scanFields(form).forEach((control) => {
    values[control.name] = control.value;
  });
  return values;
}

/**
 * Empties the fields for real. React does not re-sync a controlled input whose
 * value prop did not change, so a value that never made it into state — the
 * driver write above — survives an `EMPTY_FORM` reset and stays on screen,
 * which looks exactly like the SAVE button having done nothing.
 */
export function clearScanFields(form: HTMLFormElement | null) {
  scanFields(form).forEach((control) => {
    if (control.value !== "") control.value = "";
  });
}

/** Required controls the operator has left empty, in the order they appear. */
export function findMissingFields(form: HTMLFormElement | null) {
  return scanFields(form).filter(
    (control) => control.required && control.value.trim() === "",
  );
}

/** A control's visible title, so a message can name what is missing. */
export function describeField(control: HTMLInputElement | HTMLSelectElement) {
  const label = control.labels?.[0];
  const title = label?.querySelector("span")?.textContent ?? label?.textContent;
  return (title ?? control.name).trim();
}

/** Controls that own their keystrokes: they have a caret to type into. */
function isTextEntryTarget(element: Element | null) {
  if (!element) return false;
  const tagName = element.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    (element as HTMLElement).isContentEditable
  );
}

type ScannerFormOptions = {
  formRef: RefObject<HTMLFormElement>;
  /** Writes a scanned or typed value into form state, keyed by field name. */
  onValue: (field: string, value: string) => void;
  /** Only capture while the form is on screen. */
  isEnabled: boolean;
};

/**
 * Wires a form for PDA scanning: the trailing Enter advances instead of
 * submitting, the value under the caret is committed even when the scanner
 * outruns React's change event, and a barcode that arrives while nothing is
 * focused — or while the caret sits on a dropdown — still lands in the next
 * empty field.
 */
export function useScannerForm({
  formRef,
  onValue,
  isEnabled,
}: ScannerFormOptions) {
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;

  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const gapsRef = useRef<number[]>([]);
  const idleTimerRef = useRef(0);
  const selectGuardRef = useRef<{ element: HTMLSelectElement; value: string } | null>(
    null,
  );

  /** Reads the live DOM value, which is always ahead of React state. */
  const commitTarget = useCallback((target: EventTarget | null) => {
    const input = target as HTMLInputElement | null;
    if (!input || input.tagName !== "INPUT" || !input.name) return;
    onValueRef.current(input.name, input.value);
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (event.shiftKey || !isCommitKey(event)) return;

      const target = event.target as HTMLElement | null;
      if (!target || target.tagName === "BUTTON") return;

      event.preventDefault();
      commitTarget(target);
      focusNextControl(formRef.current, target);
    },
    [commitTarget, formRef],
  );

  const deliverStrayScan = useCallback(
    (scanned: string) => {
      const form = formRef.current;
      if (!form) return;

      const field = findEmptyField(form);
      if (!field) return;

      // Paint it immediately so the operator sees the hit even before React
      // re-renders, then hand it to state and move on to the next field.
      field.value = scanned;
      onValueRef.current(field.name, scanned);
      focusNextControl(form, field);
    },
    [formRef],
  );

  useEffect(() => {
    if (!isEnabled) return undefined;

    const resetBuffer = () => {
      bufferRef.current = "";
      gapsRef.current = [];
      // Without this the idle gap before the next barcode counts as a keystroke
      // gap, and the second scan of a shift reads as slow human typing.
      lastKeyAtRef.current = 0;
      selectGuardRef.current = null;
      window.clearTimeout(idleTimerRef.current);
    };

    /** A burst too fast and too long to be someone tapping the keypad. */
    const isScanBurst = () => {
      if (bufferRef.current.trim().length < MIN_SCAN_LENGTH) return false;
      const gaps = gapsRef.current;
      if (gaps.length === 0) return false;
      const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      return average <= HUMAN_KEY_GAP_MS;
    };

    const flushBuffer = () => {
      const scanned = bufferRef.current.trim();
      const wasScan = isScanBurst();
      const selectGuard = selectGuardRef.current;
      resetBuffer();
      if (!wasScan) return false;

      // A dropdown's type-ahead treats a barcode as a search string and quietly
      // rewrites the selection, so put back what the operator had chosen.
      if (selectGuard && selectGuard.element.value !== selectGuard.value) {
        selectGuard.element.value = selectGuard.value;
        if (selectGuard.element.name) {
          onValueRef.current(selectGuard.element.name, selectGuard.value);
        }
      }

      deliverStrayScan(scanned);
      return true;
    };

    const handleStrayKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (isCameraScanOpen) return;

      const active = document.activeElement;

      // Anything with a caret in it handles its own keys.
      if (isTextEntryTarget(active)) {
        resetBuffer();
        return;
      }

      if (isCommitKey(event)) {
        // Stop the form's own Enter handling as well: the flush already moved
        // focus to the field after the one it filled.
        if (flushBuffer()) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (!event.key || event.key.length !== 1) return;

      if (active && active.tagName === "SELECT" && !selectGuardRef.current) {
        const select = active as HTMLSelectElement;
        selectGuardRef.current = { element: select, value: select.value };
      }

      const now = Date.now();
      if (lastKeyAtRef.current) {
        gapsRef.current.push(now - lastKeyAtRef.current);
      }
      lastKeyAtRef.current = now;
      bufferRef.current += event.key;

      // Scanners without a trailing Enter simply go quiet when they are done.
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(flushBuffer, SCAN_IDLE_MS);
    };

    document.addEventListener("keydown", handleStrayKey, true);
    return () => {
      document.removeEventListener("keydown", handleStrayKey, true);
      resetBuffer();
    };
  }, [isEnabled, deliverStrayScan]);

  return { onKeyDown: handleKeyDown, commitTarget };
}

type CameraScanRequest = {
  field: string;
  label: string;
  element: HTMLInputElement | null;
};

type CameraScanControl = {
  isSupported: boolean;
  requestScan: (request: CameraScanRequest) => void;
};

const CameraScanContext = createContext<CameraScanControl | null>(null);

/**
 * Wraps a form so every ScanField inside it can borrow the camera. Nothing is
 * rendered until a field asks for it, and on a device where the browser cannot
 * decode a barcode the fields never ask — the button is not there to be pressed.
 */
export function CameraScanProvider({
  formRef,
  onValue,
  children,
}: {
  formRef: RefObject<HTMLFormElement>;
  onValue: (field: string, value: string) => void;
  children: ReactNode;
}) {
  const [isSupported] = useState(isCameraScanSupported);
  const [request, setRequest] = useState<CameraScanRequest | null>(null);
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;

  const requestScan = useCallback((next: CameraScanRequest) => {
    isCameraScanOpen = true;
    setRequest(next);
  }, []);

  const closeCamera = useCallback(() => {
    isCameraScanOpen = false;
    setRequest(null);
  }, []);

  // Leaving the tab mid-scan must not leave the wedge muted for the next form.
  useEffect(
    () => () => {
      isCameraScanOpen = false;
    },
    [],
  );

  const control = useMemo(
    () => ({ isSupported, requestScan }),
    [isSupported, requestScan],
  );

  return (
    <CameraScanContext.Provider value={control}>
      {children}
      {request && (
        <CameraScanOverlay
          label={request.label}
          onCancel={() => {
            closeCamera();
            request.element?.focus();
          }}
          onDetect={(code) => {
            closeCamera();
            // Painted straight into the DOM first, exactly like a wedge scan,
            // so the operator sees the hit before React re-renders.
            if (request.element) request.element.value = code;
            onValueRef.current(request.field, code);
            focusNextControl(formRef.current, request.element);
          }}
        />
      )}
    </CameraScanContext.Provider>
  );
}

type ScanFieldProps = {
  label: string;
  name: string;
  value: string;
  onValue: (field: string, value: string) => void;
  hint?: string;
  required?: boolean;
  className?: string;
  options?: string[];
  inputRef?: RefObject<HTMLInputElement>;
};

/**
 * A text field that keeps its React state in step with the DOM no matter how
 * the characters arrived — typed, pasted, committed by the Android IME in one
 * go, or written straight into `input.value` by the scanner driver. The last
 * two are why the native listeners are here: React matches change events
 * against its own value tracker and drops the ones it did not expect, which is
 * exactly the case where a scan silently disappears. Inside a CameraScanProvider
 * the field also grows a camera button, for the devices that hand the browser
 * nothing at all.
 */
export function ScanField({
  label,
  name,
  value,
  onValue,
  hint,
  required,
  className,
  options,
  inputRef,
}: ScanFieldProps) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const onValueRef = useRef(onValue);
  onValueRef.current = onValue;
  const camera = useContext(CameraScanContext);
  const fieldId = useId();

  const setRefs = useCallback(
    (element: HTMLInputElement | null) => {
      localRef.current = element;
      if (inputRef) {
        (inputRef as MutableRefObject<HTMLInputElement | null>).current = element;
      }
    },
    [inputRef],
  );

  useEffect(() => {
    const element = localRef.current;
    if (!element) return undefined;

    const sync = () => onValueRef.current(name, element.value);
    // Clipboard-mode scanners fire paste before the value is in the field.
    const syncLater = () => window.setTimeout(sync, 0);

    element.addEventListener("input", sync);
    element.addEventListener("change", sync);
    element.addEventListener("compositionend", sync);
    element.addEventListener("paste", syncLater);
    return () => {
      element.removeEventListener("input", sync);
      element.removeEventListener("change", sync);
      element.removeEventListener("compositionend", sync);
      element.removeEventListener("paste", syncLater);
    };
  }, [name]);

  const listId = options ? `${name}-options` : undefined;

  return (
    <div className={className ? `field ${className}` : "field"}>
      <label className="field-title" htmlFor={fieldId}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <div className="scan-row">
        <input
          id={fieldId}
          ref={setRefs}
          type="text"
          name={name}
          value={value}
          required={required}
          list={listId}
          inputMode="text"
          enterKeyHint="next"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onValue(name, event.target.value)}
        />
        {camera?.isSupported && (
          <button
            className="camera-scan-button"
            type="button"
            title={`Scan ${label} with the camera`}
            aria-label={`Scan ${label} with the camera`}
            onClick={() =>
              camera.requestScan({
                field: name,
                label,
                element: localRef.current,
              })
            }
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
              <path d="M3 12h18" />
            </svg>
          </button>
        )}
      </div>
      {options && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </div>
  );
}
