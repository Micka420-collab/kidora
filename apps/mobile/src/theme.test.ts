import { formatDuration, relativeTime, youtubeThumb, categoryMeta } from "./theme";

describe("formatDuration", () => {
  it("handles zero and negatives", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(-5)).toBe("0 min");
  });
  it("formats minutes", () => {
    expect(formatDuration(90)).toBe("2 min"); // rounds to nearest minute
    expect(formatDuration(59)).toBe("1 min");
  });
  it("formats hours and h+min", () => {
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3600 + 15 * 60)).toBe("1 h 15");
  });
  it("rounds without producing '1 h 60'", () => {
    // 1h59m30s → rounds to 120 min → "2 h", never "1 h 60"
    expect(formatDuration(3600 + 59 * 60 + 30)).toBe("2 h");
  });
});

describe("relativeTime", () => {
  it("returns em dash for null", () => {
    expect(relativeTime(null)).toBe("—");
  });
  it("buckets by age", () => {
    const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    expect(relativeTime(ago(10))).toBe("à l'instant");
    expect(relativeTime(ago(120))).toBe("il y a 2 min");
    expect(relativeTime(ago(2 * 3600))).toBe("il y a 2 h");
    expect(relativeTime(ago(3 * 86400))).toBe("il y a 3 j");
  });
});

describe("youtubeThumb", () => {
  it("extracts the 11-char id from common URL shapes", () => {
    const expected = "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg";
    expect(youtubeThumb("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(expected);
    expect(youtubeThumb("https://youtu.be/dQw4w9WgXcQ")).toBe(expected);
    expect(youtubeThumb("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(expected);
  });
  it("returns null for non-YouTube or missing url", () => {
    expect(youtubeThumb("https://example.com")).toBeNull();
    expect(youtubeThumb(null)).toBeNull();
    expect(youtubeThumb(undefined)).toBeNull();
  });
});

describe("categoryMeta", () => {
  it("maps a known category", () => {
    expect(categoryMeta("games")).toMatchObject({ label: "Jeux", icon: "game-controller" });
  });
  it("falls back for unknown/empty", () => {
    expect(categoryMeta("nope")).toMatchObject({ label: "nope", icon: "apps" });
    expect(categoryMeta(null)).toMatchObject({ label: "Autre" });
  });
});
