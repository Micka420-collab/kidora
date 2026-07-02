"use client";

import { useSyncExternalStore } from "react";

/** Subscribe to browser online/offline events. */
function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True when the browser reports a network connection. SSR-safe (assumes online
 *  on the server so nothing flashes during hydration). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine, // client snapshot
    () => true, // server snapshot
  );
}
