import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadDemo } from "@/lib/encore/demo-db";
import { storyData, type StoryData, type StoryQuote } from "@/lib/encore/hero";
import { Link } from "@tanstack/react-router";
import {
  motion, useScroll, useTransform, useMotionValue, useMotionValueEvent, useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Check, FileText, Link2 } from "lucide-react";
import { EchoHero } from "./EchoHero";
import { Button } from "@/components/ui/button";
import { EvidenceChip, GapCard, Pill } from "@/components/encore/primitives";

/* Every quote, name and number in the story comes from the public demo snapshot. */
const StoryCtx = createContext<StoryData | null>(null);
const useStory = () => useContext(StoryCtx);
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
      <p className="font-mono text-[13px] uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 className="mt-4 text-[32px] font-semibold leading-[1.1] sm:text-5xl">{title}</h2>
    </div>
  );
  if (!cinematic) {
    return (
      <section className="overflow-hidden px-gutter py-12">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5, ease: "easeOut" }}>
          {head}
          <div className="mx-auto mt-8 max-w-5xl">{children(done)}</div>
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
        <div className="mx-auto mt-8 w-full max-w-5xl">{children(p)}</div>
      </div>
    </section>
  );
}

/* ---------- 2 Document ---------- */
function QuoteLine({ p, i, text }: { p: MotionValue<number>; i: number; text: string }) {
  const s = 0.12 + i * 0.25;
  const bg = useTransform(p, [s, s + 0.08], ["color-mix(in oklab, var(--accent) 0%, transparent)", "color-mix(in oklab, var(--accent) 18%, transparent)"]);
  return <motion.span style={{ backgroundColor: bg }} className="rounded px-0.5 text-foreground">{text}</motion.span>;
}
function FactCard({ p, i, q }: { p: MotionValue<number>; i: number; q: StoryQuote }) {
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
  const d = useStory();
  const filler = "w-full h-2 rounded bg-muted";
  const quotes = d?.quotes ?? [];
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><FileText className="size-4 shrink-0" aria-hidden /> <span className="truncate">{d?.filename ?? "Won SOW"}</span></div>
        <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          <div className={filler} /><div className={`${filler} w-4/5`} />
          {quotes.map((q, i) => (
            <div key={i} className="space-y-3"><p><QuoteLine p={p} i={i} text={q.text} /></p><div className={`${filler} w-3/5`} /></div>
          ))}
          <div className={filler} />
        </div>
      </div>
      <div className="space-y-4">{quotes.map((q, i) => <FactCard key={i} p={p} i={i} q={q} />)}</div>
    </div>
  );
}

/* ---------- 3 DNA ---------- */
function MiniFact({ p, i, text }: { p: MotionValue<number>; i: number; text: string }) {
  const y = useTransform(p, [0, 0.4], [(i - 1) * 90, 0]);
  const x = useTransform(p, [0, 0.4], [(i - 1) * 220, 0]);
  const opacity = useTransform(p, [0.3, 0.45], [1, 0]);
  return (
    <motion.div style={{ x, y, opacity }} className="absolute left-1/2 top-1/2 w-56 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-3 font-mono text-[11px] shadow-sm">
      “{text}”
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
  const dna = useStory()?.dna;
  const opacity = useTransform(p, [0.35, 0.5], [0, 1]);
  const scale = useTransform(p, [0.35, 0.5], [0.85, 1]);
  return (
    <motion.div style={{ opacity, scale }} className="mx-auto w-full max-w-md rounded-xl border border-accent/30 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2"><p className="font-mono text-[13px] text-accent">Sales DNA</p><EvidenceChip kind="inference" /></div>
      <dl className="mt-3 space-y-2 text-sm">
        {dna && <>
          <div><dt className="text-muted-foreground">Problem</dt><dd>{dna.problem}</dd></div>
          <div><dt className="text-muted-foreground">Outcome</dt><dd>{dna.outcome}</dd></div>
          <div><dt className="text-muted-foreground">Owner</dt><dd>{dna.owner}</dd></div>
        </>}
      </dl>
    </motion.div>
  );
}
function DnaScene({ p }: { p: MotionValue<number> }) {
  const d = useStory();
  return (
    <div className="relative mx-auto max-w-md py-10">
      <div className="hidden lg:block">{(d?.quotes ?? []).map((q, i) => <MiniFact key={i} p={p} i={i} text={q.text.length > 60 ? `${q.text.slice(0, q.text.lastIndexOf(" ", 60))}…` : q.text} />)}</div>
      <DnaCard p={p} />
      <div className="mt-6 flex flex-wrap justify-center gap-2 lg:mt-0">
        {(d?.personas ?? []).map((n, i) => <PersonaChip key={n} p={p} i={i} name={n} />)}
      </div>
    </div>
  );
}

/* ---------- 4 Orbit ---------- */
function Bubble({ p, i, name, status, total }: { p: MotionValue<number>; i: number; name: string; status: string; total: number }) {
  const s = 0.15 + i * 0.055;
  const ring = [110, 150, 190][i % 3] ?? 110;
  const a = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
  const cx = 250 + ring * Math.cos(a), cy = 250 + ring * Math.sin(a);
  const qualified = status === "qualified";
  const watch = status === "watch";
  const opacity = useTransform(p, [s, s + 0.05], [0, qualified ? 1 : watch ? 0.75 : 0.4]);
  const tx = useTransform(p, [s, s + 0.06], [(cx - 250) * 1.8, 0]);
  const ty = useTransform(p, [s, s + 0.06], [(cy - 250) * 1.8, 0]);
  const fill = qualified ? "fill-accent" : watch ? "fill-inference" : "fill-muted-foreground/40";
  return (
    <motion.g style={{ opacity, x: tx, y: ty }} className="group">
      <circle cx={cx} cy={cy} r={qualified ? 20 : 15} className={fill} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" className={qualified || watch ? "fill-accent-foreground font-mono" : "fill-muted-foreground font-mono"}>{initials(name)}</text>
      <text x={cx} y={cy - (qualified ? 28 : 22)} textAnchor="middle" fontSize="12" className="fill-foreground font-medium opacity-0 transition-opacity group-hover:opacity-100">{name}</text>
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
  const d = useStory();
  const companies = d?.companies ?? [];
  const shrink = useTransform(p, [0, 0.15], [1.6, 1]);
  const end = 0.15 + Math.max(0, companies.length - 1) * 0.055 + 0.06;
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_220px]">
      <svg viewBox="0 0 500 500" className="mx-auto w-full max-w-[460px]" role="img" aria-label={`Orbit of ${d?.found ?? 0} look-alike companies around the won deal`}>
        {[110, 150, 190].map((r) => <circle key={r} cx="250" cy="250" r={r} fill="none" className="stroke-border" strokeDasharray="3 6" />)}
        <motion.g style={{ scale: shrink, transformOrigin: "250px 250px" }}>
          <rect x="205" y="225" width="90" height="50" rx="12" className="fill-card stroke-accent" />
          <text x="250" y="255" textAnchor="middle" fontSize="13" className="fill-accent font-mono">DNA</text>
        </motion.g>
        {companies.map((c, i) => <Bubble key={c.name} p={p} i={i} name={c.name} status={c.status} total={companies.length} />)}
      </svg>
      <div className="flex justify-center gap-10 lg:flex-col lg:gap-6">
        <div><p className="text-5xl font-semibold"><Counter p={p} from={0.15} to={end} max={d?.found ?? 0} /></p><p className="text-sm text-muted-foreground">found</p></div>
        <div><p className="text-5xl font-semibold text-accent"><Counter p={p} from={0.15} to={end - 0.055} max={d?.qualified ?? 0} /></p><p className="text-sm text-muted-foreground">qualified with verified evidence</p></div>
      </div>
    </div>
  );
}

/* ---------- 5 Committee ---------- */
function RoleCol({ p, i, role, who: w }: { p: MotionValue<number>; i: number; role: string; who: string | null }) {
  const s = 0.4 + i * 0.1;
  const opacity = useTransform(p, [s, s + 0.08], [0, 1]);
  const y = useTransform(p, [s, s + 0.08], [16, 0]);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{role}</p>
      <motion.div style={{ opacity, y }} className="mt-3">
        {w == null ? <GapCard className="py-3" /> : (
          <div className="rounded-md border border-accent/25 bg-accent/5 p-2 text-xs">
            <span className="mb-1 block font-mono text-[10px] text-accent">{initials(w)}</span>
            {w}
          </div>
        )}
      </motion.div>
    </div>
  );
}
function CommitteeScene({ p }: { p: MotionValue<number> }) {
  const c = useStory()?.committee;
  const bubbleScale = useTransform(p, [0, 0.3], [1, 8]);
  const bubbleOpacity = useTransform(p, [0.2, 0.32], [1, 0]);
  const boardOpacity = useTransform(p, [0.25, 0.38], [0, 1]);
  const boardScale = useTransform(p, [0.25, 0.38], [0.9, 1]);
  return (
    <div className="relative grid place-items-center">
      <motion.div style={{ scale: bubbleScale, opacity: bubbleOpacity }} className="absolute hidden size-16 place-items-center rounded-full bg-accent font-mono text-accent-foreground lg:grid" aria-hidden>{c ? initials(c.company) : ""}</motion.div>
      <motion.div style={{ opacity: boardOpacity, scale: boardScale }} className="w-full rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="mb-4 font-display font-semibold">{c?.company ?? "Top account"} · buying committee</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {(c?.slots ?? []).map((x, i) => <RoleCol key={x.role} p={p} i={i} role={x.role} who={x.who} />)}
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- 6 Email ---------- */
/** Split a real draft body into plain and verified-claim segments. */
function segments(body: string, claims: string[]): Array<{ t: string; src?: string }> {
  const out: Array<{ t: string; src?: string }> = [];
  let rest = body;
  while (rest) {
    const hits = claims.map((c) => ({ c, i: rest.indexOf(c) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
    const h = hits[0];
    if (!h) { out.push({ t: rest }); break; }
    if (h.i) out.push({ t: rest.slice(0, h.i) });
    out.push({ t: h.c, src: `Verified claim ${out.filter((x) => x.src).length + 1}` });
    rest = rest.slice(h.i + h.c.length);
  }
  return out;
}
function EmailScene({ p }: { p: MotionValue<number> }) {
  const e = useStory()?.email;
  const EMAIL = e ? segments(e.body, e.claims) : [];
  const total = EMAIL.reduce((n, s) => n + s.t.length, 0);
  const chars = useTransform(p, [0.05, 0.75], [0, total]);
  const [n, setN] = useState(Math.round(chars.get()));
  useMotionValueEvent(chars, "change", (x) => setN(Math.round(x)));
  const glow = useTransform(p, [0.78, 0.9], ["0 0 0 0 transparent", "0 0 0 8px color-mix(in oklab, var(--accent) 25%, transparent)"]);
  let left = n;
  const sources = new Set<string>();
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
      <p className="text-sm text-muted-foreground">Subject: <span className="text-foreground">{e?.subject ?? ""}</span></p>
      <p className="mt-4 min-h-[9rem] text-[15px] leading-7">
        {EMAIL.map((s, i) => {
          const shown = s.t.slice(0, Math.max(0, left));
          const complete = left >= s.t.length;
          left -= s.t.length;
          if (!shown) return null;
          if (s.src && complete) sources.add(s.src);
          return s.src ? (
            <span key={i} className={complete ? "underline decoration-accent decoration-2 underline-offset-4" : ""}>{shown}</span>
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
  const [data, setData] = useState<StoryData | null>(null);
  useEffect(() => { let alive = true; loadDemo().then((s) => alive && setData(storyData(s))).catch(() => {}); return () => { alive = false; }; }, []);
  return (
    <StoryCtx.Provider value={data}>
      <EchoHero />
      <Scene cinematic={cinematic} vh={210} eyebrow="01 · Deal" title="It starts with one document.">{(p) => <DocScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={150} eyebrow="02 · Playbook" title="We learn why they bought.">{(p) => <DnaScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={180} eyebrow="03 · Accounts" title="Then we find who else has the same problem.">{(p) => <OrbitScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={150} eyebrow="04 · People" title="And who to talk to.">{(p) => <CommitteeScene p={p} />}</Scene>
      <Scene cinematic={cinematic} vh={180} eyebrow="05 · Outreach" title="With words you can defend.">{(p) => <EmailScene p={p} />}</Scene>

      <section className="border-y border-border bg-card px-gutter py-24">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-3">
          {[
            [data ? `${data.groundedPct}%` : "—", "of sample drafts fully grounded in sources", "Every sentence is a verbatim quote or labelled AI inference."],
            [data ? String(data.sent) : "—", "messages sent without you", "Encore drafts. You edit, approve or discard."],
            ["f(x)", "Scores are formulas you can read", "Fit and urgency come from counted signals, shown in full."],
          ].map(([n, h, d]) => (
            <motion.div key={h} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <p className="font-display text-6xl font-semibold text-accent lg:text-7xl">{n}</p>
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
    </StoryCtx.Provider>
  );
}
