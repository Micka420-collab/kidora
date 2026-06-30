// Tiny dependency-free CSV serializer (RFC 4180) with two safety measures:
//  - proper quoting/escaping of fields containing quotes, commas or newlines;
//  - neutralisation of spreadsheet *formula injection* (a.k.a. CSV injection),
//    so an exported value like `=cmd()` can't execute when opened in Excel/Sheets.

export type CsvColumn<T> = {
  /** Stable identifier (not emitted); handy for tests/readability. */
  key: string;
  /** Localized column title shown on the header row. */
  header: string;
  /** Extract the cell value for a given row. */
  value: (row: T) => unknown;
};

// A cell starting with one of these could be interpreted as a formula.
const FORMULA_LEADERS = new Set(["=", "+", "@", "\t", "\r"]);

/** True if the string would be evaluated as a formula by a spreadsheet app. */
function needsFormulaGuard(s: string): boolean {
  if (s.length === 0) return false;
  const c = s[0];
  if (FORMULA_LEADERS.has(c)) return true;
  // A leading "-" is dangerous unless the *whole* cell is a plain negative
  // number (so "-5" / "-5.5" pass, but payloads like "-2+3+cmd|..." are guarded).
  if (c === "-") return !/^-\d+(\.\d+)?$/.test(s);
  return false;
}

/** Escape one CSV field (RFC 4180) and neutralise formula injection. */
export function csvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);

  // Prefix a single quote so spreadsheets treat the cell as text, not a formula.
  if (needsFormulaGuard(s)) s = "'" + s;

  // Quote when the field contains a double-quote, comma, CR or LF; double up quotes.
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Serialize rows to an RFC 4180 CSV string (header line + CRLF-separated rows). */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Prepend a UTF-8 BOM so Excel opens accented (French) text with the right encoding. */
export function csvWithBom(csv: string): string {
  return "\uFEFF" + csv;
}
