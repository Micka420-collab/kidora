// Lightweight local app categorizer (mirrors a subset of the server engine)
// so usage rows carry a category for nicer reports.
const RULES = [
  [/chrome|firefox|msedge|opera|brave/i, "browser"],
  [/steam|epicgames|roblox|minecraft|leagueclient|valorant|fortnite|origin|battlenet|riotclient/i, "games"],
  [/discord|whatsapp|telegram|signal|messenger|skype|zoom|teams/i, "communication"],
  [/spotify|deezer|itunes|musicbee/i, "music"],
  [/vlc|netflix|wmplayer|potplayer/i, "streaming"],
  [/tiktok|instagram|snapchat|facebook|twitter/i, "social"],
  [/winword|excel|powerpnt|onenote|outlook|acrobat|notion|obsidian/i, "productivity"],
  [/code|devenv|pycharm|idea|sublime|node|python|git/i, "developer"],
  [/explorer|svchost|taskmgr|cmd|powershell|systemsettings|dwm|winlogon|searchhost|textinputhost/i, "system"],
];

export function categorize(name) {
  const n = (name || "").toLowerCase();
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return "unknown";
}

// Processes we never kill or count as "screen time" (OS noise).
export const SYSTEM_PROCS = new Set([
  "explorer", "svchost", "taskmgr", "dwm", "winlogon", "csrss", "services",
  "lsass", "smss", "wininit", "fontdrvhost", "searchhost", "textinputhost",
  "shellexperiencehost", "startmenuexperiencehost", "runtimebroker",
  "applicationframehost", "sihost", "ctfmon", "conhost", "powershell",
  "system", "registry", "idle", "audiodg", "spoolsv",
]);
