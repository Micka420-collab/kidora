import { describe, it, expect } from "vitest";
import { csvCell, toCsv, csvWithBom, type CsvColumn } from "./csv";

describe("csvCell", () => {
  it("passes plain values through unchanged", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(true)).toBe("true");
  });

  it("renders null/undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("serializes Date as ISO 8601", () => {
    expect(csvCell(new Date("2026-06-30T01:23:45.000Z"))).toBe("2026-06-30T01:23:45.000Z");
  });

  it("quotes fields containing comma, quote, CR or LF and doubles inner quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("a\r\nb")).toBe('"a\r\nb"');
  });

  it("neutralises formula injection (=, +, @, leading tab/CR)", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    // tab leader gets guarded then quoted is not needed (tab isn't special to RFC4180)
    expect(csvCell("\tx")).toBe("'\tx");
  });

  it("guards a dangerous leading '-' but keeps negative numbers intact", () => {
    // Classic payload that *looks* numeric but is a formula → must be guarded.
    expect(csvCell("-2+3+cmd|'/C'")).toBe("'-2+3+cmd|'/C'");
    expect(csvCell("-cmd")).toBe("'-cmd");
    // Genuine negative numbers stay untouched.
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("-5.5")).toBe("-5.5");
  });

  it("combines formula guard and quoting when both apply", () => {
    // starts with '=' (guard) and contains a comma (quote)
    expect(csvCell("=A1,B2")).toBe('"\'=A1,B2"');
  });
});

describe("toCsv", () => {
  type Row = { name: string; n: number };
  const cols: CsvColumn<Row>[] = [
    { key: "name", header: "Nom", value: (r) => r.name },
    { key: "n", header: "Score", value: (r) => r.n },
  ];

  it("emits a header row even with no data", () => {
    expect(toCsv([], cols)).toBe("Nom,Score");
  });

  it("joins rows with CRLF and cells with commas", () => {
    const csv = toCsv([{ name: "Léa", n: 3 }, { name: "Tom", n: 7 }], cols);
    expect(csv).toBe("Nom,Score\r\nLéa,3\r\nTom,7");
  });

  it("escapes per-cell inside a full table", () => {
    const csv = toCsv([{ name: 'a,"b"', n: 1 }], cols);
    expect(csv).toBe('Nom,Score\r\n"a,""b""",1');
  });
});

describe("csvWithBom", () => {
  it("prepends the UTF-8 BOM", () => {
    expect(csvWithBom("a")).toBe("﻿a");
    expect(csvWithBom("a").charCodeAt(0)).toBe(0xfeff);
  });
});
