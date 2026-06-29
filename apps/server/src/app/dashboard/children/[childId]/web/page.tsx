"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { CATEGORY_META, type Category } from "@/lib/categories";
import { Loader2, Plus, Trash2, ShieldCheck, Search } from "lucide-react";

type WebRule = { id: string; kind: string; value: string; action: "allow" | "block" };
type Filter = { safeSearch: boolean; blockUnknown: boolean; blockedCategories: string[] };

const FILTERABLE: Category[] = [
  "adult", "gambling", "violence", "drugs", "dating",
  "social", "video", "games", "streaming", "shopping",
];

export default function WebTab() {
  const { childId } = useParams<{ childId: string }>();
  const [filter, setFilter] = useState<Filter | null>(null);
  const [rules, setRules] = useState<WebRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("");
  const [domainAction, setDomainAction] = useState<"block" | "allow">("block");

  async function load() {
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
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [childId]);

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

  if (loading || !filter) return <div className="grid place-items-center py-16"><Loader2 className="spinner text-muted" /></div>;

  return (
    <div className="space-y-5">
      {/* Switches */}
      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold">Protection</h3>
        <Switch
          icon={<Search size={18} />}
          title="Recherche sécurisée (SafeSearch)"
          desc="Force le mode sans contenu explicite sur Google, Bing et YouTube."
          checked={filter.safeSearch}
          onChange={(v) => saveFilter({ ...filter, safeSearch: v })}
        />
        <Switch
          icon={<ShieldCheck size={18} />}
          title="Bloquer les sites inconnus"
          desc="Bloque les domaines non classés (mode strict pour les jeunes enfants)."
          checked={filter.blockUnknown}
          onChange={(v) => saveFilter({ ...filter, blockUnknown: v })}
        />
      </div>

      {/* Categories */}
      <div className="card p-5">
        <h3 className="mb-1 text-base font-semibold">Catégories bloquées</h3>
        <p className="mb-4 text-sm text-muted">Activez les catégories à bloquer pour cet enfant.</p>
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
                  {blocked ? "Bloqué" : "Autorisé"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Allow / block list */}
      <div className="card p-5">
        <h3 className="mb-4 text-base font-semibold">Sites spécifiques</h3>
        <form onSubmit={addDomain} className="mb-4 flex flex-wrap gap-2">
          <input className="input flex-1" placeholder="exemple.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <select className="input w-auto" value={domainAction} onChange={(e) => setDomainAction(e.target.value as "block" | "allow")}>
            <option value="block">Bloquer</option>
            <option value="allow">Autoriser</option>
          </select>
          <button className="btn btn-primary"><Plus size={16} /> Ajouter</button>
        </form>
        {rules.filter((r) => r.kind === "domain").length === 0 ? (
          <p className="text-sm text-muted">Aucun site dans la liste.</p>
        ) : (
          <div className="divide-y">
            {rules.filter((r) => r.kind === "domain").map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm">{r.value}</span>
                <div className="flex items-center gap-3">
                  <span className={`badge ${r.action === "block" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
                    {r.action === "block" ? "Bloqué" : "Autorisé"}
                  </span>
                  <button className="text-slate-400 hover:text-red-500" onClick={() => removeRule(r)}><Trash2 size={16} /></button>
                </div>
              </div>
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
