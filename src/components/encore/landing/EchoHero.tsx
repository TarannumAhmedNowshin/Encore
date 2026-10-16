import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { loadDemo } from "@/lib/encore/demo-db";
import { heroData, keyPhrase, numberWord, type HeroData } from "@/lib/encore/hero";

const initials = (n: string) => n.split(/[\s&]+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const INDENT = ["ml-0", "ml-[10px] md:ml-[18px]", "ml-[20px] md:ml-[36px]"];
const OPACITY = [1, 0.9, 0.78];

function useCountTo(target: number, run: boolean) {
  const [n, setN] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) { setN(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / 1400); setN(Math.round(target * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
}

export function EchoHero() {
  const reduced = useReducedMotion() ?? false;
  const [data, setData] = useState<HeroData | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    loadDemo().then((s) => { if (alive) { const h = heroData(s); h ? setData(h) : setFailed(true); } }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  const echoes = data?.echoes ?? [];
  const pages = Math.max(1, Math.ceil(echoes.length / 3));
  useEffect(() => {
    if (reduced || pages < 2) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), 4000 + 3 * 700);
    return () => clearInterval(id);
  }, [reduced, pages]);
  const shown = echoes.slice(page * 3, page * 3 + 3);

  // Before data arrives (or if it fails) the document card shows the sample's own SOW sentence.
  const sentence = data?.sentence ?? "";
  const [a, b] = data?.highlight ?? keyPhrase(sentence);
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 500); return () => clearTimeout(t); }, []);
  const count = useCountTo(data?.qualified ?? 0, !reduced && !!data);

  return (
    <section className="hero-ruled relative overflow-hidden">
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-gutter pb-16 pt-8 md:grid-cols-[1.05fr_1fr] md:gap-10 md:pb-20 md:pt-12 lg:min-h-[calc(100svh-4rem)]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-wider text-muted-foreground">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-verified" />
            {data ? `One signed deal · ${numberWord(data.qualified)} look-alikes · every claim sourced` : "One signed deal · look-alikes · every claim sourced"}
          </p>
          <h1 className="mt-5 font-display text-[44px] font-semibold leading-[.95] tracking-[-0.045em] md:text-[clamp(44px,6.4vw,92px)]">
            Your last{" "}
            <span className="relative inline-block text-[#3D3BF3]">
              <span aria-hidden className="absolute inset-0 -translate-x-[.32em] opacity-[.12]">win</span>
              <span aria-hidden className="absolute inset-0 -translate-x-[.16em] opacity-[.28]">win</span>
              <span className="relative">win</span>
            </span>{" "}
            already knows who to sell to next.
          </h1>
          <p className="mt-6 max-w-[34em] text-[17px] leading-relaxed text-muted-foreground md:text-[19px]">
            Drop in one won statement of work. Encore reads why they bought, finds companies saying the same thing in public, quotes them word for word and drafts outreach you approve.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/demo" className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-[15px] font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              See it work — no sign-up →
            </Link>
            <Link to="/auth" search={{ redirect: "/app/new" }} className="inline-flex h-12 items-center justify-center rounded-full border border-foreground/80 px-6 text-[15px] font-medium transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Start with your SOW
            </Link>
          </div>
          {data && (
            <p className="mt-6 font-mono text-[13px] text-muted-foreground">
              Sample run: <span className="text-foreground">{data.facts}</span> facts · <span className="text-foreground">{data.qualified}</span> qualified accounts · <span className="text-foreground">{data.sent}</span> emails sent without you
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="hero-doc rounded-md border border-border bg-card p-5 shadow-[0_18px_40px_-24px_rgb(22_22_29/.35)] md:p-6">
            <div className="flex justify-between gap-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="truncate">{data?.filename ?? "Won SOW"}</span>
              <span className="shrink-0 normal-case">your won deal</span>
            </div>
            <p className="mt-3 font-serif-doc text-[18px] leading-snug md:text-[21px]">
              {sentence.slice(0, a)}
              <span className={`hero-mark ${reduced ? "is-on is-instant" : on ? "is-on" : ""}`}>{sentence.slice(a, b)}</span>
              {sentence.slice(b)}
            </p>
          </div>

          {!failed && shown.length > 0 && (
            <div className="relative mt-5 pl-5 md:pl-6">
              <span aria-hidden className="absolute bottom-6 left-[7px] top-0 w-px bg-gradient-to-b from-[#3D3BF3]/60 to-transparent md:left-[9px]" />
              <div aria-live="polite">
                <AnimatePresence mode="wait">
                  <motion.div key={page} className="space-y-3" exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.4 } }}>
                    {shown.map((e, i) => (
                      <motion.div key={e.name} className={`${INDENT[i]} flex min-w-0 gap-3`}
                        initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: OPACITY[i] ?? 1, y: 0 }}
                        transition={{ duration: 0.45, delay: reduced ? 0 : 1.6 + i * 0.7, ease: "easeOut" }}>
                        <span aria-hidden className="mt-2 grid size-7 shrink-0 place-items-center rounded-full border border-[#3D3BF3] bg-background font-mono text-[10px] text-[#3D3BF3]">{initials(e.name)}</span>
                        <div className="min-w-0 flex-1 rounded-md border border-border bg-card/90 px-4 py-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <span className="min-w-0 truncate font-mono text-[12px]">{e.name}</span>
                            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-verified"><Check className="size-3" aria-hidden />found word for word</span>
                          </div>
                          <p className="mt-1.5 break-words font-serif-doc text-[15px] italic leading-snug md:text-[16px]">“{e.quote}”</p>
                          {e.domain && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{e.domain}</p>}
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
              <p className="mt-5 flex items-baseline gap-3">
                <span className="font-display text-[40px] font-semibold leading-none tracking-tight">{count}</span>
                <span className="text-sm text-muted-foreground">companies with the same problem</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
