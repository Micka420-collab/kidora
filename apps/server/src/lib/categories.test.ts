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

  it("flags adult/gambling via signals", () => {
    expect(categorizeDomain("pornhub.com")).toBe("adult");
    expect(categorizeDomain("some-xxx-site.net")).toBe("adult");
    expect(categorizeDomain("megacasino-bet.io")).toBe("gambling");
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

  it("falls back to unknown", () => {
    expect(categorizeApp("weirdapp.exe")).toBe("unknown");
  });
});
