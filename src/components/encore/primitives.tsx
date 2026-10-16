import type { ReactNode } from "react";
import { Check, Quote, Sparkles, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCountUp, useMounted } from "@/lib/encore/use-count-up";

/** Score band colors: ≥75 green, 50–74 indigo, <50 amber. */
export function scoreBand(v: number): "high" | "mid" | "low" {
  return v >= 75 ? "high" : v >= 50 ? "mid" : "low";
}
const bandText = { high: "text-verified", mid: "text-primary", low: "text-inference" } as const;
const bandBg = { high: "bg-verified", mid: "bg-primary", low: "bg-inference" } as const;

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight", className)}>
      <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
        <span className="text-[13px] leading-none">e</span>
      </span>
      Encore
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("surface p-6", className)}>{children}</div>;
}

type Tone = "neutral" | "primary" | "verified" | "inference" | "risk";
const toneClass: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground border-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  verified: "bg-verified/10 text-verified border-verified/25",
  inference: "bg-inference/10 text-inference border-inference/30",
  risk: "bg-risk/10 text-risk border-risk/25",
};

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export type EvidenceKind = "verified" | "inference" | "unverified";
const evidenceMeta: Record<EvidenceKind, { label: string; cls: string; Icon: typeof Quote }> = {
  verified: { label: "Verified quote", cls: toneClass.verified, Icon: Quote },
  inference: { label: "AI inference", cls: toneClass.inference, Icon: Sparkles },
  unverified: { label: "Unverified", cls: "bg-risk/5 text-muted-foreground border-risk/30", Icon: AlertTriangle },
};

export function EvidenceChip({ kind, onClick, label }: { kind: EvidenceKind; onClick?: () => void; label?: string }) {
  const m = evidenceMeta[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-95 focus-visible:outline-2",
        m.cls,
      )}
    >
      <m.Icon className="size-3" aria-hidden />
      {label ?? m.label}
    </button>
  );
}

export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const shown = useCountUp(v);
  const mounted = useMounted();
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="font-mono text-[13px] text-foreground">{shown}</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Score"}>
        <div className={cn("score-anim h-full rounded-full", bandBg[scoreBand(v)])} style={{ width: `${mounted ? v : 0}%` }} />
      </div>
    </div>
  );
}

export function ScoreRing({ value, size = 56 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const shown = useCountUp(v);
  const mounted = useMounted();
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${v} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} className="stroke-secondary" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} strokeLinecap="round" stroke="currentColor" className={cn("score-anim", bandText[scoreBand(v)])} strokeDasharray={c} strokeDashoffset={mounted ? c - (v / 100) * c : c} />
      </svg>
      <span className="absolute font-mono text-[13px] font-semibold">{shown}</span>
    </div>
  );
}

export type StageStatus = "not_started" | "running" | "done" | "blocked";
export function StatusDot({ status, className }: { status: StageStatus; className?: string }) {
  const cls = {
    not_started: "bg-border",
    running: "bg-primary animate-run-pulse",
    done: "bg-verified",
    blocked: "bg-risk",
  }[status];
  return <span aria-hidden className={cn("inline-block size-2 rounded-full", cls, className)} />;
}

/** Small line illustration for empty states — a document with a magnifier finding a quote. */
function EmptyArt() {
  return (
    <svg width="72" height="56" viewBox="0 0 72 56" fill="none" aria-hidden className="text-muted-foreground/60">
      <rect x="6" y="4" width="34" height="44" rx="4" className="stroke-current" strokeWidth="1.5" />
      <path d="M13 14h20M13 21h20M13 28h12" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="50" cy="32" r="10" className="stroke-current" strokeWidth="1.5" />
      <path d="M57 39l7 7" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M45 32h10" className="stroke-verified" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({ title, line, action }: { title: string; line: string; action?: ReactNode }) {
  return (
    <div className="surface dot-grid flex flex-col items-center justify-center px-6 py-16 text-center">
      <EmptyArt />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{line}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export type RunStep = { label: string; state: "waiting" | "running" | "done" | "failed"; elapsed?: string; message?: string };
export function RunTimeline({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3">
          {i < steps.length - 1 && <span aria-hidden className="absolute left-[9px] top-6 h-[calc(100%-4px)] w-px bg-border" />}
          <span
            className={cn(
              "relative z-10 grid size-5 shrink-0 place-items-center rounded-full border",
              s.state === "waiting" && "border-border bg-card",
              s.state === "running" && "border-primary bg-primary/15 animate-run-pulse",
              s.state === "done" && "border-verified bg-verified text-primary-foreground",
              s.state === "failed" && "border-risk bg-risk text-primary-foreground",
            )}
          >
            {s.state === "done" && <Check className="size-3" aria-hidden />}
            {s.state === "failed" && <X className="size-3" aria-hidden />}
            {s.state === "running" && <span className="size-1.5 rounded-full bg-primary" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("text-sm", s.state === "waiting" ? "text-muted-foreground" : "font-medium")}>{s.label}</span>
              {s.elapsed && <span className="font-mono text-xs text-muted-foreground">{s.elapsed}</span>}
            </div>
            {s.state === "failed" && s.message && <p className="mt-0.5 text-xs text-risk">{s.message}</p>}
            <span className="sr-only">{s.state}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function EvidenceDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn("fixed inset-0 z-40 bg-foreground/20 transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-hidden={!open}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-card transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" tabIndex={open ? 0 : -1}>
            <X />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </>
  );
}
