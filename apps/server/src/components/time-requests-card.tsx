"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { formatMinutes } from "@/lib/format";
import { Plus, Check, X, Gift } from "lucide-react";

type Req = { id: string; minutes: number; reason: string | null; status: string; createdAt: string };

export function TimeRequestsCard({ childId }: { childId: string }) {
  const router = useRouter();
  const [requests, setRequests] = useState<Req[]>([]);
  const [bonus, setBonus] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get<{ requests: Req[]; bonusMinutesToday: number }>(`/api/children/${childId}/time-requests`);
    setRequests(res.requests);
    setBonus(res.bonusMinutesToday);
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  async function grant(minutes: number) {
    setBusy(true);
    await api.post(`/api/children/${childId}/time-requests`, { minutes });
    await load();
    setBusy(false);
    router.refresh();
  }
  async function decide(id: string, action: "approve" | "deny") {
    setBusy(true);
    await api.patch(`/api/children/${childId}/time-requests`, { id, action });
    await load();
    setBusy(false);
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "pending");

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold"><Gift size={18} /> Temps bonus</h3>
        {bonus > 0 && <span className="badge bg-emerald-100 text-emerald-700">+{formatMinutes(bonus)} aujourd'hui</span>}
      </div>

      {pending.length > 0 && (
        <div className="mb-4 space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <div className="text-sm">
                <span className="font-medium">Demande : +{formatMinutes(r.minutes)}</span>
                {r.reason && <span className="text-muted"> · « {r.reason} »</span>}
              </div>
              <div className="flex gap-1.5">
                <button disabled={busy} className="btn btn-primary py-1 text-xs" onClick={() => decide(r.id, "approve")}><Check size={14} /> Accorder</button>
                <button disabled={busy} className="btn btn-outline py-1 text-xs" onClick={() => decide(r.id, "deny")}><X size={14} /> Refuser</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Accorder du temps :</span>
        {[15, 30, 60].map((m) => (
          <button key={m} disabled={busy} className="btn btn-outline py-1.5 text-sm" onClick={() => grant(m)}>
            <Plus size={14} /> {formatMinutes(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
