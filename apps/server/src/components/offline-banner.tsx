"use client";

import { useEffect, useRef, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnline } from "@/lib/use-online";
import { useT } from "@/components/i18n-provider";

/**
 * Shows a persistent banner while the browser is offline, and a brief
 * "back online" confirmation when the connection returns — so a parent whose
 * network drops understands why data stopped updating instead of seeing raw
 * errors.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();
  const [showBack, setShowBack] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowBack(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowBack(true);
      const id = setTimeout(() => setShowBack(false), 3000);
      return () => clearTimeout(id);
    }
  }, [online]);

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-5 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      >
        <WifiOff size={18} className="shrink-0" />
        <span className="flex-1">{t.common.offlineBanner}</span>
      </div>
    );
  }

  if (showBack) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-5 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        <Wifi size={18} className="shrink-0" />
        <span className="flex-1">{t.common.backOnline}</span>
      </div>
    );
  }

  return null;
}
