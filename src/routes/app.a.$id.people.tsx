import { useMemo, useState } from "react";
import { dbFor } from "@/lib/encore/demo-db";
import { isDemoId } from "@/lib/encore/demo";
import { Loader2 } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronDown, Linkedin, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MobileActionBar, Card, EmptyState, Pill, RunTimeline, ScoreRing } from "@/components/encore/primitives";
import { findPeople, scoreContacts } from "@/lib/encore/people.functions";
import { isCreditError, ROLE_SLOTS, SLOT_LABELS, type RoleSlot } from "@/lib/encore/people";
import { defaultOrder, type AccountRow } from "@/lib/encore/accounts";
import { usageTodayQuery } from "@/lib/encore/usage-query";
import { toastError } from "@/lib/encore/toast";
import { clearJob, setJob, useRunState } from "@/lib/encore/run-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/a/$id/people")({
  head: () => ({ meta: [
    { title: "People — Encore" },
    { name: "description", content: "The buying committee at each qualified account, mapped to your personas." },
    { property: "og:title", content: "People — Encore" },
    { property: "og:description", content: "The buying committee at each qualified account, mapped to your personas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PeoplePage,
});

type Contact = {
  id: string; target_id: string; name: string | null; title: string | null;
  linkedin_url: string | null; persona_id: string | null; buying_role_slot: string | null; rationale: string | null;
};
type Score = {
  contact_id: string; total_score: number | null; rationale: string | null;
  role_fit: string | null; seniority_fit: string | null; similarity_to_original: string | null; evidence_strength: string | null;
};

const peopleQuery = (id: string) => queryOptions({
  queryKey: ["people", id],
  queryFn: async () => {
    const [a, targets, contacts, scores, personas] = await Promise.all([
      dbFor(id).from("analyses").select("is_showcase, user_id").eq("id", id).maybeSingle(),
      dbFor(id).from("targets").select("*").eq("analysis_id", id).eq("status", "qualified"),
      dbFor(id).from("contacts").select("*").eq("analysis_id", id),
      dbFor(id).from("contact_scores").select("*"),
      dbFor(id).from("personas").select("id, label").eq("analysis_id", id),
    ]);
    const { data: u } = await dbFor(id).auth.getUser();
    return {
      readOnly: !u.user || a.data?.user_id !== u.user.id,
      targets: ((targets.data ?? []) as AccountRow[]).sort(defaultOrder),
      contacts: (contacts.data ?? []) as Contact[],
      scores: (scores.data ?? []) as Score[],
      personas: (personas.data ?? []) as { id: string; label: string | null }[],
    };
  },
});

type Bulk = { kind: "find" | "score"; done: number; total: number; running: boolean } | null;

function PeoplePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const q = useQuery(peopleQuery(id));
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["people", id] }),
      qc.invalidateQueries({ queryKey: ["stages", id] }),
      qc.invalidateQueries({ queryKey: ["usage-today"] }),
    ]);
  };
  const usage = useQuery({ ...usageTodayQuery, enabled: !isDemoId(id) });
  const findFn = useServerFn(findPeople);
  const scoreFn = useServerFn(scoreContacts);
  const [bulk, setBulk] = useRunState<Bulk>(`people-bulk:${id}`, null);
  const [busyId, setBusyId] = useRunState<string | null>(`people-busy:${id}`, null);

  const d = q.data;
  const byTarget = useMemo(() => {
    const m = new Map<string, Contact[]>();
    for (const c of d?.contacts ?? []) {
      const list = m.get(c.target_id) ?? [];
      list.push(c);
      m.set(c.target_id, list);
    }
    return m;
  }, [d?.contacts]);
  const scoreByContact = useMemo(() => new Map((d?.scores ?? []).map((s) => [s.contact_id, s])), [d?.scores]);
  const personaLabel = useMemo(() => new Map((d?.personas ?? []).map((p) => [p.id, p.label ?? ""])), [d?.personas]);

  if (!d) return <main className="p-8"><div className="surface h-40 animate-pulse" /></main>;

  const peopleLeft = (() => {
    const row = usage.data?.find((u) => u.kind === "people_search");
    return row ? Math.max(0, row.limit - row.used) : null;
  })();

  const runFind = async (targetId: string) => {
    setBusyId(targetId);
    try {
      const r = await findFn({ data: { target_id: targetId } });
      if (r.message) toast(r.message);
      await refresh();
    } catch (e) { toastError(e, "People search failed", () => void runFind(targetId)); }
    finally { setBusyId(null); }
  };
  const runScore = async (targetId: string) => {
    setBusyId(targetId);
    try { await scoreFn({ data: { target_id: targetId } }); await refresh(); }
    catch (e) { toastError(e, "Scoring failed", () => void runScore(targetId)); }
    finally { setBusyId(null); }
  };

  // One company at a time: Apify free credit and the free AI tier can't take parallel load.
  const runBulk = async (kind: "find" | "score") => {
    if (bulk?.running) return;
    const list = kind === "find" ? d.targets.slice(0, 3) : d.targets.filter((t) => (byTarget.get(t.id) ?? []).length > 0);
    if (!list.length) return;
    setBulk({ kind, done: 0, total: list.length, running: true });
    const jobKey = `people:${id}`;
    const label = kind === "find" ? "Finding people…" : "Scoring contacts…";
    setJob({ key: jobKey, analysisId: id, label, done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const t = list[i]!;
      try {
        const r = kind === "find" ? await findFn({ data: { target_id: t.id } }) : await scoreFn({ data: { target_id: t.id } });
        if ("message" in r && r.message) toast(`${t.name}: ${r.message}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed";
        toast.error(`${t.name}: ${msg}`);
        if (isCreditError(msg)) {
          toast.error("Stopped: the people-search provider says its credit or limit is exhausted.");
          setBulk({ kind, done: i, total: list.length, running: false });
          clearJob(jobKey);
          await refresh();
          return;
        }
      }
      setBulk({ kind, done: i + 1, total: list.length, running: true });
      setJob({ key: jobKey, analysisId: id, label, done: i + 1, total: list.length });
      await refresh(); // show each company's board as soon as it's ready
    }
    clearJob(jobKey);
    setBulk(null);
    await refresh();
  };

  if (d?.readOnly && !isDemoId(id)) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-gutter">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" aria-hidden /> People</div>
        <h1 className="mt-1 text-2xl font-semibold">The buying committee at each account</h1>
        <EmptyState title="People data is private to the analysis owner" line="Run your own analysis with the sample deal to see this stage." />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-gutter">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" aria-hidden /> People</div>
          <h1 className="mt-1 text-2xl font-semibold">The buying committee at each account</h1>
          <p className="mt-1 text-sm text-muted-foreground">People at qualified companies, matched to your buyer personas by their real titles.</p>
        </div>
        {!d.readOnly && d.targets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void runBulk("find")} disabled={!!bulk?.running || !!busyId}>
              {bulk?.running && bulk.kind === "find" ? `Finding people ${bulk.done} of ${bulk.total}…` : "Find people at top 3 accounts"}
            </Button>
            <Button variant="outline" onClick={() => void runBulk("score")} disabled={!!bulk?.running || !!busyId || !d.contacts.length}>
              {bulk?.running && bulk.kind === "score" ? `Scoring ${bulk.done} of ${bulk.total}…` : "Score all contacts"}
            </Button>
          </div>
        )}
      </div>

      {bulk && (
        <Card className="mt-6">
          <RunTimeline steps={[{
            label: bulk.kind === "find" ? "Finding people, one company at a time" : "Scoring contacts, one company at a time",
            state: bulk.running ? "running" : "done",
            elapsed: `${bulk.done} of ${bulk.total}`,
          }]} />
        </Card>
      )}

      {!d.targets.length ? (
        <section className="mt-8">
          <EmptyState title="No qualified accounts yet"
            line="People search runs on qualified companies. Run discovery on the Accounts page first."
            action={<Button asChild variant="outline"><Link to="/app/a/$id/accounts" params={{ id }}>Run discovery first <ArrowRight /></Link></Button>} />
        </section>
      ) : (
        <div className="mt-6 space-y-6">
          {d.targets.map((t) => {
            const contacts = byTarget.get(t.id) ?? [];
            const busy = busyId === t.id;
            const searched = contacts.length > 0 || !!(t as AccountRow & { people_searched_at?: string | null }).people_searched_at;
            return (
              <Card key={t.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold">{t.name}</h2>
                    <span className="font-mono text-xs text-muted-foreground">Opportunity {t.opportunity_score ?? 0}</span>
                  </div>
                  {!d.readOnly && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void runFind(t.id)} disabled={busy || !!bulk?.running}>
                        {busy ? "Working…" : contacts.length ? "Search again" : "Find people"}
                      </Button>
                      {contacts.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => void runScore(t.id)} disabled={busy || !!bulk?.running}>
                          Score contacts
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div data-tour="board" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 [&>*]:min-w-0">
                  {ROLE_SLOTS.map((slot) => {
                    const inSlot = contacts.filter((c) => c.buying_role_slot === slot);
                    return (
                      <div key={slot} className="rounded-lg border border-border p-2">
                        <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">{SLOT_LABELS[slot]}</div>
                        {inSlot.length === 0 ? (
                          <div className="grid place-items-center rounded-md border border-dashed border-border px-2 py-6 text-center text-xs text-muted-foreground">
                            {busy ? <span className="flex items-center gap-1"><Loader2 className="size-3 animate-spin" aria-hidden /> Searching…</span>
                              : searched ? "Gap — no match found" : "Not searched yet"}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {inSlot.map((c) => (
                              <ContactCard key={c.id} c={c} score={scoreByContact.get(c.id)} persona={personaLabel.get(c.persona_id ?? "") ?? ""} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        People data from LinkedIn via Apify. Shown only to you.
        {peopleLeft != null && ` ${peopleLeft} of 10 people searches left today.`}
      </p>
      {!d.readOnly && d.targets.length > 0 && <MobileActionBar><Button onClick={() => void runBulk("find")} disabled={!!bulk?.running || !!busyId}>{bulk?.running && bulk.kind === "find" ? `Finding ${bulk.done} of ${bulk.total}…` : "Find people at top 3"}</Button></MobileActionBar>}
    </main>
  );
}

const RATING_LABEL: [keyof Score, string][] = [
  ["role_fit", "Role fit"], ["seniority_fit", "Seniority fit"],
  ["similarity_to_original", "Similarity to original"], ["evidence_strength", "Evidence strength"],
];

function ContactCard({ c, score, persona }: { c: Contact; score?: Score | undefined; persona: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border bg-card p-2.5 text-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={open}>
        <span className="min-w-0">
          <span className="block truncate font-medium">{c.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{c.title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {score?.total_score != null && <ScoreRing value={score.total_score} size={36} />}
          <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {persona && <Pill tone="primary">{persona}</Pill>}
        {c.linkedin_url && (
          <a href={c.linkedin_url} target="_blank" rel="noreferrer" aria-label={`${c.name} on LinkedIn`}
            className="text-muted-foreground hover:text-primary">
            <Linkedin className="size-3.5" />
          </a>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-2 text-xs">
          {c.rationale && <p className="text-muted-foreground">{c.rationale}</p>}
          {score && (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                {RATING_LABEL.map(([k, l]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{l}</dt>
                    <dd className="font-medium capitalize">{score[k] ?? "—"}</dd>
                  </div>
                ))}
              </dl>
              {score.rationale && <p className="text-muted-foreground">{score.rationale}</p>}
            </>
          )}
          {!score && <p className="text-muted-foreground">Not scored yet.</p>}
        </div>
      )}
    </div>
  );
}
