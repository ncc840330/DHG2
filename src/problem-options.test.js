/**
 * The dropdown and the API have to agree. They did not: five of the eleven
 * options were spelled differently on the two sides ("Damaged" against
 * "Damaged item"), and picking one of those made the API refuse the record with
 * a flat 400 — the record was not saved and the form was never cleared.
 */
import { PROBLEM_OPTIONS as CLIENT_OPTIONS } from "./lib";
import { PROBLEM_OPTIONS as API_OPTIONS } from "../netlify/shared/records";

test("every problem the operator can pick is one the API accepts", () => {
  expect([...CLIENT_OPTIONS].sort()).toEqual([...API_OPTIONS].sort());
});
