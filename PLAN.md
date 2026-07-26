# Career Genie — Implementation Plan

## Context

`C:\Users\oriel\projects\career-genie` is empty. We're building a resume-tailoring app: upload a resume → AI interviews you to fill gaps → dashboard tracking job applications → per-job AI-tailored resume PDF + cover letter, versioned and re-generatable, with status tracking and filtering.

**Architecture decision (from Q&A):** hosted static site, no accounts, **all data in the visitor's browser**. This rules out the two things a local app would have given us — Playwright PDF rendering and a real filesystem — so:

- PDFs render client-side with `@react-pdf/renderer` (produces a real Blob we can store; text stays selectable for ATS).
- IndexedDB (via Dexie) is the source of truth. A **File System Access API** folder mirror gives real files in Explorer on Chrome/Edge; Firefox/Safari fall back to plain downloads and still work fully.
- Each visitor brings their own Anthropic key, stored in their browser, calling the API directly with `dangerouslyAllowBrowser: true`.

**"Clear site data" wipes everything.** Export/import backup is therefore a required feature, not a nice-to-have.

---

## Stack

| Piece | Choice |
|---|---|
| App | Next.js 15 App Router — almost entirely client components |
| Server code | Exactly one route: `/api/fetch-job` (CORS proxy for job URLs) |
| UI | Tailwind + shadcn/ui |
| Storage | Dexie (IndexedDB) — `useLiveQuery` replaces any state-management lib |
| PDF | `@react-pdf/renderer` (`<PDFViewer>` preview == final output) |
| AI | `@anthropic-ai/sdk`, `dangerouslyAllowBrowser: true` |
| Resume parsing | `pdfjs-dist` (PDF) + `mammoth` (DOCX), both client-side |

Models: `claude-opus-4-8` for interview / job analysis / tailoring; `claude-haiku-4-5` for the initial resume→JSON parse.

---

## Data model — `lib/db.ts`

Six Dexie tables. Blobs live on `generations` rather than a separate table.

```ts
settings    // single row {id:1, apiKey, folderHandle?}
profile     // single row {id:1, basics, roles[], skills[], education[], projects[], updatedAt}
chat        // {id, role, content, createdAt}  — onboarding interview, resumable
jobs        // {id, title, company, url, description, requirements[], keywords[],
            //  status, matchScore, gaps[], notes, createdAt, updatedAt}
generations // {id, jobId, version, resumeJson, coverLetterText, changeSummary,
            //  extraContext, resumeBlob, coverBlob, createdAt}
```

`status` ∈ `saved | applied | interviewing | offer | rejected | withdrawn`.
Index `jobs` on `status`, `company`, `matchScore`, `updatedAt` so dashboard filters are index scans, not table sweeps.

Call `navigator.storage.persist()` on first load — without it the browser may evict the whole database under disk pressure. One line, prevents total data loss.

---

## Files

```
app/
  page.tsx                  redirect → /onboarding if no profile, else /dashboard
  onboarding/page.tsx       upload → parse → chat interview
  dashboard/page.tsx        stats + filters + job list
  jobs/[id]/page.tsx        job detail, generate/regenerate, version history, PDF preview
  settings/page.tsx         API key, output folder, export/import
  api/fetch-job/route.ts    ← the only server-side file
lib/
  db.ts                     Dexie schema + query helpers
  claude.ts                 the four AI calls
  parse-resume.ts           pdfjs / mammoth → plain text
  storage.ts                persist(), folder handle, save-or-download
  backup.ts                 export/import JSON
components/
  resume-pdf.tsx            react-pdf Document — this IS the template
  cover-letter-pdf.tsx
  job-card.tsx  filters.tsx  stats.tsx
```

---

## The four AI calls — `lib/claude.ts`

All use `output_config: { format: { type: "json_schema", schema } }` so responses parse without regex scraping. Tailoring and job analysis use `thinking: { type: "adaptive" }`.

1. **`parseResume(text)`** → structured profile JSON. `claude-haiku-4-5`.
2. **`interviewTurn(profile, history)`** → `{ question, targetField, done }`. Streams. Reads the resume, asks about vague bullets, missing metrics, unclear scope, gaps. User can quit anytime; `chat` table makes it resumable.
3. **`analyzeJob(text, profile)`** → `{ title, company, requirements[], keywords[], matchScore, gaps[] }`. One call does parse + score + gap list.
4. **`tailorResume(profile, job, extraContext?)`** → `{ resumeJson, coverLetterText, changeSummary }`.

**Grounding constraint on call 4 (load-bearing):** the system prompt restricts the model to selecting, reordering, and rewording content that exists in the profile. It may mirror the posting's vocabulary; it may not introduce a skill, tool, employer, or number that isn't in the profile. Anything the posting wants but the profile lacks goes in `gaps`, surfaced as a "⚠ Gaps vs posting" panel with an **Add to profile** button — never silently written into the resume.

---

## Job intake

`/api/fetch-job` takes a URL, does a plain `fetch` with a browser UA, strips tags to text, returns it. Greenhouse/Lever usually work; LinkedIn/Workday will not. On failure or thin content it returns an error and the UI falls back to the paste box, which is always visible. No headless browser, no retry ladder — the paste box is the reliable path and it's one field away.

---

## PDF output — `components/resume-pdf.tsx`

One clean single-column template as a react-pdf `<Document>`; styles in a `StyleSheet` at the top of the file so restyling is one file. `<PDFViewer>` on the job detail page shows exactly what downloads.

Save flow (`lib/storage.ts`): render → Blob → **always** write to `generations`; **additionally** write to the user's chosen folder if a directory handle is stored and permission is still granted, else trigger a normal download. Directory handles persist in IndexedDB but need re-permission each session — prompt on first save per session, and never block saving on it.

---

## Backup — `lib/backup.ts`

Export: whole DB → one JSON file, PDFs base64-inlined. Import: replace-or-merge. Surfaced in Settings with a plain-language warning that clearing site data destroys everything else. This is the only defense against the storage model chosen, so it ships in phase 1, not last.

---

## Build order

1. **Skeleton + storage** — Next.js, Tailwind, shadcn, `db.ts`, `persist()`, settings page with API key, export/import. Verify: set key, add a dummy job, export, clear site data, import, job returns.
2. **Onboarding** — upload → `parse-resume.ts` → `parseResume()` → profile editor → chat interview. Verify: real PDF resume in, structured profile out, interview answers merge, reload mid-interview resumes.
3. **Dashboard** — stats tiles, filter bar (status, search, min match score, sort), job cards, add-job dialog with URL fetch + paste, `analyzeJob()`. Verify: paste a real posting, get title/company/score/gaps; filters narrow correctly.
4. **Tailoring + PDF** — `tailorResume()`, resume + cover letter templates, `<PDFViewer>`, save to Dexie + folder, version history with change summaries, regenerate with extra context. Verify: generate → preview matches download → regenerate with "emphasize the k8s work" → v2 differs and change summary explains why.
5. **Polish** — job edit/delete, status transitions, gap → profile flow, empty states.

---

## Verification

- `npm run dev`, walk phases 1–4 end to end with a real resume and a real posting.
- **Grounding check (the one that matters):** paste a posting demanding a tool absent from the profile. The generated resume must not claim it; it must appear in the gap list. Assert this — it's the difference between a useful tool and one that gets you caught in an interview.
- **Durability check:** export → clear site data → import → all jobs, generations, and PDFs intact.
- **Degradation check:** open in Firefox. Everything works; PDF saves fall back to downloads rather than the folder mirror.

---

Skipped: multiple resume templates, LinkedIn scraping, interview-prep notes, multi-profile support. Add templates when one stops fitting; add the rest only if you actually miss them.
