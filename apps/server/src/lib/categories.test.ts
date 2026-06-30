import { describe, it, expect } from "vitest";
import {
  categorizeDomain,
  categorizeApp,
  normalizeDomain,
  registrableDomain,
} from "./categories";

describe("normalizeDomain", () => {
  it("strips protocol, www, path and port", () => {
    expect(normalizeDomain("https://www.YouTube.com/watch?v=1")).toBe("youtube.com");
    expect(normalizeDomain("http://Example.COM:8080/x")).toBe("example.com");
  });
});

describe("registrableDomain", () => {
  it("keeps the last two labels", () => {
    expect(registrableDomain("m.youtube.com")).toBe("youtube.com");
    expect(registrableDomain("foo.bar.example.org")).toBe("example.org");
    expect(registrableDomain("a.b.c.example.org")).toBe("example.org");
    expect(registrableDomain("example.com")).toBe("example.com");
  });
});

describe("categorizeDomain", () => {
  it("classifies known domains", () => {
    expect(categorizeDomain("instagram.com")).toBe("social");
    expect(categorizeDomain("youtube.com")).toBe("video");
    expect(categorizeDomain("roblox.com")).toBe("games");
    expect(categorizeDomain("khanacademy.org")).toBe("education");
  });

  it("resolves subdomains via registrable domain", () => {
    expect(categorizeDomain("m.youtube.com")).toBe("video");
  });

  it("matches an exact multi-label known host", () => {
    expect(categorizeDomain("mail.google.com")).toBe("communication");
  });

  it("flags adult/gambling via signals", () => {
    expect(categorizeDomain("pornhub.com")).toBe("adult");
    expect(categorizeDomain("some-xxx-site.net")).toBe("adult");
    expect(categorizeDomain("megacasino-bet.io")).toBe("gambling");
  });

  it("matches 'sex' on a word boundary (true positives kept)", () => {
    expect(categorizeDomain("sex.com")).toBe("adult");
    expect(categorizeDomain("sexcam.net")).toBe("adult");
    expect(categorizeDomain("sex-tube.net")).toBe("adult");
  });

  it("does NOT mis-flag legitimate names containing 'sex'", () => {
    // Regression: 'sex' as a bare substring used to flag these as adult.
    expect(categorizeDomain("essex.com")).toBe("unknown");
    expect(categorizeDomain("sussex.ac.uk")).toBe("unknown");
    expect(categorizeDomain("middlesex.gov.uk")).toBe("unknown");
  });

  it("returns unknown for unrecognized domains", () => {
    expect(categorizeDomain("my-random-blog.dev")).toBe("unknown");
  });
});

describe("categorizeApp", () => {
  it("classifies common processes", () => {
    expect(categorizeApp("chrome.exe")).toBe("browser");
    expect(categorizeApp("steam.exe", "Steam")).toBe("games");
    expect(categorizeApp("discord.exe")).toBe("communication");
    expect(categorizeApp("explorer.exe")).toBe("system");
  });

  it("classifies more categories", () => {
    expect(categorizeApp("Spotify.exe")).toBe("music");
    expect(categorizeApp("vlc.exe")).toBe("streaming");
    expect(categorizeApp("tiktok.exe", "TikTok")).toBe("social");
    expect(categorizeApp("WINWORD.EXE", "Microsoft Word")).toBe("productivity");
    expect(categorizeApp("Code.exe", "Visual Studio Code")).toBe("developer");
    expect(categorizeApp("Teams.exe")).toBe("communication");
  });

  it("is case-insensitive and can match on the app name", () => {
    expect(categorizeApp("SPOTIFY.EXE")).toBe("music");
    expect(categorizeApp("app42.exe", "Spotify")).toBe("music");
  });

  it("respects rule precedence (browser before games)", () => {
    // appName mentions a game, but the browser rule matches first.
    expect(categorizeApp("chrome.exe", "Some Game")).toBe("browser");
  });

  it("falls back to unknown", () => {
    expect(categorizeApp("weirdapp.exe")).toBe("unknown");
  });
});
