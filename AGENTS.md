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
- The People stage (`src/lib/encore/people.functions.ts`: findPeople, scoreContacts) maps LinkedIn candidates to personas/slots with the fast model; pure rules (titleKeywords, ROLE_SLOTS, isCreditError) live in `src/lib/encore/people.ts`; why: bulk runs go one company at a time on the free provider tiers, so rules must be testable without provider calls.
- Long browser-orchestrated runs (discovery, departments, people) keep their state in `src/lib/encore/run-store.ts` and publish progress jobs shown by the top-bar pill; why: switching stages must not pause or forget a run.
- Evidence quotes pass `isUsableEvidence` in `src/lib/encore/discover.ts` (length, contact details, contact pages, third-party mentions) in both qualify-company and find-departments; why: one tested rule set for what counts as evidence.
- Outreach (`src/lib/encore/outreach.functions.ts`: draftOutreach) grounds every claim in a numbered fact; the pure fact list, descriptor and claim checks live in `src/lib/encore/outreach.ts`; why: drafts must be verifiable in code and never auto-sent.
- Outreach honesty rules (`src/lib/encore/outreach.ts`): engagement facts from expected_outcomes/success_criteria are prefixed "TARGET (not yet achieved):" and business_impact/pain_point "BEFORE:" in the AI fact list; a claim on a TARGET fact fails if it uses past-tense achievement verbs (PAST_TENSE); factual sentences (number, company name, factual verb) not covered by a verified claim are stored as unverified `ungrounded` claims so the UI underlines them in red; email/executive_intro/linkedin_message must have a verified claim on a target-evidence fact when the target has any. Why: drafts must never present goals as results or invent relevance.
- Analysis access is ownership-based: `accessQuery` in `src/lib/encore/ownership.ts` returns isOwner/readOnly (readOnly = not the owner); every stage page derives its read-only flag from the analysis user_id, not is_showcase. The layout `src/routes/app.a.$id.tsx` shows the read-only banner; People and Outreach render a privacy empty-state for non-owners. Why: showcase analyses are readable by any signed-in user but must stay uneditable.
- The analysis overview is the index route `src/routes/app.a.$id.index.tsx` (first rail item "Overview"); funnel/drop-off and next-action rules are pure functions in `src/lib/encore/overview.ts`. Why: one tested rule set for what the user should do next.
- Analysis settings (rename, region, anonymise, delete) live in `src/lib/encore/analysis.functions.ts`; deleteAnalysis removes storage files from the documents bucket and all child rows before the analysis row. Why: owner-only mutations with the standard owner check.
- Failure UX: every server call's catch uses toastError (src/lib/encore/toast.ts) with the server message and a Retry action; why: no silent failures or dead ends.
- Long runs: guard with hasActiveRun (src/lib/encore/run-guard.ts, 10-minute window) before starting, disable the button while running, show elapsed via useElapsed; why: the same step must never run twice for one analysis.
- Mobile (375px): the rail is a top stepper, drawers are full-screen, tables scroll inside their card (overflow-x-auto on the Card), and header flex rows use flex-wrap + min-w-0 so long filenames can't stretch the page; why: the page itself must never scroll horizontally.
- Favicon: public/favicon.png + apple-touch-icon.png derived from the Encore "e" mark, declared in __root head; why: no stale default icon.
