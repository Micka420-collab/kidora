// Agent configuration persistence (token, server, identifiers).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { configPath } from "./paths.js";

// Writable data location (%ProgramData%\Kidora on Windows; see lib/paths.js).
const CONFIG_PATH = configPath();

export function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

export function saveConfig(cfg) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

/** Merge CLI args (--token X --server Y) into the stored config. */
export function resolveConfig(argv) {
  const cfg = loadConfig();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--token") cfg.enrollToken = argv[++i];
    else if (argv[i] === "--server") cfg.server = argv[++i];
    else if (argv[i] === "--interval") cfg.syncInterval = Number(argv[++i]);
  }
  cfg.server = cfg.server || process.env.KIDORA_SERVER || "http://localhost:3000";
  cfg.syncInterval = cfg.syncInterval || 30;
  return cfg;
}

export { CONFIG_PATH };
