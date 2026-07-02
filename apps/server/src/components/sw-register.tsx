"use client";

import { useEffect } from "react";

/** Registers the Kidora service worker (offline support + push). Network-first,
 *  so it changes nothing while online; it only helps when the network fails. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Production only — in dev the hashed-asset caching would interfere with HMR,
    // and production is where assets are immutable-hashed (so cache-first is safe).
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
