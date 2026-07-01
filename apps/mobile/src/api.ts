import Constants from "expo-constants";
import * as storage from "./storage";

const DEFAULT_SERVER =
  (Constants.expoConfig?.extra?.defaultServer as string) || "http://localhost:3000";

export async function getServer(): Promise<string> {
  return (await storage.get("server")) || DEFAULT_SERVER;
}

/** Error carrying the HTTP status + parsed body so callers can tell a real 401
 *  from a 5xx/network blip and inspect flags like `twoFactor`. */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
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
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Erreur ${res.status}`, res.status, data);
  return data as T;
}

// ── Parent companion (token sent as session cookie header) ──
export const parent = {
  async login(email: string, password: string, server?: string, code?: string) {
    if (server) await storage.set("server", server.replace(/\/$/, ""));
    const res = await req<{ id: string; name: string; token: string }>("/api/auth/login", {
      method: "POST",
      body: { email, password, ...(code ? { code } : {}) },
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
  async screenshots(id: string, limit = 12) {
    return req<{ screenshots: Screenshot[] }>(`/api/children/${id}/screenshots?limit=${limit}`, { headers: await this.authHeader() });
  },
  async webVisits(id: string, take = 100) {
    return req<{ visits: WebVisit[] }>(`/api/children/${id}/web-visits?take=${take}`, { headers: await this.authHeader() });
  },
  async location(id: string, limit = 50) {
    return req<{ pings: LocationPing[]; latest: LocationPing | null; geofences: Geofence[] }>(`/api/children/${id}/location?limit=${limit}`, { headers: await this.authHeader() });
  },
  async addGeofence(id: string, data: { name: string; lat: number; lng: number; radius?: number }) {
    return req<{ geofence: Geofence }>(`/api/children/${id}/geofences`, { method: "POST", body: data, headers: await this.authHeader() });
  },
  async deleteGeofence(id: string, geofenceId: string) {
    return req<{ ok: true }>(`/api/children/${id}/geofences?id=${encodeURIComponent(geofenceId)}`, { method: "DELETE", headers: await this.authHeader() });
  },
  async activity(id: string, limit = 150) {
    return req<{ events: ActivityEvent[] }>(`/api/children/${id}/activity?limit=${limit}`, { headers: await this.authHeader() });
  },
  async routines(id: string) {
    return req<{ routines: RoutineRaw[] }>(`/api/children/${id}/routines`, { headers: await this.authHeader() });
  },
  async saveRoutine(id: string, routine: { id?: string; name: string; enabled?: boolean; days: string[]; start: string; end: string; blockedAppIds: string[] }) {
    return req<{ routine: RoutineRaw }>(`/api/children/${id}/routines`, { method: "POST", body: routine, headers: await this.authHeader() });
  },
  async deleteRoutine(id: string, routineId: string) {
    return req<{ ok: true }>(`/api/children/${id}/routines?id=${encodeURIComponent(routineId)}`, { method: "DELETE", headers: await this.authHeader() });
  },
  async keywords(id: string) {
    return req<{ keywords: WatchedKeyword[] }>(`/api/children/${id}/keywords`, { headers: await this.authHeader() });
  },
  async addKeyword(id: string, term: string) {
    return req<{ keyword: WatchedKeyword }>(`/api/children/${id}/keywords`, { method: "POST", body: { term }, headers: await this.authHeader() });
  },
  async deleteKeyword(id: string, keywordId: string) {
    return req<{ ok: true }>(`/api/children/${id}/keywords?id=${encodeURIComponent(keywordId)}`, { method: "DELETE", headers: await this.authHeader() });
  },
  async appRules(id: string) {
    return req<{ rules: AppRule[]; usageToday?: Record<string, number> }>(`/api/children/${id}/rules/apps`, { headers: await this.authHeader() });
  },
  async setAppRule(id: string, data: { appId: string; appName: string; action: AppAction; dailyLimitMinutes?: number | null }) {
    return req<{ rule: AppRule }>(`/api/children/${id}/rules/apps`, { method: "PUT", body: data, headers: await this.authHeader() });
  },
  async deleteAppRule(id: string, appId: string) {
    return req<{ ok: true }>(`/api/children/${id}/rules/apps?appId=${encodeURIComponent(appId)}`, { method: "DELETE", headers: await this.authHeader() });
  },
  async setWebFilter(id: string, data: { safeSearch?: boolean; blockUnknown?: boolean; blockedCategories?: string[] }) {
    return req<{ webFilter: { safeSearch: boolean; blockUnknown: boolean; blockedCategories: string } }>(`/api/children/${id}/webfilter`, { method: "PUT", body: data, headers: await this.authHeader() });
  },
  async screenTimeRule(id: string) {
    return req<{ screenTime: ScreenTimeRuleRaw | null }>(`/api/children/${id}/screentime`, { headers: await this.authHeader() });
  },
  async setScreenTimeRule(id: string, data: { enabled?: boolean; dailyLimits?: Record<string, number>; bedtimes?: Bedtime[] }) {
    return req<{ screenTime: ScreenTimeRuleRaw }>(`/api/children/${id}/screentime`, { method: "PUT", body: data, headers: await this.authHeader() });
  },
  async alerts() {
    return req<{ alerts: Alert[]; unread: number }>("/api/alerts", { headers: await this.authHeader() });
  },
  async markAlertsRead() {
    return req<{ ok: true }>("/api/alerts", { method: "PATCH", body: { all: true }, headers: await this.authHeader() });
  },
  async markAlertRead(id: string) {
    return req<{ ok: true }>("/api/alerts", { method: "PATCH", body: { ids: [id] }, headers: await this.authHeader() });
  },
  // ── Remote actions ──
  async pause(id: string, paused: boolean) {
    return req<{ paused: boolean }>(`/api/children/${id}/pause`, { method: "POST", body: { paused }, headers: await this.authHeader() });
  },
  async pauseFor(id: string, untilMinutes: number) {
    return req<{ paused: boolean; pausedUntil: string | null }>(`/api/children/${id}/pause`, { method: "POST", body: { untilMinutes }, headers: await this.authHeader() });
  },
  async familyPause(paused: boolean) {
    return req<{ paused: boolean; count: number }>("/api/family/pause", { method: "POST", body: { paused }, headers: await this.authHeader() });
  },
  async familyPauseFor(untilMinutes: number) {
    return req<{ paused: boolean; count: number }>("/api/family/pause", { method: "POST", body: { untilMinutes }, headers: await this.authHeader() });
  },
  async command(id: string, type: CommandType, payload?: Record<string, unknown>) {
    return req<{ ok: true }>(`/api/children/${id}/commands`, { method: "POST", body: { type, payload }, headers: await this.authHeader() });
  },
  async grantTime(id: string, minutes: number) {
    return req<{ ok: true; granted: number }>(`/api/children/${id}/time-requests`, { method: "POST", body: { minutes }, headers: await this.authHeader() });
  },
  async changePassword(currentPassword: string, newPassword: string) {
    const res = await req<{ ok: true; token?: string }>("/api/account/password", { method: "POST", body: { currentPassword, newPassword }, headers: await this.authHeader() });
    // The server bumps tokenVersion (logout-everywhere); store the fresh token so
    // THIS device stays logged in (it authenticates with the token, not a cookie).
    if (res.token) await storage.set("parentToken", res.token);
    return res;
  },
  async changeEmail(email: string, currentPassword: string) {
    return req<{ ok: true; email: string }>("/api/account/email", { method: "POST", body: { email, currentPassword }, headers: await this.authHeader() });
  },
  async guardians() {
    return req<{ guardians: Guardian[] }>("/api/guardians", { headers: await this.authHeader() });
  },
  async addGuardian(email: string) {
    return req<{ ok: true; added: string; children: number }>("/api/guardians", { method: "POST", body: { email }, headers: await this.authHeader() });
  },
  async removeGuardian(parentId: string) {
    return req<{ ok: true }>(`/api/guardians?parentId=${encodeURIComponent(parentId)}`, { method: "DELETE", headers: await this.authHeader() });
  },
  async twoFactorStatus() {
    return req<{ enabled: boolean }>("/api/account/2fa", { headers: await this.authHeader() });
  },
  async twoFactorEnroll() {
    return req<{ secret: string; otpauth: string; qr: string }>("/api/account/2fa", { method: "POST", body: { action: "enroll" }, headers: await this.authHeader() });
  },
  async twoFactorVerify(code: string) {
    return req<{ enabled: boolean; backupCodes?: string[] }>("/api/account/2fa", { method: "POST", body: { action: "verify", code }, headers: await this.authHeader() });
  },
  async twoFactorDisable(code: string) {
    return req<{ enabled: boolean }>("/api/account/2fa", { method: "POST", body: { action: "disable", code }, headers: await this.authHeader() });
  },
  async notificationPrefs() {
    return req<{ mutedTypes: string[]; mutableTypes: string[] }>("/api/account/notifications", { headers: await this.authHeader() });
  },
  async setNotificationPrefs(mutedTypes: string[]) {
    return req<{ ok: true; mutedTypes: string[] }>("/api/account/notifications", { method: "PATCH", body: { mutedTypes }, headers: await this.authHeader() });
  },
  async insights() {
    return req<{ thisWeekSeconds: number; lastWeekSeconds: number; alertsThisWeek: number }>("/api/insights", { headers: await this.authHeader() });
  },
  async timeRequests(id: string) {
    return req<{ requests: TimeRequest[]; bonusMinutesToday: number }>(`/api/children/${id}/time-requests`, { headers: await this.authHeader() });
  },
  async respondTimeRequest(id: string, requestId: string, action: "approve" | "deny") {
    return req<{ ok: true }>(`/api/children/${id}/time-requests`, { method: "PATCH", body: { id: requestId, action }, headers: await this.authHeader() });
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
    return req<{ policy: Policy; commands: Command[]; pendingTimeRequest?: { minutes: number } | null }>("/api/agent/sync", {
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
// blockedCategories may arrive as a JSON string (raw Prisma field) or an array.
export type WebFilter = { safeSearch: boolean; blockUnknown: boolean; blockedCategories: string[] | string };
export type ChildDetail = Child & { webFilter: WebFilter | null };
export type ScreenTimeToday = { enabled: boolean; limitMinutes: number; bonusMinutes: number; totalMinutes: number };
export type TimeRequest = { id: string; minutes: number; reason: string | null; status: "pending" | "approved" | "denied"; createdAt: string };
export type Live = {
  online: boolean;
  paused: boolean;
  pausedUntil?: string | null;
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
export type WebVisit = { id: string; domain: string; url: string | null; title: string | null; category: string | null; blocked: boolean; ts: string };
export type Screenshot = { id: string; dataUrl: string; createdAt: string };
export type LocationPing = { id: string; lat: number; lng: number; accuracy: number | null; address: string | null; ts: string };
export type Geofence = { id: string; name: string; lat: number; lng: number; radius: number; notifyOnEnter: boolean; notifyOnExit: boolean };
export type ActivityEvent = { id: string; type: string; title: string | null; detail: string | null; category: string | null; blocked: boolean; ts: string; device?: { name: string; platform: string } | null };
// Raw screen-time rule as stored (dailyLimits/bedtimes are JSON strings).
export type ScreenTimeRuleRaw = { enabled: boolean; dailyLimits: string; bedtimes: string };
export type Bedtime = { days: string[]; start: string; end: string };
export type AppAction = "allow" | "block" | "limit";
export type AppRule = { id: string; appId: string; appName: string; action: AppAction; dailyLimitMinutes: number | null; category: string | null };
export type WatchedKeyword = { id: string; term: string; createdAt: string };
export type Guardian = { id: string; name: string; email: string; children: string[] };
// Raw routine as stored (days/blockedAppIds are JSON strings).
export type RoutineRaw = { id: string; name: string; enabled: boolean; days: string; start: string; end: string; blockedAppIds: string };
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
