"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Pause, Play, Loader2 } from "lucide-react";

export function FamilyPause({ anyActive }: { anyActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api.post("/api/family/pause", { paused: anyActive });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={busy} className={`btn ${anyActive ? "btn-danger" : "btn-primary"}`}>
      {busy ? <Loader2 size={16} className="spinner" /> : anyActive ? <Pause size={16} /> : <Play size={16} />}
      {anyActive ? "Tout mettre en pause" : "Tout reprendre"}
    </button>
  );
}
