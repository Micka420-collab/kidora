import Constants from "expo-constants";
import * as storage from "./storage";

const DEFAULT_SERVER =
  (Constants.expoConfig?.extra?.defaultServer as string) || "http://localhost:3000";

export async function getServer(): Promise<string> {
  return (await storage.get("server")) || DEFAULT_SERVER;
}

async function req<T>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const server = await getServer();
  const res = await fetch(`${server}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

// ── Parent companion (token sent as session cookie header) ──
export const parent = {
  async login(email: string, password: string, server?: string) {
    if (server) await storage.set("server", server.replace(/\/$/, ""));
    const res = await req<{ id: string; name: string; token: string }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    await storage.set("parentToken", res.token);
    await storage.set("parentName", res.name);
    await storage.set("role", "parent");
    return res;
  },
  async authHeader(): Promise<Record<string, string>> {
    const token = await storage.get("parentToken");
    return token ? { Cookie: `kidora_session=${token}` } : {};
  },
  async children() {
    return req<{ children: Child[] }>("/api/children", { headers: await this.authHeader() });
  },
  async child(id: string) {
    return req<{ child: ChildDetail; screenTimeToday?: ScreenTimeToday }>(`/api/children/${id}`, { headers: await this.authHeader() });
  },
  async live(id: string) {
    return req<Live>(`/api/children/${id}/live`, { headers: await this.authHeader() });
  },
  async report(id: string, days = 7) {
    return req<Report>(`/api/children/${id}/report?days=${days}`, { headers: await this.authHeader() });
  },
  async videos(id: string) {
    return req<{ videos: Video[] }>(`/api/children/${id}/videos`, { headers: await this.authHeader() });
  },
  async messages(id: string) {
    return req<{ messages: Message[] }>(`/api/children/${id}/messages`, { headers: await this.authHeader() });
  },
  async alerts() {
    return req<{ alerts: Alert[]; unread: number }>("/api/alerts", { headers: await this.authHeader() });
  },
  async markAlertsRead() {
    return req<{ ok: true }>("/api/alerts", { method: "PATCH", body: { all: true }, headers: await this.authHeader() });
  },
  // ── Remote actions ──
  async pause(id: string, paused: boolean) {
    return req<{ paused: boolean }>(`/api/children/${id}/pause`, { method: "POST", body: { paused }, headers: await this.authHeader() });
  },
  async familyPause(paused: boolean) {
    return req<{ paused: boolean; count: number }>("/api/family/pause", { method: "POST", body: { paused }, headers: await this.authHeader() });
  },
  async command(id: string, type: CommandType, payload?: Record<string, unknown>) {
    return req<{ ok: true }>(`/api/children/${id}/commands`, { method: "POST", body: { type, payload }, headers: await this.authHeader() });
  },
  async grantTime(id: string, minutes: number) {
    return req<{ ok: true; granted: number }>(`/api/children/${id}/time-requests`, { method: "POST", body: { minutes }, headers: await this.authHeader() });
  },
  async logout() {
    await storage.clearAll();
  },
};

// ── Child device agent (uses enroll token, Bearer auth) ──
export const childAgent = {
  async enroll(enrollToken: string, server: string, deviceInfo: object) {
    await storage.set("server", server.replace(/\/$/, ""));
    const res = await req<{ deviceId: string; childName: string; policy: Policy }>(
      "/api/agent/enroll",
      { method: "POST", body: { enrollToken, deviceInfo } },
    );
    await storage.set("enrollToken", enrollToken);
    await storage.set("role", "child");
    return res;
  },
  async sync(payload: object) {
    const token = await storage.get("enrollToken");
    if (!token) throw new Error("Appareil non enrôlé");
    return req<{ policy: Policy; commands: Command[] }>("/api/agent/sync", {
      method: "POST",
      body: payload,
      headers: { Authorization: `Bearer ${token}` },
    });
  },
};

// ── Types ──
export type Device = { id: string; name: string; platform: string; online: boolean; battery: number | null; lastSeen: string | null };
export type ScreenTimeCfg = { enabled: boolean; dailyLimits: Record<string, number> } | null;
export type Child = {
  id: string;
  name: string;
  avatar: string | null;
  paused?: boolean;
  devices: Device[];
  screenTime?: ScreenTimeCfg;
  _count?: { alerts: number };
};
export type ChildDetail = Child & { webFilter: unknown };
export type ScreenTimeToday = { enabled: boolean; limitMinutes: number; bonusMinutes: number; totalMinutes: number };
export type Live = {
  online: boolean;
  paused: boolean;
  lastSeen: string | null;
  battery: number | null;
  deviceName: string | null;
  currentApp: { title: string; device: string; ts: string } | null;
  location: { lat: number; lng: number; address: string | null; ts: string } | null;
};
export type Report = {
  days: number;
  totalSeconds: number;
  avgPerDaySeconds: number;
  trend: { date: string; seconds: number }[];
  topApps: { appName: string; category: string | null; seconds: number }[];
  byCategory: { category: string; seconds: number }[];
  web: { totalVisits: number; blockedVisits: number };
  alerts: { total: number };
};
export type Video = { id: string; title: string; channel: string | null; url: string | null; source: string; platform: string; ts: string };
export type Message = { id: string; app: string; direction: "in" | "out"; contact: string | null; body: string; ts: string };
export type Alert = { id: string; childId: string; type: string; message: string; ts: string; read: boolean; child: { name: string; avatar: string | null } };
export type CommandType = "lock" | "unlock" | "message" | "locate" | "screenshot";
export type Policy = {
  paused: boolean;
  blockedDomains: string[];
  appRules: unknown[];
  screenTime?: {
    enabled: boolean;
    dailyLimits: Record<string, number>;
    bonusMinutesToday?: number;
    bedtimes?: { days: string[]; start: string; end: string }[];
  };
};
export type Command = { id: string; type: string; payload: Record<string, unknown> };
