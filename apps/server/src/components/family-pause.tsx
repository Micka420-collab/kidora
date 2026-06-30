"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "@/components/toast";
import { Pause, Play, Loader2, Clock } from "lucide-react";

const PRESETS = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
];

export function FamilyPause({ anyActive }: { anyActive: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function act(body: { paused?: boolean; untilMinutes?: number }, okMsg: string) {
    setBusy(true);
    try {
      await api.post("/api/family/pause", body);
      toast(okMsg, "success");
      router.refresh();
    } catch {
      toast("Action impossible", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!anyActive) {
    return (
      <button onClick={() => act({ paused: false }, "Tous les appareils ont repris")} disabled={busy} className="btn btn-primary">
        {busy ? <Loader2 size={16} className="spinner" /> : <Play size={16} />}
        Tout reprendre
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.minutes}
          onClick={() => act({ untilMinutes: p.minutes }, `Famille en pause ${p.label}`)}
          disabled={busy}
          title={`Pause famille ${p.label}`}
          className="btn btn-ghost border"
        >
          <Clock size={14} /> {p.label}
        </button>
      ))}
      <button onClick={() => act({ paused: true }, "Tous les appareils sont en pause")} disabled={busy} className="btn btn-danger">
        {busy ? <Loader2 size={16} className="spinner" /> : <Pause size={16} />}
        Tout mettre en pause
      </button>
    </div>
  );
}
