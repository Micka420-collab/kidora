package app.kidora.dnsfilter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress

// On-device DNS-filtering VPN. A tiny tun that captures ONLY DNS traffic (we route
// just the dummy resolver's /32), inspects each query, and — mirroring the desktop
// agent's DNS proxy — blocks by category/blocklist (sinkhole), redirects search
// engines to their SafeSearch hosts (CNAME), or forwards allowed queries to a real
// upstream through a protected socket. It never touches non-DNS traffic.
//
// LIMITATION: like any DNS filter, an app that ships its own DoH/DoT resolver or a
// hardcoded IP can bypass it. This matches what the desktop agent does with system
// DNS and what consumer parental-control apps achieve on stock (non-MDM) Android.
class DnsVpnService : VpnService() {

  @Volatile private var running = false
  private var vpn: ParcelFileDescriptor? = null
  private var worker: Thread? = null
  private var upstreamSocket: DatagramSocket? = null
  private val safeSearchCache = java.util.concurrent.ConcurrentHashMap<String, List<ByteArray>>()

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelfCleanly()
      return START_NOT_STICKY
    }
    // MUST call startForeground() within ~5s of every startForegroundService(),
    // even when already running (a second start() from JS would otherwise crash
    // with "did not call Service.startForeground()"). It is idempotent.
    startForegroundNotice()
    if (running) return START_STICKY
    return if (establish()) START_STICKY else { stopSelfCleanly(); START_NOT_STICKY }
  }

  private fun establish(): Boolean {
    return try {
      val builder = Builder()
        .setSession("Kidora")
        .addAddress(VPN_ADDR, 32)
        .addDnsServer(DNS_ADDR)
        // Route ONLY the dummy resolver → we intercept DNS, nothing else.
        .addRoute(DNS_ADDR, 32)
        .setBlocking(true)
        .setMtu(4096) // headroom for EDNS/DNSSEC responses > 1500 bytes
      // Don't filter our own traffic (sync/telemetry must keep working).
      try { builder.addDisallowedApplication(packageName) } catch (_: Exception) {}
      val pfd = builder.establish() ?: return false
      vpn = pfd

      val sock = DatagramSocket()
      protect(sock) // upstream forwarding must not loop back through the VPN
      sock.soTimeout = UPSTREAM_TIMEOUT_MS
      upstreamSocket = sock

      running = true
      DnsFilterState.running = true
      worker = Thread({ pump(pfd) }, "kidora-dns-vpn").apply { isDaemon = true; start() }
      true
    } catch (e: Exception) {
      false
    }
  }

  private fun pump(pfd: ParcelFileDescriptor) {
    val input = FileInputStream(pfd.fileDescriptor)
    val output = FileOutputStream(pfd.fileDescriptor)
    val buf = ByteArray(32767)
    val upstream = InetAddress.getByName(UPSTREAM_DNS)
    while (running) {
      val n = try { input.read(buf) } catch (e: Exception) { break }
      if (n < 0) break // tun closed (e.g. VPN revoked) → stop, don't busy-spin
      if (n == 0) continue
      val parsed = try { DnsCodec.parseIpv4Udp(buf, n) } catch (e: Exception) { null } ?: continue
      if (parsed.dstPort != 53) continue // only DNS is routed here, but be defensive
      handleQuery(parsed, upstream, output)
    }
  }

  private fun handleQuery(req: DnsCodec.Ipv4Udp, upstream: InetAddress, output: FileOutputStream) {
    val q = try { DnsCodec.parseQuery(req.payload) } catch (e: Exception) { null }
    val policy = PolicyStore.current(this)
    if (q == null) { forward(req, upstream, output); return }

    when (val decision = DomainRules.decide(q.qname, policy)) {
      is DomainRules.Decision.Block -> {
        writeBack(output, req, DnsCodec.buildSinkhole(q, req.payload))
      }
      is DomainRules.Decision.SafeSearch -> {
        // Include the target's A record(s): Android's stub resolver won't chase a
        // CNAME-only answer, so without this google/youtube would look broken.
        val a = if (q.qtype == 1) resolveA(decision.target) else emptyList()
        writeBack(output, req, DnsCodec.buildCname(q, req.payload, decision.target, a))
      }
      is DomainRules.Decision.Allow -> forward(req, upstream, output)
    }
  }

  // Resolve the SafeSearch target to its IPv4 address(es). This runs in OUR app
  // process, which is excluded from the VPN, so it uses the real network DNS.
  // Cached (the handful of SafeSearch hosts are stable).
  private fun resolveA(host: String): List<ByteArray> {
    safeSearchCache[host]?.let { return it }
    return try {
      val ips = InetAddress.getAllByName(host).mapNotNull { if (it.address.size == 4) it.address else null }
      if (ips.isNotEmpty()) safeSearchCache[host] = ips
      ips
    } catch (e: Exception) {
      emptyList()
    }
  }

  // Forward the raw DNS payload to a real resolver and relay its reply back into
  // the tun. Synchronous per query with a short timeout — DNS is tiny and this
  // keeps the loop simple and race-free for one device's query volume.
  private fun forward(req: DnsCodec.Ipv4Udp, upstream: InetAddress, output: FileOutputStream) {
    val sock = upstreamSocket ?: return
    if (req.payload.size < 2) return
    val txid = ((req.payload[0].toInt() and 0xFF) shl 8) or (req.payload[1].toInt() and 0xFF)
    try {
      sock.send(DatagramPacket(req.payload, req.payload.size, InetSocketAddress(upstream, 53)))
      // One shared upstream socket serves all queries, so a late reply from a
      // PRIOR query may still be buffered. Match on the transaction id and drop
      // stale datagrams, bounded by a deadline, so we never relay a reply with
      // the wrong id (which the client would reject, cascading the mismatch).
      val reply = ByteArray(32767)
      val deadline = System.currentTimeMillis() + UPSTREAM_TIMEOUT_MS
      while (true) {
        val remaining = (deadline - System.currentTimeMillis()).toInt()
        if (remaining <= 0) return
        sock.soTimeout = remaining
        val dp = DatagramPacket(reply, reply.size)
        sock.receive(dp)
        if (dp.length >= 2 && (((reply[0].toInt() and 0xFF) shl 8) or (reply[1].toInt() and 0xFF)) == txid) {
          writeBack(output, req, reply.copyOf(dp.length))
          return
        }
        // else: a stale/mismatched reply → discard and keep waiting.
      }
    } catch (e: Exception) {
      // Upstream timeout / error → let the client retry; do nothing (fail-open,
      // so a resolver hiccup never bricks the child's connectivity).
    }
  }

  private fun writeBack(output: FileOutputStream, req: DnsCodec.Ipv4Udp, dns: ByteArray) {
    try {
      output.write(DnsCodec.buildIpv4UdpResponse(req, dns))
    } catch (e: Exception) { /* tun closed mid-write → loop will exit */ }
  }

  private fun startForegroundNotice() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(CHANNEL_ID, getString(R.string.kidora_dns_filter_channel), NotificationManager.IMPORTANCE_LOW)
      ch.setShowBadge(false)
      nm.createNotificationChannel(ch)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pi = if (launch != null) {
      PendingIntent.getActivity(this, 0, launch, pendingFlags())
    } else null
    val notif: Notification = notifBuilder()
      .setContentTitle(getString(R.string.kidora_dns_filter_active))
      .setContentText(getString(R.string.kidora_dns_filter_desc))
      .setSmallIcon(android.R.drawable.ic_lock_lock)
      .setOngoing(true)
      .apply { if (pi != null) setContentIntent(pi) }
      .build()
    // The specialUse FGS type is an API-34 constant; only pass it there. On 29–33
    // the manifest's foregroundServiceType covers the typed-FGS requirement.
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notif)
    }
  }

  @Suppress("DEPRECATION")
  private fun notifBuilder(): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
    else Notification.Builder(this)

  private fun pendingFlags(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  private fun stopSelfCleanly() {
    running = false
    DnsFilterState.running = false
    worker?.interrupt()
    try { upstreamSocket?.close() } catch (_: Exception) {}
    upstreamSocket = null
    try { vpn?.close() } catch (_: Exception) {}
    vpn = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    stopSelfCleanly()
    super.onDestroy()
  }

  companion object {
    const val ACTION_STOP = "app.kidora.dnsfilter.STOP"
    private const val CHANNEL_ID = "kidora_dns_filter"
    private const val NOTIF_ID = 4711
    private const val VPN_ADDR = "10.111.222.2"
    private const val DNS_ADDR = "10.111.222.1" // dummy resolver the OS points at → captured
    private const val UPSTREAM_DNS = "1.1.1.1"
    private const val UPSTREAM_TIMEOUT_MS = 2500 // keep the (serialized) DNS path snappy
  }
}
