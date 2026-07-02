import { describe, it, expect } from "vitest";
import { inflateRawSync } from "node:zlib";
import { makeZip, crc32 } from "./zip";

/** Minimal reader: walk local file headers and recover each entry's bytes. */
function readZip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const bodyStart = i + 30 + nameLen + extraLen;
    const body = buf.subarray(bodyStart, bodyStart + compSize);
    out[name] = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    i = bodyStart + compSize;
  }
  return out;
}

describe("makeZip", () => {
  it("round-trips multiple entries (deflate + store)", () => {
    const entries = [
      { name: "kidora-config.txt", data: "SERVER=https://x\r\nTOKEN=abc\r\n" },
      { name: "lib/big.js", data: "x".repeat(5000) }, // compresses well → deflate
      { name: "tiny.txt", data: "hi" }, // tiny → likely stored
    ];
    const zip = makeZip(entries);
    const read = readZip(zip);
    expect(read["kidora-config.txt"].toString("utf8")).toContain("TOKEN=abc");
    expect(read["lib/big.js"].toString("utf8")).toBe("x".repeat(5000));
    expect(read["tiny.txt"].toString("utf8")).toBe("hi");
  });

  it("ends with a valid End Of Central Directory record with the right count", () => {
    const zip = makeZip([{ name: "a", data: "1" }, { name: "b", data: "2" }]);
    const eocd = zip.subarray(zip.length - 22);
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50);
    expect(eocd.readUInt16LE(10)).toBe(2); // total entries
  });

  it("crc32 matches a known vector", () => {
    // CRC32 of "123456789" is 0xCBF43926.
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("handles binary buffers", () => {
    const bin = Buffer.from([0, 1, 2, 255, 254, 128, 0, 0]);
    const read = readZip(makeZip([{ name: "b.bin", data: bin }]));
    expect(Buffer.compare(read["b.bin"], bin)).toBe(0);
  });
});
