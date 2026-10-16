import { useEffect, useRef, useState } from "react";
import { orbitRadius, faviconUrl, initials, orbitLayout, ringFrac, visibleLabels, type AccountRow, type OrbitGroup } from "@/lib/encore/accounts";
import { cn } from "@/lib/utils";
import { usePanZoom, ZoomControls } from "@/components/encore/PanZoom";

type T = AccountRow & { evidence: unknown };
const FILL: Record<OrbitGroup, string> = {
  qualified: "var(--verified)", watch: "var(--inference)", rejected: "var(--muted-foreground)", failed: "transparent", pending: "var(--muted)",
};
export const GROUP_COLOR = FILL;

function topQuote(t: T): string | null {
  const ev = Array.isArray(t.evidence) ? (t.evidence as { quote?: string; verified?: boolean }[]) : [];
  const q = ev.find((e) => e.verified)?.quote;
  return q ? (q.length > 140 ? `${q.slice(0, 140)}…` : q) : null;
}

export function AccountOrbit({ targets, center, onOpen }: { targets: T[]; center: string; onOpen: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<{ t: T; x: number; y: number } | null>(null);
  const seen = useRef(new Map<string, string>());
  // The guided demo replays the discovery animation: every bubble flies in again, one by one.
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    const on = () => setReplay((r) => r + 1);
    window.addEventListener("encore:replay-orbit", on);
    return () => window.removeEventListener("encore:replay-orbit", on);
  }, []);

  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(280, e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const h = w < 640 ? Math.round(w * 1.05) : Math.max(520, Math.min(760, w * 0.7));
  const outer = Math.min(w, h) / 2 - (w < 640 ? 24 : 40);
  const cx = w / 2, cy = h / 2;
  const inner = 48;
  const nodes = orbitLayout(targets, outer, inner);
  const pz = usePanZoom(w, h);
  const clickT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { k } = pz.view;
  const sx = (x: number) => x * k + pz.view.x, sy = (y: number) => y * k + pz.view.y;
  const short = (n: string | null) => { const s = n ?? ""; return s.length > 18 ? `${s.slice(0, 18)}…` : s; };
  // Qualified first (best first), then the rest; a label that would overlap one already placed is hidden.
  const labelled = visibleLabels(nodes.filter((n) => n.group === "qualified")
    .map((n) => ({ id: n.t.id, x: (cx + n.x) * k, y: (cy + n.y + n.r) * k + 10, w: short(n.t.name).length * 6.2 + 6 })));

  // A bubble animates in only when it is new or its status changed since last render.
  const fresh = new Set<string>();
  for (const n of nodes) { const k = `${n.t.status}|${n.t.on_watch_list}`; if (seen.current.get(n.t.id) !== k) fresh.add(n.t.id); }
  useEffect(() => { for (const n of nodes) seen.current.set(n.t.id, `${n.t.status}|${n.t.on_watch_list}`); });

  return (
    <div ref={box} className="relative w-full">
      <ZoomControls onIn={() => pz.zoomBy(1.4)} onOut={() => pz.zoomBy(1 / 1.4)} onFit={pz.fit} />
      <svg ref={pz.ref} width="100%" height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Companies arranged by similarity to your won deal" className="block select-none" {...pz.handlers}>
        <g transform={pz.transform}>
        {([90, 70, 50] as const).map((sim) => {
          const f = sim; const label = `${sim}%`;
          const r = orbitRadius(ringFrac(sim), inner, outer);
          return (
            <g key={f}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeDasharray="3 4" />
              <text x={cx + r * 0.71 + 4} y={cy - r * 0.71 - 4} className="fill-muted-foreground font-mono" fontSize={10 / Math.sqrt(k)}>{label}</text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={outer} fill="none" stroke="var(--border)" strokeOpacity={0.5} />
        {nodes.filter((n) => n.group === "qualified").map((n) => (
          <line key={`l-${n.t.id}`} x1={cx} y1={cy} x2={cx + n.x} y2={cy + n.y} stroke="var(--verified)" strokeOpacity={0.45}
            strokeWidth={0.5 + ((n.t.evidence_score ?? 0) / 100) * 3.5} />
        ))}
        <g>
          <circle cx={cx} cy={cy} r={8} fill="var(--primary)" />
          <text x={cx} y={cy + 24} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-foreground">{short(center)}</text>
          <title>{center} — your won deal</title>
        </g>
        {nodes.map((n, idx) => {
          const fav = faviconUrl(n.t.website);
          const faded = n.group === "rejected" || n.group === "failed";
          const pending = n.group === "pending";
          const s = Math.round(n.r * 1.1);
          return (
            <g key={n.t.id} transform={`translate(${cx + n.x} ${cy + n.y})`} className="cursor-pointer" opacity={faded ? 0.55 : 1}
              onMouseEnter={() => setHover({ t: n.t, x: sx(cx + n.x), y: sy(cy + n.y) })} onMouseLeave={() => setHover(null)}
              onClick={() => { if (pz.moved()) return; const id = n.t.id; clearTimeout(clickT.current); clickT.current = setTimeout(() => onOpen(id), 230); }} onDoubleClick={(e) => { e.stopPropagation(); clearTimeout(clickT.current); pz.focus(cx + n.x, cy + n.y, Math.max(2.5, k * 1.5)); }} tabIndex={0} role="button" aria-label={n.t.name ?? "Company"}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(n.t.id)}>
              <g key={replay} className={cn((fresh.has(n.t.id) || replay > 0) && "orbit-in", pending && "animate-run-pulse")}
                style={replay > 0 ? { animationDelay: `${idx * 220}ms` } : undefined}>
                {n.t.in_target_region && <circle r={n.r + 3} fill="none" stroke="var(--primary)" strokeWidth={2} />}
                <circle r={n.r} fill={FILL[n.group]} fillOpacity={n.group === "failed" ? 0 : 0.9}
                  stroke={n.group === "failed" ? "var(--risk)" : "var(--card)"} strokeWidth={n.group === "failed" ? 2 : 1.5} />
                <circle r={n.r - 3} fill="var(--card)" />
                {fav ? <image href={fav} x={-s / 2} y={-s / 2} width={s} height={s} />
                  : <text textAnchor="middle" dy="0.35em" fontSize={Math.max(9, n.r * 0.6)} fontWeight={600} className="fill-foreground">{initials(n.t.name)}</text>}
              </g>
              {hover?.t.id !== n.t.id && labelled.has(n.t.id) && (
                <text y={n.r + 14 / k} textAnchor="middle" fontSize={11 / k} className="fill-foreground">{short(n.t.name)}</text>
              )}
            </g>
          );
        })}
        </g>
      </svg>
      {hover && (
        <div className="surface pointer-events-none absolute z-10 w-64 p-3 text-xs"
          style={{ left: Math.min(w - 264, Math.max(0, hover.x + 16)), top: Math.max(0, hover.y - 20) }}>
          <div className="font-medium">{hover.t.name}</div>
          <div className="text-muted-foreground">{hover.t.hq_country ?? "HQ unknown"}</div>
          <div className="mt-1 font-mono">Similarity {hover.t.similarity_percent ?? 0}% · Evidence {hover.t.evidence_score ?? 0} · Opp {hover.t.opportunity_score ?? 0}</div>
          {topQuote(hover.t) && <p className="mt-1.5 border-l-2 border-border pl-2 font-mono text-[11px] text-muted-foreground">"{topQuote(hover.t)}"</p>}
        </div>
      )}
    </div>
  );
}

export function OrbitLegend() {
  const items: [string, string, boolean?][] = [["Qualified", "var(--verified)"], ["Watch list", "var(--inference)"], ["Rejected", "var(--muted-foreground)"], ["Failed", "var(--risk)", true]];
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map(([l, c, outline]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={outline ? { border: `2px solid ${c}` } : { background: c }} />{l}
        </span>
      ))}
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-primary" /> In target region</span>
      <span>Closer = more similar · Size = opportunity · Line = evidence</span>
    </div>
  );
}
