import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Pause, Play, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/encore/primitives";
import { cn } from "@/lib/utils";
import { loadDemo } from "@/lib/encore/demo-db";
import { DEMO_ID, type DemoSnapshot } from "@/lib/encore/demo";
import { TOUR_STEPS, demoStats, type DemoStats } from "@/lib/encore/tour";

const STEP_MS = 8000;

/** Public guided demo: slim banner, the real stage pages in read-only mode, and the guided tour. */
export function DemoShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 text-sm sm:px-gutter">
          <Link to="/" className="rounded-md" aria-label="Encore home"><Logo /></Link>
          <span className="min-w-0 truncate text-muted-foreground">
            Guided demo · Harrowgate Mutual <span className="hidden sm:inline">(fictional)</span>
          </span>
          <Link to="/auth" className="ml-auto inline-flex items-center gap-1 rounded-md font-medium text-primary hover:underline">
            <span className="hidden sm:inline">Run it on your own deal</span><span className="sm:hidden">Try yours</span> <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col pb-56 sm:pb-0">
        <Outlet />
      </div>
      <GuidedTour />
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function waitFor<T>(fn: () => T | null | undefined, ms = 8000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

function closeOverlays(keepQuote: boolean) {
  document.querySelectorAll<HTMLButtonElement>('aside[role="dialog"][aria-hidden="false"] button[aria-label="Close"]').forEach((b) => b.click());
  if (!keepQuote) document.querySelector<HTMLButtonElement>('[aria-label="Quote in document"] button[aria-label="Close"]')?.click();
}

type Note = { id: number; text: string };

function GuidedTour() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Deep links start the tour at that page's first step.
  const [step, setStep] = useState(() => {
    const sub = pathname.replace(`/app/a/${DEMO_ID}`, "").replace(/^\//, "").replace(/\/$/, "");
    return Math.max(0, TOUR_STEPS.findIndex((x) => x.path === sub));
  });
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);
  const [auto, setAuto] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<DemoStats | null>(null);
  const target = useRef<Element | null>(null);
  const run = useRef(0);

  useEffect(() => { void loadDemo().then((s: DemoSnapshot) => setStats(demoStats(s))).catch(() => undefined); }, []);

  const note = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setNotes((n) => [...n.slice(-2), { id, text }]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 4200);
  }, []);

  // Run the current step: navigate, perform its action, then spotlight its element.
  useEffect(() => {
    if (!open || done) { target.current = null; setRect(null); return; }
    const me = ++run.current;
    const s = TOUR_STEPS[step]!;
    const alive = () => run.current === me;
    (async () => {
      target.current = null; setRect(null);
      closeOverlays(s.key === "deal");
      const path = `/app/a/${DEMO_ID}${s.path ? `/${s.path}` : ""}`;
      if (pathname !== path) await navigate({ to: path as "/app/a/$id", params: { id: DEMO_ID } as never });
      if (s.action) await s.action({ waitFor, note, stats, reduced: prefersReducedMotion(), alive });
      const el = await waitFor(s.find);
      if (!alive() || !el) return;
      el.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      target.current = el;
      const n = s.note?.(stats);
      if (n) note(n);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, open, done]);

  // Keep the spotlight on its element while the page scrolls or resizes.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = target.current;
      setRect((prev) => {
        const r = el?.getBoundingClientRect() ?? null;
        if (!r || !prev || r.top !== prev.top || r.left !== prev.left || r.width !== prev.width || r.height !== prev.height) return r;
        return prev;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!auto || !open || done) return;
    const t = setTimeout(() => (step < TOUR_STEPS.length - 1 ? setStep(step + 1) : (setDone(true), setAuto(false))), STEP_MS);
    return () => clearTimeout(t);
  }, [auto, step, open, done]);

  const next = () => (step < TOUR_STEPS.length - 1 ? setStep(step + 1) : setDone(true));
  const back = () => setStep(Math.max(0, step - 1));
  const replay = () => { setDone(false); setOpen(true); setStep(0); };
  const s = TOUR_STEPS[step]!;
  const pad = 8;

  return (
    <>
      {rect && open && !done && (
        <div aria-hidden className="tour-spot pointer-events-none fixed z-[60] rounded-xl"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-stretch gap-2 p-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:p-0">
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          {notes.map((n) => (
            <div key={n.id} className="tour-note pointer-events-auto flex items-center gap-2 self-end rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
              <Sparkles className="size-3.5 text-primary" aria-hidden /> <span className="font-mono">{n.text}</span>
            </div>
          ))}
        </div>

        {!open ? (
          <Button className="pointer-events-auto self-end" size="sm" onClick={() => setOpen(true)}><Play /> Resume tour</Button>
        ) : done ? (
          <section aria-label="Guided tour finished" className="surface pointer-events-auto rounded-t-2xl p-5 sm:rounded-xl">
            <h2 className="text-lg font-semibold">Run it on your own deal</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload one won SOW and Encore builds the playbook, the accounts, the people and the drafts — every claim tied to a source.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild><Link to="/auth">Run it on your own deal <ArrowRight /></Link></Button>
              <Button variant="outline" onClick={replay}><RotateCcw /> Replay tour</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Explore freely</Button>
            </div>
          </section>
        ) : (
          <section aria-label="Guided tour" className="surface pointer-events-auto rounded-t-2xl p-5 sm:rounded-xl">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted-foreground">Step {step + 1} of {TOUR_STEPS.length} · {s.stage}</span>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Skip tour" onClick={() => { setOpen(false); setAuto(false); }}><X /></Button>
            </div>
            <h2 className="mt-1 text-base font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            <div className="mt-4 flex items-center gap-1.5" aria-hidden>
              {TOUR_STEPS.map((x, i) => (
                <span key={x.key} className={cn("h-1.5 rounded-full transition-all duration-200", i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-border")} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={back} disabled={step === 0}>Back</Button>
              <Button size="sm" onClick={next}>{step === TOUR_STEPS.length - 1 ? "Finish" : "Next"}</Button>
              <Button size="sm" variant="outline" className="ml-auto" aria-pressed={auto} onClick={() => setAuto((a) => !a)}>
                {auto ? <Pause /> : <Play />} Auto-play
              </Button>
              <Button size="sm" variant="link" className="px-1" onClick={() => { setOpen(false); setAuto(false); }}>Skip</Button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
