import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVideo, extractYouTubeTitle, VideoCollector } from "./videos.js";

test("YouTube titles across browsers", () => {
  assert.deepEqual(extractVideo("Ma vidéo - YouTube - Google Chrome", "chrome"), { title: "Ma vidéo", source: "youtube" });
  assert.deepEqual(extractVideo("(3) Clip cool - YouTube — Mozilla Firefox", "firefox"), { title: "Clip cool", source: "youtube" });
  assert.deepEqual(extractVideo("Doc - YouTube and 3 more pages - Personal - Microsoft​ Edge", "msedge"), { title: "Doc", source: "youtube" });
});

test("other streaming platforms", () => {
  assert.deepEqual(extractVideo("xQc - Twitch - Brave", "brave"), { title: "xQc", source: "twitch" });
  assert.deepEqual(extractVideo("Cool short - Dailymotion - Chrome", "chrome"), { title: "Cool short", source: "dailymotion" });
  assert.deepEqual(extractVideo("My clip on Vimeo", "chrome"), { title: "My clip", source: "vimeo" });
  assert.equal(extractVideo("Stranger Things - Netflix - Chrome", "chrome").source, "netflix");
  assert.equal(extractVideo("The Boys - Prime Video - Chrome", "chrome").source, "primevideo");
});

test("desktop media players", () => {
  assert.deepEqual(extractVideo("film.mkv - VLC media player", "vlc"), { title: "film.mkv", source: "vlc" });
  assert.deepEqual(extractVideo("episode.mp4 - PotPlayer", "potplayer"), { title: "episode.mp4", source: "potplayer" });
  assert.equal(extractVideo("Le Roi Lion", "video.ui").source, "filmstv"); // Films & TV (UWP)
});

test("non-videos and homepages are ignored", () => {
  assert.equal(extractVideo("YouTube - Google Chrome", "chrome"), null); // homepage, no video
  assert.equal(extractVideo("Inbox (5) - Gmail - Chrome", "chrome"), null);
  assert.equal(extractVideo("README.md - Visual Studio Code", "code"), null);
  assert.equal(extractVideo("Films & TV", "video.ui"), null); // player home, no media
});

test("back-compat extractYouTubeTitle", () => {
  assert.equal(extractYouTubeTitle("Une vidéo - YouTube - Google Chrome"), "Une vidéo");
  assert.equal(extractYouTubeTitle("xQc - Twitch - Chrome"), null); // not YouTube
});

test("collector dedupes within cooldown, re-reports after it, keys by source+title", () => {
  const c = new VideoCollector();
  const s = (title, name = "chrome") => ({ fg: { name, title } });
  let t = 1_000_000;

  assert.ok(c.observe(s("Clip A - YouTube - Chrome"), t)); // new
  assert.equal(c.observe(s("Clip A - YouTube - Chrome"), t + 1000), null); // same video, still fg
  // switch away then back within cooldown → still suppressed
  assert.ok(c.observe(s("Clip B - YouTube - Chrome"), t + 2000));
  assert.equal(c.observe(s("Clip A - YouTube - Chrome"), t + 3000), null);

  const drained = c.drain();
  assert.deepEqual(drained.map((v) => v.title), ["Clip A", "Clip B"]);
  assert.equal(c.drain().length, 0);

  // after the cooldown, the same video reports again — once the foreground has
  // changed in between (a video sitting in the foreground the whole time is not
  // re-reported; only a genuine re-watch is).
  assert.ok(c.observe(s("Clip B - YouTube - Chrome"), t + 11 * 60 * 1000)); // switch away (cooldown elapsed)
  assert.ok(c.observe(s("Clip A - YouTube - Chrome"), t + 11 * 60 * 1000)); // back to A → re-reported

  // same title on a DIFFERENT platform is a distinct video
  const c2 = new VideoCollector();
  assert.ok(c2.observe(s("Match - YouTube - Chrome"), t));
  assert.ok(c2.observe(s("Match - Twitch - Chrome"), t + 1000));
  assert.equal(c2.drain().length, 2);
});
