"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Loader2, MessageSquare, ArrowDownLeft, ArrowUpRight } from "lucide-react";

type Message = {
  id: string;
  app: string;
  direction: "in" | "out";
  contact: string | null;
  body: string;
  ts: string;
};

export default function MessagesTab() {
  const { childId } = useParams<{ childId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ messages: Message[] }>(`/api/children/${childId}/messages`)
      .then((r) => setMessages(r.messages))
      .finally(() => setLoading(false));
  }, [childId]);

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  const received = messages.filter((m) => m.direction === "in").length;
  const sent = messages.length - received;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <MessageSquare size={18} className="text-brand-600" />
        <span>{messages.length} message{messages.length > 1 ? "s" : ""} · {received} reçu{received > 1 ? "s" : ""}, {sent} envoyé{sent > 1 ? "s" : ""}</span>
      </div>

      {messages.length === 0 ? (
        <div className="card grid place-items-center gap-2 py-16 text-center">
          <MessageSquare size={40} className="text-slate-300" />
          <p className="text-sm text-muted">Aucun message enregistré pour l’instant.</p>
        </div>
      ) : (
        <div className="card space-y-3 p-4">
          {messages.slice().reverse().map((m) => {
            const out = m.direction === "out";
            return (
              <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${out ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-800"}`}>
                  <div className={`mb-0.5 flex items-center gap-1 text-[11px] font-medium ${out ? "text-brand-100" : "text-slate-500"}`}>
                    {out ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
                    {out ? "Envoyé" : (m.contact ?? "Reçu")}
                  </div>
                  <div className="text-sm">{m.body}</div>
                  <div className={`mt-0.5 text-[10px] ${out ? "text-brand-100" : "text-slate-400"}`}>{relativeTime(m.ts)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
