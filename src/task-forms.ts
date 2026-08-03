/**
 * What a task type asks for, one place. Both ways of creating a task read from
 * this: the manual row editor builds its inputs from the field list, and the
 * import preview builds its table from the same list, so a column can never be
 * shown in one and forgotten in the other.
 */

export type TaskField = {
  /** The name the row carries to the server. */
  key: string;
  label: string;
  isRequired: boolean;
  placeholder?: string;
  defaultValue?: string;
  /** Set for a dropdown; the empty option is added by the editor. */
  options?: { value: string; label: string }[];
  /** Free text that wants a whole line to itself. */
  isWide?: boolean;
};

export type TaskFormSpec = {
  fields: TaskField[];
  /** Where the TEMPLATE button goes, and what the file is called. */
  templateUrl?: string;
  templateFileName?: string;
  /** What the operator will do with the rows, for the hint under the buttons. */
  hint: string;
};

export const WAREHOUSE_CODE = "FXN-GYOR";

export const SEAL_TEMPLATE_URL = "/templates/yellow-seal-check-template.xlsx";

const PHOTO_FORM: TaskFormSpec = {
  fields: [
    { key: "item", label: "Item", isRequired: true, placeholder: "ITEM-0001" },
    { key: "sn", label: "SN", isRequired: false, placeholder: "4210000123456789" },
    { key: "qty", label: "Qty", isRequired: false, defaultValue: "1" },
    {
      key: "warehouseCode",
      label: "Warehouse Code",
      isRequired: false,
      defaultValue: WAREHOUSE_CODE,
    },
    { key: "subinvCode", label: "Subinv Code", isRequired: false, placeholder: "FGI" },
    { key: "locator", label: "Locator", isRequired: true, placeholder: "A-12-3-4" },
  ],
  hint:
    "A Warehouse Code üresen hagyva FXN-GYOR lesz, és 1-nél nagyobb Qty esetén" +
    " minden darab külön sort kap, külön képekkel.",
};

/**
 * The seal check columns are the printed sheet's own, in its order. The seal
 * answer is not among them: the checker gives it in the app, row by row. Neither
 * are Checked BY, Confirmed BY and Signature — those belong to the printed sheet
 * only, so nobody types them here.
 *
 * The sheet's Bar Code column holds the serial number, so it is the SN field and
 * there is no second one. The key stays `barcode`, which is the column the row is
 * stored in.
 */
const SEAL_FORM: TaskFormSpec = {
  fields: [
    {
      key: "subinvCode",
      label: "From Subinv",
      isRequired: true,
      placeholder: "FGI",
    },
    { key: "locator", label: "Locator", isRequired: true, placeholder: "A-12-3-4" },
    { key: "item", label: "Item", isRequired: true, placeholder: "ITEM-0001" },
    {
      key: "barcode",
      label: "SN",
      isRequired: true,
      placeholder: "4210000123456789",
    },
  ],
  templateUrl: SEAL_TEMPLATE_URL,
  templateFileName: "YELLOW SEAL check template.xlsx",
  hint:
    "Minden sor egy doboz: az ellenőrző a taskban adja meg soronként a Pass vagy" +
    " Fail választ és a megjegyzést. A Checked BY, Confirmed BY és Signature csak" +
    " a PDF exportban kell: ha a fájl első adatsora (H3, I3, J3) tartalmazza," +
    " minden sorra ráíródik. Aláírás nélkül a template J3-ban lévő aláírás kerül" +
    " minden sorba, ahogy az Excelben is.",
};

export const TASK_FORMS: Record<string, TaskFormSpec> = {
  "photo-upload": PHOTO_FORM,
  "yellow-seal": SEAL_FORM,
};

export function taskForm(taskType: string): TaskFormSpec | null {
  return TASK_FORMS[taskType] ?? null;
}

export type RowValues = Record<string, string>;

export function emptyRow(spec: TaskFormSpec): RowValues {
  const row: RowValues = {};
  spec.fields.forEach((field) => {
    row[field.key] = field.defaultValue ?? "";
  });
  return row;
}

/** The first required field left empty, named the way the label reads. */
export function missingField(spec: TaskFormSpec, row: RowValues) {
  return spec.fields.find((field) => field.isRequired && !row[field.key]?.trim())
    ?.label;
}

export function trimRow(spec: TaskFormSpec, row: RowValues): RowValues {
  const trimmed: RowValues = {};
  spec.fields.forEach((field) => {
    trimmed[field.key] = (row[field.key] ?? "").trim() || (field.defaultValue ?? "");
  });
  return trimmed;
}
