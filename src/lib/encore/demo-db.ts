// Read-only stand-in for the database client, fed by the public demo snapshot.
// Stage pages call dbFor(id): the real client normally, this one for the demo id.
import { supabase } from "@/integrations/supabase/client";
import { getDemo } from "./demo.functions";
import { isDemoId, type DemoSnapshot } from "./demo";

let snapshot: Promise<DemoSnapshot> | null = null;
export function loadDemo(): Promise<DemoSnapshot> {
  if (!snapshot) snapshot = getDemo().then((j) => JSON.parse(j) as DemoSnapshot).catch((e) => { snapshot = null; throw e; });
  return snapshot;
}

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
const FK: Record<string, string> = { citations: "fact_id" };

class DemoQuery implements PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }> {
  private filters: Filter[] = [];
  private sort: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private one: "maybe" | "single" | null = null;
  private head = false;
  private embeds: string[] = [];
  private write = false;
  constructor(private table: string) {}
  select(cols = "*", opts?: { head?: boolean; count?: string }) {
    this.head = !!opts?.head;
    this.embeds = [...cols.matchAll(/(\w+)\s*\(/g)].map((m) => m[1]!);
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  like(c: string, p: string) {
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
    this.filters.push((r) => re.test(String(r[c] ?? ""))); return this;
  }
  order(col: string, o?: { ascending?: boolean }) { this.sort.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  update() { this.write = true; return this; }
  insert() { this.write = true; return this; }
  delete() { this.write = true; return this; }
  upsert() { this.write = true; return this; }

  private async run() {
    if (this.write) return { data: null, error: { message: "The guided demo is read only — sign up to run this on your own deal." }, count: null };
    const snap = await loadDemo();
    const all = (snap as unknown as Record<string, Row[] | undefined>)[this.table] ?? [];
    let rows = all.filter((r) => this.filters.every((f) => f(r)));
    for (const s of [...this.sort].reverse()) rows = [...rows].sort((a, b) => {
      const x = a[s.col] as string | number, y = b[s.col] as string | number;
      return (x < y ? -1 : x > y ? 1 : 0) * (s.asc ? 1 : -1);
    });
    const count = rows.length;
    if (this.max != null) rows = rows.slice(0, this.max);
    if (this.embeds.length) rows = rows.map((r) => {
      const extra: Row = {};
      for (const e of this.embeds) {
        const src = (snap as unknown as Record<string, Row[] | undefined>)[e] ?? [];
        const fk = FK[e] ?? `${this.table.replace(/s$/, "")}_id`;
        extra[e] = src.filter((x) => x[fk] === r["id"]);
      }
      return { ...r, ...extra };
    });
    if (this.head) return { data: null, error: null, count };
    if (this.one) {
      if (this.one === "single" && rows.length !== 1) return { data: null, error: { message: "Row not found" }, count };
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }
  then<A, B>(ok?: ((v: Awaited<ReturnType<DemoQuery["run"]>>) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.run().then(ok, bad);
  }
}

const demoClient = {
  from: (t: string) => new DemoQuery(t),
  auth: { getUser: async () => ({ data: { user: null }, error: null }) },
};

/** Database client for an analysis id: the read-only demo snapshot for the demo id, the real client otherwise. */
export function dbFor(id: string | undefined | null): typeof supabase {
  return (isDemoId(id) ? demoClient : supabase) as unknown as typeof supabase;
}
