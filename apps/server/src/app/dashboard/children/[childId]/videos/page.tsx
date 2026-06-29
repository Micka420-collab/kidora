"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Loader2, PlaySquare, Smartphone, Monitor, ExternalLink } from "lucide-react";

type Video = {
  id: string;
  title: string;
  channel: string | null;
  url: string | null;
  source: string;
  platform: string;
  ts: string;
};

/** Extract a YouTube video id from a url (watch?v=, youtu.be/, /shorts/, /embed/). */
export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function thumb(url: string | null): string | null {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

export default function VideosTab() {
  const { childId } = useParams<{ childId: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ videos: Video[] }>(`/api/children/${childId}/videos`)
      .then((r) => setVideos(r.videos))
      .finally(() => setLoading(false));
  }, [childId]);

  if (loading) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        <PlaySquare size={18} className="text-red-500" />
        <span>{videos.length} vidéo{videos.length > 1 ? "s" : ""} regardée{videos.length > 1 ? "s" : ""} (téléphone + PC)</span>
      </div>

      {videos.length === 0 ? (
        <div className="card grid place-items-center gap-2 py-16 text-center">
          <PlaySquare size={40} className="text-slate-300" />
          <p className="text-sm text-muted">Aucune vidéo enregistrée pour l’instant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {videos.map((v) => {
            const t = thumb(v.url);
            return (
              <div key={v.id} className="card flex items-center gap-3 p-3">
                <div className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {t ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-red-400"><PlaySquare size={22} /></span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-semibold">{v.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {v.channel && <span className="truncate">{v.channel}</span>}
                    {v.channel && <span>·</span>}
                    <span>{relativeTime(v.ts)}</span>
                  </div>
                </div>
                <span className="badge flex items-center gap-1 bg-slate-100 text-slate-600">
                  {v.platform === "phone" ? <Smartphone size={12} /> : <Monitor size={12} />}
                  {v.platform === "phone" ? "Téléphone" : "PC"}
                </span>
                {v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-600" aria-label="Ouvrir la vidéo">
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
