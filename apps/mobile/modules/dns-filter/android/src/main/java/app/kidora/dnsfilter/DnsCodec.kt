package app.kidora.dnsfilter

// Minimal DNS + IPv4/UDP wire codec — just enough to read the queried name and to
// synthesize sinkhole (block) and CNAME (SafeSearch) answers, then re-frame them
// as an IPv4/UDP packet to write back into the tun interface. UDP/IPv4 only; the
// VpnService routes only the dummy DNS server's IPv4 address through the tun, so
// every captured packet is IPv4 UDP to port 53. This ports the DNS-level codec
// from apps/agent-windows/lib/dns.js.
object DnsCodec {

  private const val TYPE_A = 1
  private const val TYPE_AAAA = 28
  private const val TYPE_CNAME = 5

  data class Query(val id: Int, val qname: String, val qtype: Int, val questionEnd: Int)

  /** Parse a DNS message → id, first question name/type, and the byte offset just
   *  past the question, or null if malformed. */
  fun parseQuery(buf: ByteArray): Query? {
    if (buf.size < 12) return null
    val id = u16(buf, 0)
    val qdcount = u16(buf, 4)
    if (qdcount < 1) return null
    val labels = ArrayList<String>()
    var off = 12
    while (off < buf.size) {
      val len = buf[off].toInt() and 0xFF
      if (len == 0) { off += 1; break }
      if (len and 0xC0 != 0) return null // compression pointer not expected in a question
      off += 1
      if (off + len > buf.size) return null
      labels.add(String(buf, off, len, Charsets.ISO_8859_1))
      off += len
    }
    if (off + 4 > buf.size) return null
    val qtype = u16(buf, off)
    return Query(id, labels.joinToString("."), qtype, off + 4)
  }

  /** Block response: A 0.0.0.0 / AAAA :: / NXDOMAIN for other types. */
  fun buildSinkhole(q: Query, queryBuf: ByteArray): ByteArray {
    val question = queryBuf.copyOfRange(12, q.questionEnd)
    return when (q.qtype) {
      TYPE_A -> header(q.id, 1, 0) + question + answerRecord(TYPE_A, byteArrayOf(0, 0, 0, 0))
      TYPE_AAAA -> header(q.id, 1, 0) + question + answerRecord(TYPE_AAAA, ByteArray(16))
      else -> header(q.id, 0, 3) + question // NXDOMAIN
    }
  }

  /** CNAME response pointing the queried name at `target` (SafeSearch redirect).
   *  Android's stub resolver does NOT chase a CNAME-only answer, so for A queries
   *  we also append the target's resolved A record(s) — otherwise google/youtube
   *  would return NODATA and appear broken. Falls back to CNAME-only for AAAA or
   *  when the target could not be resolved (client then retries A). */
  fun buildCname(q: Query, queryBuf: ByteArray, target: String, targetV4: List<ByteArray> = emptyList()): ByteArray {
    val question = queryBuf.copyOfRange(12, q.questionEnd)
    val cname = answerRecord(TYPE_CNAME, encodeName(target))
    if (q.qtype != TYPE_A || targetV4.isEmpty()) {
      return header(q.id, 1, 0) + question + cname
    }
    // The A records' owner NAME is the CNAME target, not the queried name.
    val targetName = encodeName(target)
    var body = cname
    for (ip in targetV4) {
      if (ip.size != 4) continue
      body += aRecordForName(targetName, ip)
    }
    val ancount = 1 + targetV4.count { it.size == 4 }
    return header(q.id, ancount, 0) + question + body
  }

  // A record whose NAME is an explicit encoded name (not the 0xC00C pointer).
  private fun aRecordForName(name: ByteArray, ipv4: ByteArray): ByteArray {
    val rec = ByteArray(name.size + 10 + 4)
    System.arraycopy(name, 0, rec, 0, name.size)
    val o = name.size
    put16(rec, o, TYPE_A)
    put16(rec, o + 2, 1) // CLASS IN
    put32(rec, o + 4, 60L) // TTL
    put16(rec, o + 8, 4) // RDLENGTH
    System.arraycopy(ipv4, 0, rec, o + 10, 4)
    return rec
  }

  private fun header(id: Int, ancount: Int, rcode: Int): ByteArray {
    val h = ByteArray(12)
    put16(h, 0, id)
    put16(h, 2, 0x8180 or (rcode and 0x0F)) // QR=1, RD=1, RA=1
    put16(h, 4, 1) // qdcount
    put16(h, 6, ancount)
    return h
  }

  private fun answerRecord(type: Int, rdata: ByteArray, ttl: Int = 60): ByteArray {
    val rec = ByteArray(12 + rdata.size)
    put16(rec, 0, 0xC00C) // NAME → pointer to the question's QNAME (offset 12)
    put16(rec, 2, type)
    put16(rec, 4, 1) // CLASS IN
    put32(rec, 6, ttl.toLong())
    put16(rec, 10, rdata.size)
    System.arraycopy(rdata, 0, rec, 12, rdata.size)
    return rec
  }

  private fun encodeName(name: String): ByteArray {
    val out = ArrayList<Byte>()
    for (part in name.trimEnd('.').split(".").filter { it.isNotEmpty() }) {
      val b = part.toByteArray(Charsets.ISO_8859_1)
      out.add(b.size.toByte())
      for (x in b) out.add(x)
    }
    out.add(0)
    return out.toByteArray()
  }

  // ── IPv4 / UDP framing ────────────────────────────────────────────────

  data class Ipv4Udp(
    val ihl: Int,
    val srcIp: ByteArray,
    val dstIp: ByteArray,
    val srcPort: Int,
    val dstPort: Int,
    val payload: ByteArray, // DNS message
  )

  /** Parse an IPv4/UDP packet from the tun, returning the UDP payload + addressing,
   *  or null if it is not IPv4/UDP or is truncated. */
  fun parseIpv4Udp(pkt: ByteArray, len: Int): Ipv4Udp? {
    if (len < 28) return null // 20 IPv4 + 8 UDP minimum
    val version = (pkt[0].toInt() and 0xF0) ushr 4
    if (version != 4) return null
    val ihl = (pkt[0].toInt() and 0x0F) * 4
    if (ihl < 20 || ihl + 8 > len) return null
    val protocol = pkt[9].toInt() and 0xFF
    if (protocol != 17) return null // UDP
    val srcIp = pkt.copyOfRange(12, 16)
    val dstIp = pkt.copyOfRange(16, 20)
    val srcPort = u16(pkt, ihl)
    val dstPort = u16(pkt, ihl + 2)
    val udpLen = u16(pkt, ihl + 4)
    val dataLen = (udpLen - 8).coerceAtLeast(0)
    val end = (ihl + 8 + dataLen).coerceAtMost(len)
    val payload = pkt.copyOfRange(ihl + 8, end)
    return Ipv4Udp(ihl, srcIp, dstIp, srcPort, dstPort, payload)
  }

  /** Wrap a DNS response payload back into an IPv4/UDP packet addressed to the
   *  original sender (src/dst swapped), with correct IPv4 + UDP checksums. */
  fun buildIpv4UdpResponse(req: Ipv4Udp, dns: ByteArray): ByteArray {
    val udpLen = 8 + dns.size
    val totalLen = 20 + udpLen
    val pkt = ByteArray(totalLen)
    // IPv4 header (no options → IHL 5).
    pkt[0] = 0x45 // version 4, IHL 5
    pkt[1] = 0 // DSCP/ECN
    put16(pkt, 2, totalLen)
    put16(pkt, 4, 0) // id
    put16(pkt, 6, 0x4000) // flags: Don't Fragment
    pkt[8] = 64 // TTL
    pkt[9] = 17 // protocol UDP
    put16(pkt, 10, 0) // checksum placeholder
    // Swap addresses: response goes from the queried server back to the sender.
    System.arraycopy(req.dstIp, 0, pkt, 12, 4)
    System.arraycopy(req.srcIp, 0, pkt, 16, 4)
    put16(pkt, 10, checksum(pkt, 0, 20))
    // UDP header (ports swapped).
    put16(pkt, 20, req.dstPort)
    put16(pkt, 22, req.srcPort)
    put16(pkt, 24, udpLen)
    put16(pkt, 26, 0) // checksum placeholder
    System.arraycopy(dns, 0, pkt, 28, dns.size)
    put16(pkt, 26, udpChecksum(pkt))
    return pkt
  }

  // Internet checksum over pkt[from, from+count).
  private fun checksum(pkt: ByteArray, from: Int, count: Int): Int {
    var sum = 0L
    var i = from
    var remaining = count
    while (remaining > 1) {
      sum += ((pkt[i].toInt() and 0xFF) shl 8) or (pkt[i + 1].toInt() and 0xFF)
      i += 2
      remaining -= 2
    }
    if (remaining > 0) sum += (pkt[i].toInt() and 0xFF) shl 8
    while (sum shr 16 != 0L) sum = (sum and 0xFFFF) + (sum shr 16)
    return (sum.inv() and 0xFFFF).toInt()
  }

  // UDP checksum: pseudo-header (src, dst, zero, proto, udpLen) + UDP header + data.
  private fun udpChecksum(pkt: ByteArray): Int {
    val udpLen = 8 + (pkt.size - 28)
    var sum = 0L
    // Pseudo-header: source & dest IPs (bytes 12..19).
    var i = 12
    while (i < 20) {
      sum += ((pkt[i].toInt() and 0xFF) shl 8) or (pkt[i + 1].toInt() and 0xFF)
      i += 2
    }
    sum += 17L // protocol
    sum += udpLen.toLong()
    // UDP header + data (bytes 20..end), checksum field already 0.
    i = 20
    var remaining = udpLen
    while (remaining > 1) {
      sum += ((pkt[i].toInt() and 0xFF) shl 8) or (pkt[i + 1].toInt() and 0xFF)
      i += 2
      remaining -= 2
    }
    if (remaining > 0) sum += (pkt[i].toInt() and 0xFF) shl 8
    while (sum shr 16 != 0L) sum = (sum and 0xFFFF) + (sum shr 16)
    val c = (sum.inv() and 0xFFFF).toInt()
    // Per RFC 768, a computed checksum of 0 is transmitted as 0xFFFF.
    return if (c == 0) 0xFFFF else c
  }

  private fun u16(b: ByteArray, off: Int) = ((b[off].toInt() and 0xFF) shl 8) or (b[off + 1].toInt() and 0xFF)
  private fun put16(b: ByteArray, off: Int, v: Int) { b[off] = ((v ushr 8) and 0xFF).toByte(); b[off + 1] = (v and 0xFF).toByte() }
  private fun put32(b: ByteArray, off: Int, v: Long) {
    b[off] = ((v ushr 24) and 0xFF).toByte(); b[off + 1] = ((v ushr 16) and 0xFF).toByte()
    b[off + 2] = ((v ushr 8) and 0xFF).toByte(); b[off + 3] = (v and 0xFF).toByte()
  }
}
