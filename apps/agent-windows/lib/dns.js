// Minimal DNS wire-format codec — just enough to read the queried name and to
// synthesize sinkhole (block) and CNAME (safesearch) responses. UDP only.

export const TYPE = { A: 1, NS: 2, CNAME: 5, AAAA: 28 };

/** Parse a DNS query buffer → { id, qname, qtype, qclass, questionEnd } or null. */
export function parseQuery(buf) {
  if (!buf || buf.length < 12) return null;
  const id = buf.readUInt16BE(0);
  const qdcount = buf.readUInt16BE(4);
  if (qdcount < 1) return null;

  const labels = [];
  let off = 12;
  while (off < buf.length) {
    const len = buf[off];
    if (len === 0) { off += 1; break; }
    if (len & 0xc0) return null; // compression pointer not expected in a question
    off += 1;
    if (off + len > buf.length) return null;
    labels.push(buf.toString("latin1", off, off + len));
    off += len;
  }
  if (off + 4 > buf.length) return null;
  const qtype = buf.readUInt16BE(off);
  const qclass = buf.readUInt16BE(off + 2);
  return { id, qname: labels.join("."), qtype, qclass, questionEnd: off + 4 };
}

/** Encode a domain name to length-prefixed labels + root. */
export function encodeName(name) {
  const parts = String(name).replace(/\.$/, "").split(".").filter(Boolean);
  const bufs = [];
  for (const p of parts) {
    const b = Buffer.from(p, "latin1");
    bufs.push(Buffer.from([b.length]), b);
  }
  bufs.push(Buffer.from([0]));
  return Buffer.concat(bufs);
}

function header(id, ancount, rcode = 0) {
  const h = Buffer.alloc(12);
  h.writeUInt16BE(id, 0);
  h.writeUInt16BE(0x8180 | (rcode & 0x0f), 2); // QR=1, RD=1, RA=1
  h.writeUInt16BE(1, 4); // qdcount
  h.writeUInt16BE(ancount, 6);
  return h;
}

function answerRecord(type, rdata, ttl = 60) {
  const rec = Buffer.alloc(12 + rdata.length);
  rec.writeUInt16BE(0xc00c, 0); // NAME → pointer to the question's QNAME (offset 12)
  rec.writeUInt16BE(type, 2);
  rec.writeUInt16BE(1, 4); // CLASS IN
  rec.writeUInt32BE(ttl, 6);
  rec.writeUInt16BE(rdata.length, 10);
  rdata.copy(rec, 12);
  return rec;
}

/** Block response: A 0.0.0.0 / AAAA :: / NXDOMAIN for other types. */
export function buildSinkhole(query, queryBuf) {
  const question = queryBuf.subarray(12, query.questionEnd);
  if (query.qtype === TYPE.A) {
    return Buffer.concat([header(query.id, 1), question, answerRecord(TYPE.A, Buffer.from([0, 0, 0, 0]))]);
  }
  if (query.qtype === TYPE.AAAA) {
    return Buffer.concat([header(query.id, 1), question, answerRecord(TYPE.AAAA, Buffer.alloc(16))]);
  }
  return Buffer.concat([header(query.id, 0, 3), question]); // NXDOMAIN
}

/** CNAME response pointing the queried name at `target` (used for SafeSearch). */
export function buildCname(query, queryBuf, target) {
  const question = queryBuf.subarray(12, query.questionEnd);
  return Buffer.concat([header(query.id, 1), question, answerRecord(TYPE.CNAME, encodeName(target))]);
}
