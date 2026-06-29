// Lightweight i18n: cookie-based locale + typed dictionaries (FR default, EN).
import { cookies } from "next/headers";

export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];
export const LOCALE_COOKIE = "kidora_locale";

const fr = {
  nav: {
    overview: "Vue d'ensemble",
    alerts: "Alertes",
    settings: "Paramètres",
    myChildren: "Mes enfants",
    addChild: "Ajouter un enfant",
    logout: "Déconnexion",
  },
  common: {
    active: "Actif",
    offline: "Hors ligne",
    paused: "En pause",
    save: "Enregistrer",
    saved: "Enregistré",
    cancel: "Annuler",
    add: "Ajouter",
    delete: "Supprimer",
    language: "Langue",
  },
  overview: {
    hello: "Bonjour",
    todayActivity: "Voici l'activité de votre famille aujourd'hui.",
    screenTimeToday: "Temps d'écran aujourd'hui",
    devicesOnline: "Appareils en ligne",
    unreadAlerts: "Alertes non lues",
    recentAlerts: "Alertes récentes",
    seeAll: "Tout voir",
    allGood: "Aucune alerte. Tout va bien ! ✅",
  },
  alerts: {
    title: "Alertes",
    subtitle: "Événements importants détectés sur les appareils de vos enfants.",
    markAllRead: "Tout marquer comme lu",
    markRead: "Marquer lu",
    empty: "Aucune alerte. Tout va bien ! ✅",
  },
  tabs: {
    overview: "Vue d'ensemble",
    apps: "Applications",
    web: "Web",
    screenTime: "Temps d'écran",
    location: "Localisation",
    activity: "Activité",
    reports: "Rapports",
    devices: "Appareils",
  },
  settings: {
    title: "Paramètres",
    subtitle: "Votre compte et votre famille.",
    account: "Compte",
    name: "Nom",
    email: "Email",
    role: "Rôle",
    owner: "Propriétaire",
    guardian: "Tuteur",
    memberSince: "Membre depuis",
    childrenProtected: "Enfant(s) protégé(s)",
    devicesMonitored: "Appareil(s) surveillé(s)",
    journal: "Journal du compte",
    about: "À propos de Kidora",
  },
  apps: {
    intro: "Définissez ce que votre enfant peut utiliser. Les nouvelles apps détectées apparaissent ici automatiquement.",
    add: "Ajouter",
    allow: "Autoriser",
    limit: "Limiter",
    block: "Bloquer",
    empty: "Aucune règle d'application pour l'instant.",
    appName: "Nom de l'application",
    appId: "Identifiant (exe / package) — optionnel",
    perDay: "/jour",
  },
};

const en: typeof fr = {
  nav: {
    overview: "Overview",
    alerts: "Alerts",
    settings: "Settings",
    myChildren: "My children",
    addChild: "Add a child",
    logout: "Log out",
  },
  common: {
    active: "Active",
    offline: "Offline",
    paused: "Paused",
    save: "Save",
    saved: "Saved",
    cancel: "Cancel",
    add: "Add",
    delete: "Delete",
    language: "Language",
  },
  overview: {
    hello: "Hello",
    todayActivity: "Here's your family's activity today.",
    screenTimeToday: "Screen time today",
    devicesOnline: "Devices online",
    unreadAlerts: "Unread alerts",
    recentAlerts: "Recent alerts",
    seeAll: "See all",
    allGood: "No alerts. All good! ✅",
  },
  alerts: {
    title: "Alerts",
    subtitle: "Important events detected on your children's devices.",
    markAllRead: "Mark all as read",
    markRead: "Mark read",
    empty: "No alerts. All good! ✅",
  },
  tabs: {
    overview: "Overview",
    apps: "Apps",
    web: "Web",
    screenTime: "Screen time",
    location: "Location",
    activity: "Activity",
    reports: "Reports",
    devices: "Devices",
  },
  settings: {
    title: "Settings",
    subtitle: "Your account and your family.",
    account: "Account",
    name: "Name",
    email: "Email",
    role: "Role",
    owner: "Owner",
    guardian: "Guardian",
    memberSince: "Member since",
    childrenProtected: "Protected child(ren)",
    devicesMonitored: "Monitored device(s)",
    journal: "Account log",
    about: "About Kidora",
  },
  apps: {
    intro: "Set what your child can use. Newly detected apps appear here automatically.",
    add: "Add",
    allow: "Allow",
    limit: "Limit",
    block: "Block",
    empty: "No app rules yet.",
    appName: "App name",
    appId: "Identifier (exe / package) — optional",
    perDay: "/day",
  },
};

export type Dict = typeof fr;
const DICTS: Record<Locale, Dict> = { fr, en };

export function getDict(locale: Locale): Dict {
  return DICTS[locale] ?? fr;
}

export function isLocale(v: string | undefined): v is Locale {
  return v === "fr" || v === "en";
}

/** Read the current locale from the cookie (server components / route handlers). */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : "fr";
}
