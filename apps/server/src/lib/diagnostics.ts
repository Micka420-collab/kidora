// Install self-diagnostic — powers the public /status page and /api/status.
// A self-hoster setting up Kidora gets a green/red checklist of the server's
// configuration posture. It reports STATUS only (ok/warn/fail) and never leaks
// secret values or the database URL.
import { prisma } from "@/lib/prisma";

export type DiagStatus = "ok" | "warn" | "fail";
export type DiagCheck = { id: string; label: string; status: DiagStatus; detail: string };

const c = (id: string, label: string, status: DiagStatus, detail: string): DiagCheck => ({ id, label, status, detail });

/** True when DATA_ENC_KEY resolves to a real 32-byte key (base64 or hex). */
function hasStrongDataKey(env: NodeJS.ProcessEnv): boolean {
  const raw = env.DATA_ENC_KEY;
  if (!raw) return false;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32;
}

/** Env-based configuration checks (pure — inject env/opts for tests). */
export function evaluateEnvConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts: { isHttps?: boolean; host?: string } = {},
): DiagCheck[] {
  const isProd = env.NODE_ENV === "production";
  const checks: DiagCheck[] = [];

  const auth = env.AUTH_SECRET || "";
  if (!auth) checks.push(c("auth", "Secret de session (AUTH_SECRET)", isProd ? "fail" : "warn", "non défini — sessions non sécurisées ; générez-en un aléatoire"));
  else if (auth.length < 32) checks.push(c("auth", "Secret de session (AUTH_SECRET)", "warn", `trop court (${auth.length} car.) — utilisez ≥ 32 caractères aléatoires`));
  else checks.push(c("auth", "Secret de session (AUTH_SECRET)", "ok", "configuré"));

  checks.push(
    hasStrongDataKey(env)
      ? c("enc", "Chiffrement au repos (DATA_ENC_KEY)", "ok", "clé de 32 octets configurée")
      : c("enc", "Chiffrement au repos (DATA_ENC_KEY)", "warn", "non configuré — repli de dev (captures/secrets moins protégés)"),
  );

  checks.push(
    env.POLICY_SIGNING_SEED || env.AUTH_SECRET
      ? c("sign", "Signature des politiques (agent hors-ligne)", "ok", "active — clé dérivée d'un secret serveur")
      : c("sign", "Signature des politiques (agent hors-ligne)", "warn", "repli de dev — définissez POLICY_SIGNING_SEED ou AUTH_SECRET"),
  );

  checks.push(
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
      ? c("push", "Notifications push (VAPID)", "ok", "configuré")
      : c("push", "Notifications push (VAPID)", "warn", "non configuré — alertes push désactivées (npx web-push generate-vapid-keys)"),
  );

  checks.push(
    env.SMTP_HOST && env.SMTP_PORT
      ? c("smtp", "E-mails (SMTP)", "ok", "configuré")
      : c("smtp", "E-mails (SMTP)", "warn", "non configuré — vérification d'e-mail, mot de passe oublié et rapports hebdo désactivés"),
  );

  checks.push(
    env.CRON_SECRET
      ? c("cron", "Secret des tâches planifiées (CRON_SECRET)", "ok", "configuré")
      : c("cron", "Secret des tâches planifiées (CRON_SECRET)", "warn", "non défini — les tâches /api/cron sont bloquées (fail-closed)"),
  );

  const host = (opts.host || "").toLowerCase();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  checks.push(
    opts.isHttps || isLocal
      ? c("https", "HTTPS", "ok", isLocal ? "local (HTTPS non requis)" : "actif")
      : c("https", "HTTPS", "warn", "accès en HTTP — requis hors localhost pour l'installation PWA, le push et les cookies sécurisés"),
  );

  return checks;
}

/** DB reachability probe (async, separate from the pure env checks). */
export async function probeDb(): Promise<DiagCheck> {
  const t0 = Date.now();
  try {
    await prisma.parent.count();
    return c("db", "Base de données", "ok", `connectée (${Date.now() - t0} ms)`);
  } catch {
    return c("db", "Base de données", "fail", "injoignable — vérifiez DATABASE_URL");
  }
}

/** Overall verdict = worst check. */
export function overallStatus(checks: DiagCheck[]): DiagStatus {
  if (checks.some((x) => x.status === "fail")) return "fail";
  if (checks.some((x) => x.status === "warn")) return "warn";
  return "ok";
}

/** Full report: DB probe first, then env checks. */
export async function collectDiagnostics(opts: { isHttps?: boolean; host?: string } = {}): Promise<{
  overall: DiagStatus;
  checks: DiagCheck[];
}> {
  const checks = [await probeDb(), ...evaluateEnvConfig(process.env, opts)];
  return { overall: overallStatus(checks), checks };
}
