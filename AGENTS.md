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
- AI usage is recorded only after a call returns a usable answer; why: failed calls must not consume the daily limit.
- Journey-rail stage statuses are computed by the pure `computeStages` in `src/lib/encore/deal.ts` from live counts (`stages-query.ts`); why: one tested rule set, no hard-coded statuses.
- Never use window.prompt/alert/confirm (blocked in the preview); use inline editors or `ConfirmDialog` in `src/components/encore/`; why: native dialogs silently fail there.
- Smart-tier pipeline AI calls fall back to the fast model on 503 (`generateJsonWithFallback`) and set `runs.used_fallback_model` so the page can say so; why: the main model is often overloaded.
- Discovery is orchestrated in the browser (`src/hooks/useDiscoveryRun.ts`): research → leads → one `qualifyCompany` call per target with low concurrency, then `endDiscovery` closes the run; why: each server call must stay under the worker time cap.
