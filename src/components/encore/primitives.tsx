import { useRef, type ReactNode } from "react";
import { Check, Quote, Sparkles, AlertTriangle, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  return <div className={cn("surface p-4 sm:p-6", className)}>{children}</div>;
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
    <span className={cn("chip", toneClass[tone], className)}>
      {typeof children === "string" ? <span className="truncate" title={children}>{children}</span> : children}
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
        "chip transition-colors hover:brightness-95 focus-visible:outline-2",
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

/**
 * The one side/bottom panel used app-wide (Radix Dialog): closes on outside click and Esc,
 * traps focus while open and returns focus to whatever opened it.
 */
export function Panel({ open, onClose, title, label, side = "right", width = "sm:max-w-[480px]", header, bodyClassName, children }: {
  open: boolean; onClose: () => void; title: ReactNode; label?: string; side?: "right" | "bottom"; width?: string;
  header?: ReactNode; bodyClassName?: string; children: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  if (open && !opener.current && typeof document !== "undefined") opener.current = document.activeElement as HTMLElement | null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/20 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-encore-panel
          aria-label={label ?? (typeof title === "string" ? title : undefined)}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => { const el = opener.current; opener.current = null; if (el && el.isConnected && el !== document.body) { e.preventDefault(); el.focus(); } }}
          onInteractOutside={(e) => { if ((e.target as Element | null)?.closest?.("[data-tour-ui]")) e.preventDefault(); }}
          className={cn(
            "fixed z-50 flex flex-col border-border bg-card shadow-sm outline-none",
            side === "right"
              ? cn("inset-y-0 right-0 w-full border-l data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-200", width)
              : "inset-x-0 bottom-0 h-[92dvh] rounded-t-xl border-t data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-200",
          )}
        >
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-base font-semibold">{title}</DialogPrimitive.Title>
              {header}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close" className="shrink-0"><X /></Button>
            </DialogPrimitive.Close>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto p-4 sm:p-6", bodyClassName)}>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function EvidenceDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <Panel open={open} onClose={onClose} title={title}>{children}</Panel>;
}

/** Phone-only sticky bar holding a stage's main action; desktop keeps the action in the page header. */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 sm:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-card/95 p-3 backdrop-blur sm:hidden [&>*]:flex-1">{children}</div>
    </>
  );
}
