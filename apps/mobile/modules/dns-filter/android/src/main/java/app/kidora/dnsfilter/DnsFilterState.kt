package app.kidora.dnsfilter

// Process-wide flag so the JS bridge (DnsFilterModule.isRunning) can report the
// VpnService state without binding to it. Set by DnsVpnService on start/stop.
object DnsFilterState {
  @Volatile
  var running: Boolean = false
}
