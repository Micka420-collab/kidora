import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { DEFAULT_BLOCKED_CATEGORIES, categorizeApp, categorizeDomain } from "../src/lib/categories";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

function token() {
  return randomBytes(24).toString("base64url");
}
function dateStr(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("🌱 Seeding Kidora demo data…");

  // wipe (dev only)
  await prisma.$transaction([
    prisma.alert.deleteMany(),
    prisma.command.deleteMany(),
    prisma.locationPing.deleteMany(),
    prisma.geofence.deleteMany(),
    prisma.webVisit.deleteMany(),
    prisma.appUsage.deleteMany(),
    prisma.activityEvent.deleteMany(),
    prisma.appRule.deleteMany(),
    prisma.webRule.deleteMany(),
    prisma.screenTimeRule.deleteMany(),
    prisma.webFilterConfig.deleteMany(),
    prisma.device.deleteMany(),
    prisma.child.deleteMany(),
    prisma.parent.deleteMany(),
  ]);

  const parent = await prisma.parent.create({
    data: {
      name: "Famille Démo",
      email: "demo@kidora.app",
      passwordHash: await bcrypt.hash("kidora1234", 10),
    },
  });
  console.log("👤 Parent: demo@kidora.app / kidora1234");

  // ── Child 1: Emma (9) — Android tablet ──
  const emma = await prisma.child.create({
    data: {
      parentId: parent.id,
      name: "Emma",
      avatar: "👧",
      birthDate: new Date("2017-03-12"),
      screenTime: {
        create: {
          enabled: true,
          dailyLimits: JSON.stringify({ mon: 90, tue: 90, wed: 120, thu: 90, fri: 150, sat: 180, sun: 180 }),
          bedtimes: JSON.stringify([
            { days: ["sun", "mon", "tue", "wed", "thu"], start: "20:30", end: "07:00" },
            { days: ["fri", "sat"], start: "21:30", end: "08:00" },
          ]),
        },
      },
      webFilter: {
        create: {
          safeSearch: true,
          blockUnknown: true,
          blockedCategories: JSON.stringify([...DEFAULT_BLOCKED_CATEGORIES, "social"]),
        },
      },
    },
  });

  // ── Child 2: Lucas (13) — Windows PC ──
  const lucas = await prisma.child.create({
    data: {
      parentId: parent.id,
      name: "Lucas",
      avatar: "🧑",
      birthDate: new Date("2013-09-01"),
      screenTime: {
        create: {
          enabled: true,
          dailyLimits: JSON.stringify({ mon: 120, tue: 120, wed: 150, thu: 120, fri: 240, sat: 300, sun: 240 }),
          bedtimes: JSON.stringify([
            { days: ["sun", "mon", "tue", "wed", "thu"], start: "22:00", end: "07:00" },
          ]),
        },
      },
      webFilter: {
        create: {
          safeSearch: true,
          blockUnknown: false,
          blockedCategories: JSON.stringify(DEFAULT_BLOCKED_CATEGORIES),
        },
      },
    },
  });

  const emmaTablet = await prisma.device.create({
    data: { childId: emma.id, name: "Tablette d'Emma", platform: "android", model: "Samsung Galaxy Tab A9", enrollToken: token(), enrolled: true, online: true, battery: 72, lastSeen: new Date(), agentVersion: "1.0.0" },
  });
  const lucasPC = await prisma.device.create({
    data: { childId: lucas.id, name: "PC de Lucas", platform: "windows", model: "Windows 11 Desktop", enrollToken: token(), enrolled: true, online: true, battery: 100, lastSeen: new Date(), agentVersion: "1.0.0" },
  });

  // App rules
  await prisma.appRule.createMany({
    data: [
      { childId: emma.id, appId: "com.roblox.client", appName: "Roblox", category: "games", action: "limit", dailyLimitMinutes: 60 },
      { childId: emma.id, appId: "com.zhiliaoapp.musically", appName: "TikTok", category: "social", action: "block" },
      { childId: emma.id, appId: "com.google.android.youtube", appName: "YouTube", category: "video", action: "limit", dailyLimitMinutes: 45 },
      { childId: lucas.id, appId: "chrome.exe", appName: "Google Chrome", category: "browser", action: "allow" },
      { childId: lucas.id, appId: "discord.exe", appName: "Discord", category: "communication", action: "limit", dailyLimitMinutes: 90 },
      { childId: lucas.id, appId: "steam.exe", appName: "Steam", category: "games", action: "limit", dailyLimitMinutes: 120 },
      { childId: lucas.id, appId: "valorant.exe", appName: "Valorant", category: "games", action: "block" },
    ],
  });

  // Web rules
  await prisma.webRule.createMany({
    data: [
      { childId: emma.id, kind: "domain", value: "khanacademy.org", action: "allow" },
      { childId: emma.id, kind: "domain", value: "tiktok.com", action: "block" },
      { childId: lucas.id, kind: "domain", value: "github.com", action: "allow" },
      { childId: lucas.id, kind: "category", value: "gambling", action: "block" },
    ],
  });

  // App usage over last 7 days
  const emmaApps = [
    { appId: "com.roblox.client", appName: "Roblox" },
    { appId: "com.google.android.youtube", appName: "YouTube" },
    { appId: "com.duolingo", appName: "Duolingo" },
    { appId: "com.king.candycrushsaga", appName: "Candy Crush" },
  ];
  const lucasApps = [
    { appId: "chrome.exe", appName: "Google Chrome" },
    { appId: "discord.exe", appName: "Discord" },
    { appId: "steam.exe", appName: "Steam" },
    { appId: "minecraft.exe", appName: "Minecraft" },
    { appId: "code.exe", appName: "VS Code" },
  ];
  for (let d = 0; d < 7; d++) {
    for (const a of emmaApps) {
      await prisma.appUsage.create({ data: { childId: emma.id, deviceId: emmaTablet.id, appId: a.appId, appName: a.appName, category: categorizeApp(a.appId, a.appName), date: dateStr(d), seconds: 60 * (10 + Math.floor(Math.random() * 60)) } });
    }
    for (const a of lucasApps) {
      await prisma.appUsage.create({ data: { childId: lucas.id, deviceId: lucasPC.id, appId: a.appId, appName: a.appName, category: categorizeApp(a.appId, a.appName), date: dateStr(d), seconds: 60 * (15 + Math.floor(Math.random() * 90)) } });
    }
  }

  // Web visits
  const domains = ["youtube.com", "roblox.com", "wikipedia.org", "khanacademy.org", "google.com", "tiktok.com", "discord.com", "github.com"];
  for (let i = 0; i < 40; i++) {
    const dom = pick(domains);
    const blocked = dom === "tiktok.com";
    const child = Math.random() > 0.5 ? emma : lucas;
    const dev = child.id === emma.id ? emmaTablet : lucasPC;
    await prisma.webVisit.create({
      data: {
        childId: child.id, deviceId: dev.id, domain: dom, url: `https://${dom}/`,
        category: categorizeDomain(dom), blocked,
        ts: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 3)),
      },
    });
  }

  // Activity events
  const evTypes = ["app_open", "web_visit", "screen_on", "search"];
  for (let i = 0; i < 30; i++) {
    const child = Math.random() > 0.5 ? emma : lucas;
    const dev = child.id === emma.id ? emmaTablet : lucasPC;
    await prisma.activityEvent.create({
      data: {
        childId: child.id, deviceId: dev.id, type: pick(evTypes),
        title: pick(["Roblox", "YouTube", "recherche: dinosaures", "Chrome", "Discord"]),
        ts: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 2)),
      },
    });
  }

  // Watched videos (YouTube) — phone + PC
  const videoTitles = [
    { title: "Minecraft: 100 jours en mode Hardcore !", channel: "Aypierre", vid: "dQw4w9WgXcQ" },
    { title: "Comment dessiner un dragon facile", channel: "Art for Kids Hub", vid: "9bZkp7q19f0" },
    { title: "Les volcans expliqués aux enfants", channel: "1 jour, 1 question", vid: "kJQP7kiw5Fk" },
    { title: "Roblox Brookhaven RP - On emménage !", channel: "Furious Jumper", vid: "JGwWNGJdvx8" },
    { title: "Top 10 des buts incroyables", channel: "FootStats", vid: "OPf0YbXqDm0" },
    { title: "Slime satisfaisant ASMR", channel: "Craft Factory", vid: "hT_nvWreIhg" },
    { title: "Apprendre les tables de multiplication en chanson", channel: "Comptines TV", vid: "60ItHLz5WEA" },
    { title: "Pokémon - Le film : extrait", channel: "Pokémon France", vid: "RgKAFK5djSk" },
  ];
  for (let i = 0; i < videoTitles.length; i++) {
    const child = i % 2 === 0 ? emma : lucas;
    const dev = child.id === emma.id ? emmaTablet : lucasPC;
    const v = videoTitles[i];
    await prisma.watchedVideo.create({
      data: {
        childId: child.id, deviceId: dev.id, source: "youtube",
        platform: child.id === emma.id ? "phone" : "pc",
        title: v.title, channel: v.channel, url: `https://www.youtube.com/watch?v=${v.vid}`,
        ts: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 2)),
      },
    });
  }

  // Messages (SMS) — sent & received on the phone
  const msgs = [
    { direction: "in", contact: "Maman", body: "Tu rentres à quelle heure ?" },
    { direction: "out", contact: "Maman", body: "Vers 17h, je suis chez Léa 😊" },
    { direction: "in", contact: "Léa", body: "On se voit demain à l'école ?" },
    { direction: "out", contact: "Léa", body: "Oui ! N'oublie pas ton livre 📚" },
    { direction: "in", contact: "+33 6 12 34 56 78", body: "Bonjour, votre colis est arrivé." },
    { direction: "in", contact: "Papa", body: "Bon courage pour ton contrôle 💪" },
  ];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    await prisma.message.create({
      data: {
        childId: emma.id, deviceId: emmaTablet.id, app: "sms",
        direction: m.direction, contact: m.contact, body: m.body,
        ts: new Date(Date.now() - (msgs.length - i) * 3600000),
      },
    });
  }

  // Geofences + location for Emma
  await prisma.geofence.createMany({
    data: [
      { childId: emma.id, name: "Maison", lat: 48.8566, lng: 2.3522, radius: 120 },
      { childId: emma.id, name: "École", lat: 48.8606, lng: 2.3376, radius: 150 },
    ],
  });
  for (let i = 0; i < 8; i++) {
    await prisma.locationPing.create({
      data: {
        childId: emma.id, deviceId: emmaTablet.id,
        lat: 48.8566 + (Math.random() - 0.5) * 0.01,
        lng: 2.3522 + (Math.random() - 0.5) * 0.01,
        accuracy: 10 + Math.random() * 30,
        address: "Paris, France",
        ts: new Date(Date.now() - i * 3600000),
      },
    });
  }

  // Alerts
  await prisma.alert.createMany({
    data: [
      { parentId: parent.id, childId: emma.id, type: "risk", severity: "critical", message: "⚠️ Prédation / grooming détecté dans un message (de Inconnu) — « tu as quel âge ? n'en parle pas à tes parents, c'est notre secret »", read: false },
      { parentId: parent.id, childId: lucas.id, type: "risk", severity: "warning", message: "⚠️ Harcèlement détecté dans un message — « personne ne t'aime, dégage »", read: false },
      { parentId: parent.id, childId: emma.id, type: "blocked_attempt", severity: "warning", message: "Tentative bloquée : tiktok.com", read: false },
      { parentId: parent.id, childId: lucas.id, type: "limit_reached", severity: "info", message: "Limite de temps atteinte : Steam (120 min)", read: false },
      { parentId: parent.id, childId: emma.id, type: "bedtime", severity: "info", message: "Heure du coucher : appareil verrouillé à 20:30", read: true },
      { parentId: parent.id, childId: lucas.id, type: "new_app", severity: "info", message: "Nouvelle application détectée : Valorant", read: false },
    ],
  });

  console.log("\n✅ Seed terminé.");
  console.log(`   Enfants: Emma (${emma.id}), Lucas (${lucas.id})`);
  console.log(`   Token agent (PC de Lucas): ${lucasPC.enrollToken}`);
  console.log(`   Token agent (Tablette Emma): ${emmaTablet.enrollToken}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
