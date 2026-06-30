"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { useT } from "@/components/i18n-provider";
import { ErrorCard } from "@/components/error-card";
import { Loader2, Plus, Trash2, ShieldCheck, Search, Eye } from "lucide-react";

type WebRule = { id: string; kind: string; value: string; action: "allow" | "block" };
type Filter = { safeSearch: boolean; blockUnknown: boolean; blockedCategories: string[] };
type Keyword = { id: string; term: string };

const FILTERABLE: Category[] = [
  "adult", "gambling", "violence", "drugs", "dating",
  "social", "video", "games", "streaming", "shopping",
];

export default function WebTab() {
  const { childId } = useParams<{ childId: string }>();
  const { t: tr } = useT();
  const t = tr.web;
  const [filter, setFilter] = useState<Filter | null>(null);
  const [rules, setRules] = useState<WebRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [domain, setDomain] = useState("");
  const [domainAction, setDomainAction] = useState<"block" | "allow">("block");
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [kw, setKw] = useState("");

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (kw.trim().length < 2) return;
    const res = await api.post<{ keyword: Keyword }>(`/api/children/${childId}/keywords`, { term: kw.trim() });
    setKeywords((ks) => [res.keyword, ...ks.filter((k) => k.id !== res.keyword.id)]);
    setKw("");
  }
  async function removeKeyword(id: string) {
    setKeywords((ks) => ks.filter((k) => k.id !== id));
    await api.del(`/api/children/${childId}/keywords?id=${id}`);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    // Watched keywords are best-effort and shouldn't gate the page.
    api.get<{ keywords: Keyword[] }>(`/api/children/${childId}/keywords`).then((r) => setKeywords(r.keywords)).catch(() => {});
    try {
      const res = await api.get<{ child: { webFilter: Filter | null; webRules: WebRule[] } }>(`/api/children/${childId}`);
      const wf = res.child.webFilter;
      setFilter({
        safeSearch: wf?.safeSearch ?? true,
        blockUnknown: wf?.blockUnknown ?? false,
        blockedCategories: typeof (wf as unknown as { blockedCategories: unknown })?.blockedCategories === "string"
          ? JSON.parse((wf as unknown as { blockedCategories: string }).blockedCategories)
          : (wf?.blockedCategories ?? []),
      });
      setRules(res.child.webRules ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  async function saveFilter(next: Filter) {
    setFilter(next);
    await api.put(`/api/children/${childId}/webfilter`, next);
  }
  function toggleCategory(cat: string) {
    if (!filter) return;
    const has = filter.blockedCategories.includes(cat);
    const blockedCategories = has
      ? filter.blockedCategories.filter((c) => c !== cat)
      : [...filter.blockedCategories, cat];
    saveFilter({ ...filter, blockedCategories });
  }
  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    const res = await api.post<{ rule: WebRule }>(`/api/children/${childId}/rules/web`, {
      kind: "domain", value: domain.trim(), action: domainAction,
    });
    setRules((rs) => [...rs.filter((r) => r.value !== res.rule.value), res.rule]);
    setDomain("");
  }
  async function removeRule(r: WebRule) {
    setRules((rs) => rs.filter((x) => x.id !== r.id));
    await api.del(`/api/children/${childId}/rules/web?id=${r.id}`);
  }

  if (error) return <ErrorCard onRetry={load} />;
  if (loading || !filter) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  return (
    <div className="space-y-5">
      {/* Switches */}
      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold">{t.protection}</h3>
        <Switch
          icon={<Search size={18} />}
          title={t.safeSearch}
          desc={t.safeSearchDesc}
          checked={filter.safeSearch}
          onChange={(v) => saveFilter({ ...filter, safeSearch: v })}
        />
        <Switch
          icon={<ShieldCheck size={18} />}
          title={t.blockUnknown}
          desc={t.blockUnknownDesc}
          checked={filter.blockUnknown}
          onChange={(v) => saveFilter({ ...filter, blockUnknown: v })}
        />
      </div>

      {/* Categories */}
      <div className="card p-5">
        <h3 className="mb-1 text-base font-semibold">{t.categories}</h3>
        <p className="mb-4 text-sm text-muted">{t.categoriesDesc}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {FILTERABLE.map((cat) => {
            const meta = CATEGORY_META[cat];
            const blocked = filter.blockedCategories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                  blocked ? "border-red-200 bg-red-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-lg">{meta.emoji}</span> {meta.label}
                </span>
                <span className={`badge ${blocked ? "bg-red-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {blocked ? t.blocked : t.allowed}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Allow / block list */}
      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold">{t.sites}</h3>
        <form onSubmit={addDomain} className="mb-4 flex flex-wrap gap-2">
          <input className="input flex-1" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <select className="input w-auto" value={domainAction} onChange={(e) => setDomainAction(e.target.value as "block" | "allow")}>
            <option value="block">{t.block}</option>
            <option value="allow">{t.allow}</option>
          </select>
          <button className="btn btn-primary"><Plus size={16} /> {t.addSite}</button>
        </form>
        {rules.filter((r) => r.kind === "domain").length === 0 ? (
          <p className="text-sm text-muted">{t.noSites}</p>
        ) : (
          <div className="divide-y">
            {rules.filter((r) => r.kind === "domain").map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm">{r.value}</span>
                <div className="flex items-center gap-3">
                  <span className={`badge ${r.action === "block" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
                    {r.action === "block" ? t.blocked : t.allowed}
                  </span>
                  <button className="text-slate-400 hover:text-red-500" onClick={() => removeRule(r)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watched keywords */}
      <div className="card p-5">
        <h3 className="mb-1 flex items-center gap-2 text-base font-semibold"><Eye size={18} /> {t.keywords}</h3>
        <p className="mb-4 text-sm text-muted">{t.keywordsDesc}</p>
        <form onSubmit={addKeyword} className="mb-4 flex gap-2">
          <input className="input flex-1" placeholder={t.keywordPlaceholder} value={kw} onChange={(e) => setKw(e.target.value)} />
          <button className="btn btn-primary"><Plus size={16} /> {tr.apps.add}</button>
        </form>
        {keywords.length === 0 ? (
          <p className="text-sm text-muted">{t.noKeywords}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((k) => (
              <span key={k.id} className="badge bg-slate-100 text-slate-700">
                {k.term}
                <button className="text-slate-400 hover:text-red-500" onClick={() => removeKeyword(k.id)}><Trash2 size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Switch({ icon, title, desc, checked, onChange }: { icon: React.ReactNode; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-0">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-brand-600">{icon}</span>
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted">{desc}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-600" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
