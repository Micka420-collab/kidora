// Detect watched videos from the foreground window title, across the common
// streaming platforms (in a browser) and desktop media players. A browser tab
// title looks like "Video title - YouTube - Google Chrome" (Chrome),
// "… - YouTube and 3 more pages - … Microsoft Edge", or
// "… — YouTube — Mozilla Firefox"; the media title is the part before the
// platform marker. A desktop player title looks like "movie.mkv - VLC media
// player"; the media title is the part before the player marker.

const BROWSERS = new Set(["chrome", "firefox", "msedge", "opera", "brave", "vivaldi", "iexplore"]);
// Desktop media players → process name (lowercased, no extension). Films & TV is
// the UWP "Video.UI"; the sensor resolves it out of ApplicationFrameHost.
const PLAYERS = new Set(["vlc", "mpc-hc", "mpc-hc64", "mpc-be", "potplayer", "potplayermini64", "wmplayer", "smplayer", "video.ui", "mpv", "kmplayer"]);

// Ordered so the most specific markers win. Each entry pulls the media title from
// the part of the window title BEFORE the marker (or a custom capture).
const WEB_PLATFORMS = [
  { source: "youtube", re: /\s[-—–|]\s*YouTube\b/i },
  { source: "twitch", re: /\s[-—–|]\s*Twitch\b/i },
  { source: "dailymotion", re: /\s[-—–|]\s*Dailymotion\b/i },
  { source: "vimeo", re: /\bon Vimeo\b/i },
  { source: "crunchyroll", re: /\s[-—–|]\s*Crunchyroll\b/i },
  { source: "netflix", re: /\s[-—–|]\s*Netflix\b/i },
  { source: "primevideo", re: /\s[-—–|]\s*Prime Video\b/i },
  { source: "disneyplus", re: /\s[-—–|]\s*Disney\+?\b/i },
];
// A player marker → its display source. The media title is everything before it.
const PLAYER_MARKERS = [
  { source: "vlc", re: /\s[-—–]\s*VLC media player\b/i },
  { source: "potplayer", re: /\s[-—–]\s*PotPlayer\b/i },
  { source: "mpc", re: /\s[-—–]\s*MPC-(HC|BE)\b/i },
  { source: "wmplayer", re: /\s[-—–]\s*Windows Media Player\b/i },
  { source: "mpv", re: /\s[-—–]\s*mpv\b/i },
];

const REPORT_COOLDOWN_MS = 10 * 60 * 1000; // don't re-report the same video within 10 min

function clean(t) {
  return t.replace(/^\(\d+\)\s*/, "").trim().slice(0, 280); // strip "(3) " unread/playing counter
}

/**
 * Extract { title, source } for a watched video from a window title, or null.
 * `procName` is the foreground process name (lowercased, no extension) — used to
 * recognise a desktop media player and to pick the browser vs player path.
 */
export function extractVideo(windowTitle, procName = "") {
  if (!windowTitle) return null;
  const name = (procName || "").toLowerCase();

  // ── Browser: match a streaming-platform marker ──
  if (BROWSERS.has(name) || !name /* tolerate unknown process, still title-based */) {
    for (const p of WEB_PLATFORMS) {
      const idx = windowTitle.search(p.re);
      if (idx === -1) continue;
      const title = clean(windowTitle.slice(0, idx));
      // Skip a bare platform homepage ("YouTube - Google Chrome" → no video title).
      if (!title || new RegExp(`^${p.source}$`, "i").test(title)) return null;
      return { title, source: p.source };
    }
  }

  // ── Desktop media player: everything before the player marker is the media ──
  if (PLAYERS.has(name)) {
    for (const p of PLAYER_MARKERS) {
      const idx = windowTitle.search(p.re);
      if (idx === -1) continue;
      const title = clean(windowTitle.slice(0, idx));
      if (title) return { title, source: p.source };
    }
    // Films & TV (Video.UI) has no " - Player" suffix; the whole title is the media.
    if (name === "video.ui") {
      const title = clean(windowTitle);
      if (title && !/^films?\s*(&|et)\s*tv$/i.test(title)) return { title, source: "filmstv" };
    }
  }
  return null;
}

/** Back-compat: YouTube-only title extractor (kept for existing callers/tests). */
export function extractYouTubeTitle(windowTitle) {
  const v = extractVideo(windowTitle, "chrome");
  return v && v.source === "youtube" ? v.title : null;
}

/** Collects distinct watched videos seen in the foreground; drained on sync. */
export class VideoCollector {
  constructor() {
    this.buffer = [];
    this.lastKey = null;
    this.seen = new Map(); // "source|title" -> last reported ts
  }

  /**
   * Feed a sensor sample. Returns the freshly-detected video item (already
   * buffered) so the caller can enrich it in place (e.g. set `.url` after an
   * async lookup), or null if nothing new.
   */
  observe(sample, now = Date.now()) {
    const name = (sample?.fg?.name || "").toLowerCase();
    const title = sample?.fg?.title || "";
    const v = extractVideo(title, name);
    if (!v) { this.lastKey = null; return null; }
    const key = `${v.source}|${v.title}`;
    if (key === this.lastKey) return null; // same video still in foreground
    this.lastKey = key;
    if (this.seen.has(key) && now - this.seen.get(key) < REPORT_COOLDOWN_MS) return null;
    this.seen.set(key, now);
    const item = { title: v.title, source: v.source, platform: "pc", ts: new Date(now).toISOString() };
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
