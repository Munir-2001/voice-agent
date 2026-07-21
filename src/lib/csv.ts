// Safe CSV generation — neutralizes spreadsheet formula injection so an exported
// lead field like `=HYPERLINK(...)` can't execute when opened in Excel/Sheets.
// Use this when the leads Export button is implemented.

export function safeCsvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // Prefix cells that a spreadsheet would treat as a formula/command.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Quote if it contains a delimiter, quote, or newline.
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(safeCsvCell).join(",");
  const body = rows
    .map((r) => columns.map((c) => safeCsvCell(r[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}
