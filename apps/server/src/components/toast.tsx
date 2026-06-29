"use client";

import { createContext, useContext, useRef, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

const ToastCtx = createContext<(message: string, type?: ToastType) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };
const TINTS = {
  success: "border-emerald-200 text-emerald-700",
  error: "border-red-200 text-red-700",
  info: "border-brand-200 text-brand-700",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              role="status"
              className={`toast-in pointer-events-auto flex items-center gap-2.5 rounded-xl border bg-white px-4 py-3 text-sm font-medium shadow-lg ${TINTS[t.type]}`}
            >
              <Icon size={18} />
              <span className="text-ink">{t.message}</span>
              <button
                aria-label="Fermer"
                className="ml-1 text-slate-300 hover:text-slate-500"
                onClick={() => setToasts((arr) => arr.filter((x) => x.id !== t.id))}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
