// Detect watched YouTube videos from the foreground browser window title.
// A YouTube tab title looks like "Video title - YouTube - Google Chrome"
// (Chrome), "… - YouTube and 3 more pages - … Microsoft Edge", or
// "… — YouTube — Mozilla Firefox". The video title is the part before "YouTube".

const BROWSERS = new Set(["chrome", "firefox", "msedge", "opera", "brave", "vivaldi", "iexplore"]);
const REPORT_COOLDOWN_MS = 10 * 60 * 1000; // don't re-report the same video within 10 min

/** Extract the video title from a window title, or null if it isn't a YouTube video. */
export function extractYouTubeTitle(windowTitle) {
  if (!windowTitle || !/youtube/i.test(windowTitle)) return null;
  const idx = windowTitle.search(/\s[-—–]\s*YouTube/i);
  if (idx === -1) return null;
  let t = windowTitle.slice(0, idx).trim();
  t = t.replace(/^\(\d+\)\s*/, ""); // strip "(3) " unread/playing counter
  if (!t || /^youtube$/i.test(t)) return null; // homepage / no video
  return t.slice(0, 280);
}

/** Collects distinct watched videos seen in the foreground; drained on sync. */
export class VideoCollector {
  constructor() {
    this.buffer = [];
    this.lastTitle = null;
    this.seen = new Map(); // title -> last reported ts
  }

  /**
   * Feed a sensor sample. Returns the freshly-detected video item (already
   * buffered) so the caller can enrich it in place (e.g. set `.url` after an
   * async lookup), or null if nothing new.
   */
  observe(sample, now = Date.now()) {
    const name = (sample?.fg?.name || "").toLowerCase();
    const title = sample?.fg?.title || "";
    if (!BROWSERS.has(name)) { this.lastTitle = null; return null; }
    const vt = extractYouTubeTitle(title);
    if (!vt) { this.lastTitle = null; return null; }
    if (vt === this.lastTitle) return null; // same video still in foreground
    this.lastTitle = vt;
    if (this.seen.has(vt) && now - this.seen.get(vt) < REPORT_COOLDOWN_MS) return null;
    this.seen.set(vt, now);
    const item = { title: vt, source: "youtube", platform: "pc", ts: new Date(now).toISOString() };
    this.buffer.push(item);
    if (this.buffer.length > 100) this.buffer.shift();
    return item;
  }

  drain() {
    const b = this.buffer;
    this.buffer = [];
    return b;
  }

  /** Re-queue drained videos after a failed sync (capped like the live buffer). */
  restore(items) {
    if (items?.length) this.buffer = [...items, ...this.buffer].slice(0, 100);
  }
}
