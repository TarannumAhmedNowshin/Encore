<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Signed-in area lives under `src/routes/app.tsx` (client-only `beforeLoad` session check redirecting to `/auth`); why: keeps every /app/* page protected by one gate.
- Shared Encore UI primitives (EvidenceChip, ScoreBar, RunTimeline, EvidenceDrawer…) live in `src/components/encore/`; why: one source for the design system.
- Encore's shared server code (auth, AI, search, people search, scoring, usage, runs) lives in `src/lib/encore/` as `*.server.ts` plus pure `text.ts`/`scoring.ts`/`limits.ts`; why: this stack uses server functions, not Supabase Edge Functions, and `.server` files can never reach the browser.
- Every Encore pipeline step (including requests phrased as "Cloud server function" or Edge Function paths) is a `createServerFn` with `requireSupabaseAuth` in `src/lib/encore/*.functions.ts`, reuses the `*.server.ts` helpers, calls `loadOwnedAnalysis` before any write, and finishes in under ~120s; why: showcase analyses must stay read-only and the worker caps request time.
- Never use window.prompt/alert/confirm (blocked in the preview); use inline editors or `ConfirmDialog` in `src/components/encore/`; why: native dialogs silently fail there.
- Discovery is orchestrated in the browser (`src/hooks/useDiscoveryRun.ts`): research → leads → one `qualifyCompany` call per target with low concurrency, then `endDiscovery` closes the run; why: each server call must stay under the worker time cap.
- Long browser-orchestrated runs (discovery, departments, people) keep their state in `src/lib/encore/run-store.ts` and publish progress jobs shown by the top-bar pill; why: switching stages must not pause or forget a run.
- Analysis access is ownership-based: `accessQuery` in `src/lib/encore/ownership.ts` returns isOwner/readOnly (readOnly = not the owner); every stage page derives its read-only flag from the analysis user_id, not is_showcase. The layout `src/routes/app.a.$id.tsx` shows the read-only banner; People and Outreach render a privacy empty-state for non-owners. Why: showcase analyses are readable by any signed-in user but must stay uneditable.
- The analysis overview is the index route `src/routes/app.a.$id.index.tsx` (first rail item "Overview"); funnel/drop-off and next-action rules are pure functions in `src/lib/encore/overview.ts`. Why: one tested rule set for what the user should do next.
- Failure UX: every server call's catch uses toastError (src/lib/encore/toast.ts) with the server message and a Retry action; why: no silent failures or dead ends.
- Long runs: guard with hasActiveRun (src/lib/encore/run-guard.ts, 10-minute window) before starting, disable the button while running, show elapsed via useElapsed; why: the same step must never run twice for one analysis.
- Mobile (375px): the rail is a top stepper, drawers are full-screen, tables scroll inside their card (overflow-x-auto on the Card), and header flex rows use flex-wrap + min-w-0 so long filenames can't stretch the page; why: the page itself must never scroll horizontally.
- Public guided demo lives at /app/a/demo (/demo redirects; app.tsx skips the sign-in gate and renders `DemoShell` there). Stage pages read through `dbFor(id)` (`src/lib/encore/demo-db.ts`), which serves the sanitised `getDemo` snapshot for the demo id; privacy rules (no contact names/LinkedIn/location, "[First name]" in drafts, 60/min per IP) are pure in `demo.ts`, tour steps in `tour.ts`. Why: one set of stage pages for both real and demo data, with no real person's identity ever public.

- Subdirectories have their own `AGENTS.md` (e.g. `src/lib/encore/AGENTS.md`); read it before changing files there.
- Landing story lives in src/components/encore/landing/Story.tsx: framer-motion scroll scenes are sticky only at ≥1024px without reduced motion, otherwise stacked final states; why: phones and reduced-motion users get a simple, fast page.
- Pan/zoom for SVG charts (orbit, quadrant) uses usePanZoom + ZoomControls in src/components/encore/PanZoom.tsx with pure math in src/lib/encore/zoom.ts; why: one tested zoom behaviour (cursor-anchored wheel, pinch, drag) for every chart.
