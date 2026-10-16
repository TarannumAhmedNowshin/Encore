import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  motion, useScroll, useTransform, useMotionValue, useMotionValueEvent, useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Check, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceChip, Pill } from "@/components/encore/primitives";

/* Real lines from the Harrowgate Mutual sample SOW (fictional company). */
export const SOW_QUOTES = [
  { attr: "Pain point", text: "Claim documents wait an average of 2.6 business days before reaching the adjuster's file." },
  { attr: "Pain point", text: "About 18 percent of documents are attached to the wrong claim or sent to the wrong queue." },
  { attr: "Current process", text: "A team of 22 intake specialists manually reads each incoming document and keys the data into the claims system." },
];
const PERSONAS = ["VP Claims Operations", "Claims Executive Sponsor", "Intake Team Lead", "Claims IT Architect"];
const COMPANIES = [
  "State Farm", "Amica Mutual", "Tokio Marine", "Liberty Mutual", "Universal P&C", "Arbella",
  "American Family", "Great American", "The Hartford", "Acuity", "Auto-Owners", "American National",
];
const initials = (n: string) => n.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Cinematic only on wide screens without reduced motion; otherwise final states, stacked. */
function useCinematic() {
  const reduced = useReducedMotion();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide && !reduced;
}

function Scene({ cinematic, vh, eyebrow, title, children }: {
  cinematic: boolean; vh: number; eyebrow: string; title: string;
  children: (p: MotionValue<number>) => ReactNode;
}) {
  const done = useMotionValue(1);
  const head = (
    <div className="mx-auto max-w-3xl text-center">
      <p className="font-mono text-[13px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
      <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] sm:text-5xl">{title}</h2>
    </div>
  );
  if (!cinematic) {
    return (
      <section className="overflow-hidden px-gutter py-20">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5, ease: "easeOut" }}>
          {head}
          <div className="mx-auto mt-12 max-w-5xl">{children(done)}</div>
        </motion.div>
      </section>
    );
  }
  return <Sticky vh={vh} head={head}>{children}</Sticky>;
}
function Sticky({ vh, head, children }: { vh: number; head: ReactNode; children: (p: MotionValue<number>) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <section ref={ref} style={{ height: `${vh}vh` }} className="relative">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden px-gutter">
        {head}
        <div className="mx-auto mt-12 w-full max-w-5xl">{children(p)}</div>
      </div>
    </section>
  );
}

/* ---------- 1 Hero ---------- */
function HeroOrbit() {
  const dots = Array.from({ length: 28 }, (_, i) => {
    const ring = [180, 280, 380][i % 3] ?? 180;
    const a = (i * 137.5 * Math.PI) / 180;
    return { x: 500 + ring * Math.cos(a), y: 500 + ring * Math.sin(a), r: 2 + (i % 4) * 1.5, o: 0.25 + (i % 5) * 0.12 };
  });
  return (
    <svg viewBox="0 0 1000 1000" className="pointer-events-none absolute left-1/2 top-1/2 h-[140vmax] w-[140vmax] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-70" aria-hidden>
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <g className="orbit-spin">
        {[180, 280, 380].map((r) => <circle key={r} cx="500" cy="500" r={r} fill="none" className="stroke-ink-line" strokeDasharray="2 8" />)}
        {dots.map((d, i) => (
          <g key={i} opacity={d.o}>
            <circle cx={d.x} cy={d.y} r={d.r * 3} className="fill-primary" filter="url(#glow)" opacity="0.5" />
            <circle cx={d.x} cy={d.y} r={d.r} className="fill-primary" />
          </g>
        ))}
      </g>
    </svg>
  );
}

function Hero() {
  return (
    <section className="relative isolate flex min-h-[calc(100vh-4rem)] items-center overflow-hidden bg-ink text-ink-foreground">
      <HeroOrbit />
      <div className="relative mx-auto max-w-4xl px-gutter py-24 text-center">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
          Your last win already knows who to sell to next.
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-ink-muted">
          Upload one won SOW. Encore finds companies with the same problem, proves it with quoted evidence, maps who buys and drafts outreach you approve.
        </motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="mt-10 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg"><Link to="/demo">See it work — no sign-up <ArrowRight /></Link></Button>
          <Button asChild size="lg" variant="outline" className="border-ink-line bg-transparent text-ink-foreground hover:bg-ink-line hover:text-ink-foreground">
            <Link to="/auth" search={{ redirect: "/app/new" }}>Start with your SOW</Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- 2 Document ---------- */
function QuoteLine({ p, i, text }: { p: MotionValue<number>; i: number; text: string }) {
  const s = 0.12 + i * 0.25;
  const bg = useTransform(p, [s, s + 0.08], ["color-mix(in oklab, var(--primary) 0%, transparent)", "color-mix(in oklab, var(--primary) 18%, transparent)"]);
  return <motion.span style={{ backgroundColor: bg }} className="rounded px-0.5 text-foreground">{text}</motion.span>;
}
function FactCard({ p, i, q }: { p: MotionValue<number>; i: number; q: (typeof SOW_QUOTES)[number] }) {
  const s = 0.18 + i * 0.25;
  const opacity = useTransform(p, [s, s + 0.1], [0, 1]);
  const x = useTransform(p, [s, s + 0.12], [-80, 0]);
  return (
    <motion.div style={{ opacity, x }} className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{q.attr}</span>
        <EvidenceChip kind="verified" label="Verified quote" />
      </div>
      <p className="mt-2 font-mono text-[13px] leading-relaxed">“{q.text}”</p>
    </motion.div>
  );
}
function DocScene({ p }: { p: MotionValue<number> }) {
  const filler = "w-full h-2 rounded bg-muted";
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><FileText className="size-4" aria-hidden /> Harrowgate_SOW.pdf · page 3</div>
        <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          <div className={filler} /><div className={`${filler} w-4/5`} />
          {SOW_QUOTES.map((q, i) => (
            <p key={i}>Current state. <QuoteLine p={p} i={i} text={q.text} /> {i === 0 ? "Escalations rise in peak season." : ""}</p>
          ))}
          <div className={`${filler} w-3/5`} /><div className={filler} />
        </div>
      </div>
      <div className="space-y-4">{SOW_QUOTES.map((q, i) => <FactCard key={i} p={p} i={i} q={q} />)}</div>
    </div>
  );
}

/* ---------- 3 DNA ---------- */
function MiniFact({ p, i }: { p: MotionValue<number>; i: number }) {
  const y = useTransform(p, [0, 0.4], [(i - 1) * 90, 0]);
  const x = useTransform(p, [0, 0.4], [(i - 1) * 220, 0]);
  const opacity = useTransform(p, [0.3, 0.45], [1, 0]);
  return (
    <motion.div style={{ x, y, opacity }} className="absolute left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-3 font-mono text-[11px] shadow-sm">
      “{SOW_QUOTES[i]!.text.slice(0, 60)}…”
    </motion.div>
  );
}
function PersonaChip({ p, i, name }: { p: MotionValue<number>; i: number; name: string }) {
  const s = 0.5 + i * 0.1;
  const scale = useTransform(p, [s, s + 0.08], [0.4, 1]);
  const opacity = useTransform(p, [s, s + 0.06], [0, 1]);
  const pos = ["lg:-left-20 lg:-top-6", "lg:-right-24 lg:-top-6", "lg:-left-24 lg:-bottom-6", "lg:-right-16 lg:-bottom-6"][i];
  return (
    <motion.div style={{ scale, opacity }} className={`lg:absolute ${pos}`}>
      <Pill tone="primary">{name}</Pill>
    </motion.div>
  );
}
function DnaCard({ p }: { p: MotionValue<number> }) {
  const opacity = useTransform(p, [0.35, 0.5], [0, 1]);
  const scale = useTransform(p, [0.35, 0.5], [0.85, 1]);
  return (
    <motion.div style={{ opacity, scale }} className="mx-auto w-full max-w-md rounded-xl border border-primary/30 bg-card p-6 shadow-sm">
      <p className="font-mono text-[13px] text-primary">Sales DNA</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div><dt className="text-muted-foreground">Problem</dt><dd>Claim documents sit for days and land in the wrong queue.</dd></div>
        <div><dt className="text-muted-foreground">Driver</dt><dd>Board-approved Claims 2028 program.</dd></div>
        <div><dt className="text-muted-foreground">Owner</dt><dd>Claims Operations</dd></div>
      </dl>
    </motion.div>
  );
}
function DnaScene({ p }: { p: MotionValue<number> }) {
  return (
    <div className="relative mx-auto max-w-md py-10">
      <div className="hidden lg:block">{[0, 1, 2].map((i) => <MiniFact key={i} p={p} i={i} />)}</div>
      <DnaCard p={p} />
      <div className="mt-6 flex flex-wrap justify-center gap-2 lg:mt-0">
        {PERSONAS.map((n, i) => <PersonaChip key={n} p={p} i={i} name={n} />)}
      </div>
    </div>
  );
}

/* ---------- 4 Orbit ---------- */
function Bubble({ p, i, name }: { p: MotionValue<number>; i: number; name: string }) {
  const s = 0.15 + i * 0.055;
  const qualified = i < 11;
  const ring = [110, 150, 190][i % 3] ?? 110;
  const a = (i / COMPANIES.length) * Math.PI * 2 - Math.PI / 2;
  const cx = 250 + ring * Math.cos(a), cy = 250 + ring * Math.sin(a);
  const opacity = useTransform(p, [s, s + 0.05], [0, qualified ? 1 : 0.4]);
  const tx = useTransform(p, [s, s + 0.06], [(cx - 250) * 1.8, 0]);
  const ty = useTransform(p, [s, s + 0.06], [(cy - 250) * 1.8, 0]);
  return (
    <motion.g style={{ opacity, x: tx, y: ty }}>
      <circle cx={cx} cy={cy} r={qualified ? 20 : 15} className={qualified ? "fill-primary" : "fill-muted-foreground/40"} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" className="fill-primary-foreground font-mono">{initials(name)}</text>
      <title>{name}</title>
    </motion.g>
  );
}
function Counter({ p, from, to, max }: { p: MotionValue<number>; from: number; to: number; max: number }) {
  const v = useTransform(p, [from, to], [0, max]);
  const [n, setN] = useState(Math.round(v.get()));
  useMotionValueEvent(v, "change", (x) => setN(Math.round(x)));
  return <span className="font-mono tabular-nums">{n}</span>;
}
function OrbitScene({ p }: { p: MotionValue<number> }) {
  const shrink = useTransform(p, [0, 0.15], [1.6, 1]);
  const end = 0.15 + 11 * 0.055 + 0.06;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_220px]">
      <svg viewBox="0 0 500 500" className="mx-auto w-full max-w-[460px]" role="img" aria-label="Orbit of 12 look-alike insurers around the won deal">
        {[110, 150, 190].map((r) => <circle key={r} cx="250" cy="250" r={r} fill="none" className="stroke-border" strokeDasharray="3 6" />)}
        <motion.g style={{ scale: shrink, transformOrigin: "250px 250px" }}>
          <rect x="205" y="225" width="90" height="50" rx="12" className="fill-card stroke-primary" />
          <text x="250" y="255" textAnchor="middle" fontSize="13" className="fill-primary font-mono">DNA</text>
        </motion.g>
        {COMPANIES.map((c, i) => <Bubble key={c} p={p} i={i} name={c} />)}
      </svg>
      <div className="flex justify-center gap-10 lg:flex-col lg:gap-6">
        <div><p className="text-5xl font-semibold"><Counter p={p} from={0.15} to={end} max={12} /></p><p className="text-sm text-muted-foreground">found</p></div>
        <div><p className="text-5xl font-semibold text-primary"><Counter p={p} from={0.15} to={end - 0.055} max={11} /></p><p className="text-sm text-muted-foreground">qualified with verified evidence</p></div>
      </div>
    </div>
  );
}

/* ---------- 5 Committee ---------- */
const ROLES: Array<[string, string]> = [
  ["Executive buyer", "Claims Executive Sponsor"],
  ["Business sponsor", "VP Claims Operations"],
  ["Operational buyer", "Intake Team Lead"],
  ["Technical influencer", "Claims IT Architect"],
  ["End user", "Gap — no match found"],
];
function RoleCol({ p, i, role, who }: { p: MotionValue<number>; i: number; role: string; who: string }) {
  const s = 0.4 + i * 0.1;
  const opacity = useTransform(p, [s, s + 0.08], [0, 1]);
  const y = useTransform(p, [s, s + 0.08], [16, 0]);
  const gap = who.startsWith("Gap");
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{role}</p>
      <motion.div style={{ opacity, y }} className={`mt-3 rounded-md border p-2 text-xs ${gap ? "border-dashed border-border text-muted-foreground" : "border-primary/25 bg-primary/5"}`}>
        {!gap && <span className="mb-1 block font-mono text-[10px] text-primary">{initials(who)}</span>}
        {who}
      </motion.div>
    </div>
  );
}
function CommitteeScene({ p }: { p: MotionValue<number> }) {
  const bubbleScale = useTransform(p, [0, 0.3], [1, 8]);
  const bubbleOpacity = useTransform(p, [0.2, 0.32], [1, 0]);
  const boardOpacity = useTransform(p, [0.25, 0.38], [0, 1]);
  const boardScale = useTransform(p, [0.25, 0.38], [0.9, 1]);
  return (
    <div className="relative grid place-items-center">
      <motion.div style={{ scale: bubbleScale, opacity: bubbleOpacity }} className="absolute hidden size-16 place-items-center rounded-full bg-primary font-mono text-primary-foreground lg:grid" aria-hidden>SF</motion.div>
      <motion.div style={{ opacity: boardOpacity, scale: boardScale }} className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="mb-4 font-display font-semibold">State Farm · buying committee</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {ROLES.map(([r, w], i) => <RoleCol key={r} p={p} i={i} role={r} who={w} />)}
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- 6 Email ---------- */
const EMAIL: Array<{ t: string; src?: string }> = [
  { t: "Hi [First name], " },
  { t: "State Farm's own claims pages describe documents arriving by mail, fax and email", src: "statefarm.com" },
  { t: " — the same mix Harrowgate faced, where " },
  { t: "claim documents waited 2.6 business days before reaching the adjuster", src: "SOW p.3" },
  { t: ". Their aim now is to " },
  { t: "cut intake hours by 50 percent", src: "SOW p.7 · target" },
  { t: ". Worth a 20-minute look at how they set it up?" },
];
function EmailScene({ p }: { p: MotionValue<number> }) {
  const total = EMAIL.reduce((n, s) => n + s.t.length, 0);
  const chars = useTransform(p, [0.05, 0.75], [0, total]);
  const [n, setN] = useState(Math.round(chars.get()));
  useMotionValueEvent(chars, "change", (x) => setN(Math.round(x)));
  const glow = useTransform(p, [0.78, 0.9], ["0 0 0 0 transparent", "0 0 0 8px color-mix(in oklab, var(--primary) 25%, transparent)"]);
  let left = n;
  const sources = new Set<string>();
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
      <p className="text-sm text-muted-foreground">Subject: <span className="text-foreground">How Harrowgate stopped losing claim documents</span></p>
      <p className="mt-4 min-h-[9rem] text-[15px] leading-7">
        {EMAIL.map((s, i) => {
          const shown = s.t.slice(0, Math.max(0, left));
          const complete = left >= s.t.length;
          left -= s.t.length;
          if (!shown) return null;
          if (s.src && complete) sources.add(s.src);
          return s.src ? (
            <span key={i} className={complete ? "underline decoration-primary decoration-2 underline-offset-4" : ""}>{shown}</span>
          ) : <span key={i}>{shown}</span>;
        })}
        {n < total && <span className="ml-0.5 inline-block h-5 w-px translate-y-1 animate-pulse bg-foreground" aria-hidden />}
      </p>
      <div className="mt-4 flex min-h-8 flex-wrap gap-2">
        {[...sources].map((s) => (
          <motion.span key={s} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-[11px]">
            <Link2 className="size-3" aria-hidden /> {s}
          </motion.span>
        ))}
      </div>
      <div className="mt-6 flex justify-end">
        <motion.span style={{ boxShadow: glow }} className="rounded-md">
          <Button size="sm" tabIndex={-1}><Check /> Approve</Button>
        </motion.span>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export function LandingStory() {
  const cinematic = useCinematic();
  return (
    <>
      <Hero />
      <Scene cinematic={cinematic} vh={300} eyebrow="01 · Deal" title="It starts with one document.">{(p) => <DocScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={200} eyebrow="02 · Playbook" title="We learn why they bought.">{(p) => <DnaScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={250} eyebrow="03 · Accounts" title="Then we find who else has the same problem.">{(p) => <OrbitScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={200} eyebrow="04 · People" title="And who to talk to.">{(p) => <CommitteeScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={250} eyebrow="05 · Outreach" title="With words you can defend.">{(p) => <EmailScene p={p} />}</Scene>

      <section className="border-y border-border bg-card px-gutter py-24">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-3">
          {[
            ["100%", "of claims link to a source", "Every sentence is a verbatim quote or labelled AI inference."],
            ["0", "messages sent without you", "Encore drafts. You edit, approve or discard."],
            ["f(x)", "Scores are formulas you can read", "Fit and urgency come from counted signals, shown in full."],
          ].map(([n, h, d]) => (
            <motion.div key={h} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <p className="font-display text-6xl font-semibold text-primary lg:text-7xl">{n}</p>
              <p className="mt-3 text-xl font-semibold">{h}</p>
              <p className="mt-2 text-muted-foreground">{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="bg-ink px-gutter py-28 text-center text-ink-foreground">
        <h2 className="mx-auto max-w-3xl text-[32px] font-semibold leading-tight sm:text-5xl">See the whole pipeline on a real sample — 2 minutes, no sign-up.</h2>
        <Button asChild size="lg" className="mt-10"><Link to="/demo">See it work <ArrowRight /></Link></Button>
      </section>
    </>
  );
}
