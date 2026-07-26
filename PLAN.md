# Career Genie — Agent Build Plan

## 0. How to use this document

This plan is written to be executed by coding agents. Rules for anyone — human or agent — working from it:

1. **§2 (Closed decisions) is settled.** Do not re-open, re-litigate, or "improve" a closed decision. If a task appears to require violating one, stop and report the conflict instead of resolving it yourself.
2. **§3 (Global invariants) applies to every task**, not just the security task. Re-read it before writing any file.
3. **Work one task at a time.** Each task in §8 lists the exact files it may create or modify. Do not touch files outside that list. The order is deliberate; out-of-scope edits create contract drift.
4. **Acceptance criteria are binary.** A task is done when every criterion is objectively true and its verify command exits 0. Not when the code looks right.
5. **Do not invent API shapes.** Every Anthropic API parameter used in this app appears literally in §6 or §8. If you need one that doesn't, stop and ask — do not guess from memory, and do not copy a shape from a blog post.
6. **Prefer deleting to adding.** §10 lists things this project deliberately does not do. Adding an unrequested dependency, abstraction, or "helpful" feature is a defect here, not a bonus — every client dependency can read the user's API key (§3.4).
7. **Apply workspace Cursor rules.** Especially `constants-over-string-unions.mdc`: project-owned finite string sets are `as const` objects with a derived type of the same name; runtime code uses `JobStatus.Saved` / `CallKind.Parse` / etc., not raw string literals. Also keep Obsidian vault docs current when behavior changes (`obsidian-sync.mdc`).

---

## 1. Mission

A resume-tailoring web app. Upload a resume → AI interviews you to fill gaps → dashboard tracking job applications → per-job AI-tailored resume PDF + cover letter, versioned and regenerable, with status tracking and filtering.

No accounts, no database, no server-side state. Every visitor brings their own Anthropic API key and chooses their own models, because they pay for every call.

---

## 2. Closed decisions — do not revisit

| # | Decision | Why it is closed |
|---|---|---|
| D1 | **Deploy to Vercel as a normal Next.js 16+ app.** Not a static export. Use `proxy.ts`, not the deprecated `middleware.ts` convention. | Exactly one server route is required (`/api/fetch-job`). A static export cannot host it; the route would 404 in production and URL import would be dead on arrival. |
| D2 | **All user data lives in the visitor's browser** (IndexedDB via Dexie). No server-side persistence, ever. | Product constraint: no accounts. |
| D3 | **The visitor supplies their own API key**, stored client-side, calling `api.anthropic.com` directly with `dangerouslyAllowBrowser: true`. | We don't pay for their usage and don't want custody of their credentials. |
| D4 | **Do not proxy Anthropic calls through our server.** | The browser must hold the key regardless, so proxying gains nothing on theft and makes us a custodian of other people's credentials. |
| D5 | **No `pdfjs-dist`.** PDFs go to Claude as base64 `document` blocks. | Its text extraction mangles two-column resumes, and every client dependency can read the API key. |
| D6 | **PDF blobs are a regenerable cache, not data.** `resume` + `coverLetter` + `templateVersion` fully determine them. | Keeps backups small and pure-JSON without silently changing old layouts after a template update. |
| D7 | **The user picks their own models**, per call type, from their key's live catalog. | They pay. Also future-proofs against model releases without a code change. |
| D8 | **No third-party scripts.** No analytics, no CDN fonts, no error-reporting SaaS. | Any of them can read the API key. |
| D9 | **Require the capabilities the product uses.** Unsupported browsers get an explanation screen; there is no reduced browser mode. | Folder access requires a secure-context Chromium desktop browser with `showDirectoryPicker`. |
| D10 | **URL import is best-effort for public pages.** Paste is the explicit fallback. | Login walls, bot protection, and client-rendered job boards cannot be made reliable with a small server fetcher. |
| D11 | **No invented dollar estimate.** Track exact usage fields returned by Claude. Show money only if Anthropic adds authoritative price data to the API. | The Models API currently exposes capabilities and limits, not prices. |
| D12 | **AI-written claims are grounded.** Claude may rewrite for relevance, but each generated claim declares existing profile source IDs. Interview changes are proposals that require approval. | Tailoring must not turn job requirements into candidate experience. |
| D13 | **Versions are immutable.** AI regeneration and user edits both save as a new version. | History remains meaningful and rollback is trivial. |
| D14 | **Keep best-effort URL import and explicitly accept its residual exfiltration risk.** | A compromised client dependency can encode a key into a public URL and ask the same-origin fetch route to request it. SSRF controls and CSP do not close that channel; removing URL import is the only complete fix. |

---

## 3. Global invariants

These are checked in review and in CI. A change that violates one is rejected regardless of what task it belongs to.

### 3.1 The API key never leaves its lane

- After the password input submits to `stageKey`, runtime code receives plaintext **only** through `withApiKey(fn)` in `lib/keys.ts`; there is no getter that returns it (§7.7). No other module reads persisted `settings.encryptedKey` or `settings.plaintextKey`.
- **No field named `apiKey` exists on the persisted record.** Default storage is passphrase-encrypted (§7.7).
- Never logged. No `console.log` of the settings row, the Anthropic client, or any object that transitively contains the key.
- Never in a URL, query param, or fragment.
- Never in the backup export (§7.8).
- Never sent to our own server. `/api/fetch-job` has no reason to receive it — keep that structurally true.
- Masked in the UI: password input, last 4 characters only, no reveal button.

### 3.2 No path from untrusted input to executing script

This app has one concrete XSS path and it must stay closed:

> A job posting is attacker-controlled. It enters via `/api/fetch-job` or the paste box, goes to Claude, and returns as resume blocks, cover-letter paragraphs, `changeSummary`, and `gaps` — all of which are rendered. Both ends are untrusted: a posting can carry prompt-injection that steers the model into emitting markup.

- **`dangerouslySetInnerHTML` is banned project-wide.** Enforced by `react/no-danger` at ESLint `error`. Not for job text, not for AI output, not for line breaks — use `white-space: pre-wrap`.
- All model output and all job text render as text nodes.
- If Markdown is ever wanted, it goes through an allowlist sanitizer, never a strip-the-bad-tags regex.

### 3.3 CSP is defense-in-depth, not a complete exfiltration boundary

`connect-src` stays at exactly two entries — `'self'` and `https://api.anthropic.com`. Every host added is a new direct exfiltration destination and requires explicit sign-off. However, `'self'` includes `/api/fetch-job`, which can relay a request to a validated public HTTPS URL. A malicious client bundle could encode key material in that URL. Same-origin checks, SSRF controls, timeouts, and byte limits reduce abuse but do not remove this channel. Dependency review, lockfile integrity, no third-party scripts, and keeping plaintext short-lived are therefore primary controls.

### 3.4 Dependencies are a security decision

Every package in the client bundle can read the API key. Adding one is a deliberate act: it needs a stated reason, and the app must not work without it. Lockfile committed, CI builds with `npm ci`, Dependabot on with auto-merge **off**.

### 3.5 Model parameters are never hardcoded per call site

Request parameters are not portable across models (§6.3). Every Anthropic call builds its parameters through `lib/model-config.ts`. A literal `effort:` or `thinking:` outside that module is a defect.

### 3.6 Every Anthropic response is checked for refusal before content is read

`stop_reason === "refusal"` returns HTTP 200 with empty or partial `content`. `response.content[0].text` also fails when a thinking block precedes text. There is one shared response handler; every call uses it, finds the text block by type, and accepts only `stop_reason === "end_turn"`.

### 3.7 No silent paid retries

The Anthropic client is created with `maxRetries: 0`. A failed call is shown to the user with a deliberate Retry button. Disable duplicate submissions while a call is active.

### 3.8 AI provenance is a guardrail, not proof

For every AI-authored resume claim and cover-letter paragraph, every declared `sourceId` must exist in the current profile. Resume role, education, project, and basics metadata must exactly match the profile entity they reference; only `GroundedText.text` may be rewritten. This catches invented source references and altered metadata, not semantic lies. The UI must show source badges and require user review. User-edited blocks are marked `userEdited: true`.

---

## 4. Repository contract

Start from an empty repository. Create only these project files. A task may add a file to this list only by first changing this plan.

```
package.json
package-lock.json
tsconfig.json
next-env.d.ts
next.config.ts
proxy.ts
eslint.config.mjs
playwright.config.ts
.gitignore
README.md
.github/dependabot.yml
.github/workflows/ci.yml
app/
  globals.css
  layout.tsx
  page.tsx
  error.tsx
  onboarding/page.tsx
  dashboard/page.tsx
  jobs/[id]/page.tsx
  settings/page.tsx
  api/fetch-job/route.ts
components/
  app-shell.tsx
  browser-gate.tsx
  profile-editor.tsx
  interview.tsx
  generation-editor.tsx
  pdf-preview.tsx
  resume-pdf.tsx
  cover-letter-pdf.tsx
  job-card.tsx
  filters.tsx
  stats.tsx
  model-picker.tsx
lib/
  types.ts
  schemas.ts
  browser-support.ts
  db.ts
  crypto.ts
  keys.ts
  anthropic.ts
  model-config.ts
  models.ts
  claude.ts
  parse-resume.ts
  docx-preflight.worker.ts
  grounding.ts
  job-text.ts
  safe-fetch.ts
  storage.ts
  backup.ts
  usage.ts
scripts/
  security-check.ts
  grounding-check.ts
  csp-check.ts
fixtures/
  profile.json
  posting-k8s.txt
  posting-xss.txt
tests/
  crypto.test.ts
  backup.test.ts
  model-config.test.ts
  grounding.test.ts
  parse-resume.test.ts
  safe-fetch.test.ts
  e2e/onboarding.spec.ts
  e2e/job-flow.spec.ts
  e2e/security.spec.ts
```

Production dependencies are limited to `next`, `react`, `react-dom`, `dexie`, `@anthropic-ai/sdk`, `mammoth`, `fflate`, `@react-pdf/renderer`, and `undici`. `fflate` runs only in the DOCX preflight worker and counts actual decompressed bytes; `undici` is server-only and pins validated DNS results during URL fetching. Dev dependencies are TypeScript, ESLint with Next's config, `tsx`, Playwright, and required type packages. Use built-in CSS; do not add a component library, form library, state manager, schema library, date library, or PDF viewer.

---

## 5. Shared domain contract — `lib/types.ts`

Write this file first. The app assigns every new ID with `crypto.randomUUID()`; model-generated strings are never trusted as new persistent IDs. Times are epoch milliseconds. User-entered dates are ISO `YYYY-MM` strings so partial dates remain honest.

```ts
// Project-owned finite string sets use `as const` objects + derived types
// (see .cursor/rules/constants-over-string-unions.mdc). Runtime code uses
// JobStatus.Saved, CallKind.Parse, Effort.Low, etc. — not raw string literals.
export const JobStatus = {
  Saved: 'saved', Applied: 'applied', Interviewing: 'interviewing',
  Offer: 'offer', Rejected: 'rejected', Withdrawn: 'withdrawn',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const CallKind = {
  Parse: 'parse', Interview: 'interview', Analyze: 'analyze', Tailor: 'tailor',
} as const;
export type CallKind = (typeof CallKind)[keyof typeof CallKind];

export const Effort = {
  Low: 'low', Medium: 'medium', High: 'high', Xhigh: 'xhigh', Max: 'max',
} as const;
export type Effort = (typeof Effort)[keyof typeof Effort];

export const KeyStorageMode = {
  Encrypted: 'encrypted', Session: 'session', Plaintext: 'plaintext',
} as const;
export type KeyStorageMode = (typeof KeyStorageMode)[keyof typeof KeyStorageMode];

export const ChatRole = { User: 'user', Assistant: 'assistant' } as const;
export type ChatRole = (typeof ChatRole)[keyof typeof ChatRole];

export const GenerationOrigin = { Ai: 'ai', Manual: 'manual' } as const;
export type GenerationOrigin = (typeof GenerationOrigin)[keyof typeof GenerationOrigin];

// Remaining interfaces (ModelChoice, ModelInfo, Settings, Profile, Job,
// Generation, BackupV1, …) match lib/types.ts exactly — same field shapes and
// string values as the prior union-based contract; only the finite sets above
// changed representation.
```

Full interface definitions live in `lib/types.ts` (single source of truth after T1). String *values* are unchanged (`'saved'`, `'parse'`, …).

`lib/schemas.ts` holds the raw JSON Schemas for the four structured Claude outputs and small runtime assertion functions. Do not add Zod. Every object schema sets `additionalProperties: false`; every property is listed in `required`, using nullable values where absence is valid.

---

## 6. Anthropic API contract

This section is the only source of truth for Anthropic request shapes. Confirm it against the installed SDK's TypeScript types during implementation; if the installed SDK rejects a shape, stop and update this plan rather than casting to `any`.

### 6.1 Client and model catalog

`lib/anthropic.ts` creates a new short-lived client inside `withApiKey`:

```ts
new Anthropic({
  apiKey: key,
  dangerouslyAllowBrowser: true,
  maxRetries: 0,
  timeout: 120_000,
});
```

Never retain the client outside the callback. Never set a custom `baseURL`. The SDK supplies the direct-browser header.

`lib/models.ts` calls `client.models.list({ limit: 100, after_id })` until `has_more` is false, using non-null `last_id` as the next `after_id`. If `has_more === true` while `last_id === null`, fail with an invalid-catalog-response error instead of issuing another request. Cache the result in memory for five minutes only. A reload or key change clears it. There is no fallback catalog and no hardcoded model ID. Saved selections remain visible but are invalid until found in the current live catalog.

### 6.2 Message request

All four calls use `client.messages.parse`, non-streaming:

```ts
client.messages.parse({
  model,
  max_tokens,
  system,
  messages,
  output_config: {
    ...(effort ? { effort } : {}),
    format: jsonSchemaOutputFormat(schema),
  },
}, { signal });
```

The helper is imported from `@anthropic-ai/sdk/helpers/json-schema`. `model`, `max_tokens`, optional `effort`, and the schema come from `lib/model-config.ts`; call sites supply only the call kind, system text, and messages.

PDF parsing uses this exact user content:

```ts
[
  {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: pdfBase64,
    },
  },
  { type: 'text', text: parsePrompt },
]
```

DOCX parsing uses `mammoth.extractRawText({ arrayBuffer })` and sends the result in a text block. It never renders Mammoth HTML.

Before Mammoth runs, `docx-preflight.worker.ts` uses streaming `fflate.Unzip` in a dedicated worker. It rejects ZIP64, more than 1,000 entries, path traversal names, missing `[Content_Types].xml` or `word/document.xml`, and aborts as soon as actual decompressed output exceeds 20 MiB regardless of declared ZIP metadata. `parse-resume.ts` terminates the worker after success, failure, or a five-second timeout. After Mammoth extraction, reject text over 250,000 characters. PDF input must start with the `%PDF-` signature. These resume-specific bounds stay well below the Messages API's 32 MiB total request limit after base64 expansion.

### 6.3 Capability adapter

Every selected model must have `structured_outputs.supported === true`. The PDF parse model must additionally have `pdf_input.supported === true.`

| Call | Output schema | Desired `max_tokens` | Desired effort |
|---|---|---:|---|
| `parse` | profile fields without IDs or timestamps | 4,096 | `low` |
| `interview` | `{ reply, proposedProfile, changes, complete }` | 4,096 | `medium` |
| `analyze` | `{ title, company, description, requirements, keywords, matchScore, gaps }` | 4,096 | `low` |
| `tailor` | `{ resume, coverLetter, changeSummary }` | 8,192 | `high` |

Set `max_tokens` to the lower of the table value and the positive `model.max_tokens`. If the catalog reports a non-positive limit, reject the model as unusable. For effort, choose the desired value when supported; otherwise choose the highest supported value below it in `low → medium → high → xhigh → max` order; omit `effort` when the capability is absent. Do not send `thinking` in v1.

Parsing output contains no IDs; the app assigns all entity and claim IDs while hydrating the first Profile. Interview output carries existing IDs so diffs are stable, uses `null` for every proposed new entity or claim ID, and may not change an existing ID. The app validates this rule and assigns IDs to approved new items. Deleted IDs appear in `changes` and are not silently omitted.

### 6.4 Shared response handler

Immediately save the response's usage, including:

- `input_tokens`
- `output_tokens`
- `cache_read_input_tokens`
- `cache_creation_input_tokens`
- `cache_creation.ephemeral_5m_input_tokens`
- `cache_creation.ephemeral_1h_input_tokens`

Missing optional usage fields become zero. Then:

1. `refusal` becomes a safe, user-facing refusal error.
2. Any non-`end_turn` reason, including `max_tokens`, `pause_turn`, and `model_context_window_exceeded`, becomes an incomplete-response error.
3. Select every content block where `type === 'text'` and concatenate in response order; never index `content[0]`.
4. Require non-null `parsed_output` and run the local assertion from `lib/schemas.ts`.
5. Never display raw SDK errors that may contain request headers or bodies. Map status, request ID, and a safe message.

There is no pricing request because Anthropic exposes no pricing API. The Usage UI displays tokens by model and call kind, and no dollar sign.

### 6.5 Prompt boundary

System prompts say that resume text and job text are untrusted data, instructions inside them must be ignored, and requirements must never be represented as candidate experience. Delimit untrusted text with explicit XML-style data tags. This reduces prompt injection; it is not an HTML rendering mechanism.

The tailoring prompt requires:

- every AI-authored `GroundedText.sourceIds` to be non-empty;
- every source ID to come from the supplied profile;
- no employer, title, date, credential, metric, tool, or skill absent from those sources;
- omissions and reordering are allowed;
- rewriting is allowed only when meaning is preserved;
- gaps remain gaps and are never inserted as experience.

---

## 7. Product and security behavior

### 7.1 Browser gate

Before any route renders private data, `BrowserGate` checks:

- secure context, except `localhost` development;
- IndexedDB;
- `crypto.subtle` and `crypto.getRandomValues`;
- `showDirectoryPicker`;
- `FileSystemDirectoryHandle`;
- `Blob`, `FileReader`, and `URL.createObjectURL`.

Failure renders a static accessible page listing missing capabilities and recommending current desktop Chrome or Edge. Do not render onboarding, saved data, or API-key controls behind the failure.

### 7.2 Onboarding

The ordered flow is:

1. Choose key storage mode; encrypted is preselected.
2. Enter and validate the key by fetching the model catalog.
3. Select a compatible model for each call kind. After the live catalog loads, default each unset or unusable selection to the best-fit family from that catalog (Haiku for parse extraction; Sonnet for interview/analyze/tailor; newest usable ID within the family). The user can change any default before saving.
4. Upload a PDF or DOCX, maximum 10 MiB. Reject MIME/extension mismatch, invalid magic bytes, and empty or oversized DOCX extraction.
5. Parse to a proposed profile, show the full editable profile, and save only after confirmation.
6. Run the gap interview. Each answer produces an assistant reply plus a proposed complete profile. Show a field-level diff; Approve saves it, Edit opens it in the profile editor, Reject discards it. Persist a pending proposal so reload does not lose it.
7. Allow “Finish for now” at any point after the first profile is saved.

The original resume file and base64 are never persisted. Explain before the first call that resume content goes directly from the browser to Anthropic.

### 7.3 Dashboard and jobs

Dashboard stats are total jobs plus counts by status. Filters cover free-text title/company search and status; sort newest first. Empty states link to adding a job.

Add job accepts either URL or pasted text. URL import calls `/api/fetch-job`, then `lib/job-text.ts` uses inert `DOMParser`, strips scripts/styles/nav/footer/chrome, prefers `main`/`article` text, and collapses whitespace (never inserts into the live DOM). Import then runs the analyze call to extract `title`, `company`, a cleaned `description`, requirements, keywords, match score, and gaps—filtering cookie banners, related jobs, and other page junk. On fetch failure, preserve the URL and focus the paste box. On analyze failure after a successful fetch, keep the stripped page text for manual edit.

Analysis (from paste or after URL import) creates a draft Job. The user can edit title, company, description, requirements, and notes before saving. `matchScore` is an integer 0–100. Status changes save immediately; deleting a job requires confirmation and transactionally deletes its generations.

### 7.4 Generation and editing

Generating requires a saved profile, saved job, unlocked key, and valid tailor model. Optional extra context is untrusted data and may clarify facts only; it is not automatically added to the profile.

Validate every generated source ID against the profile before showing a preview. Invalid provenance rejects the whole response and saves no generation. The user reviews resume and cover letter side by side, edits block text directly, and sees source badges. Editing a block sets `userEdited: true`.

Copied facts—name/contact details, employer, title, institution, qualification, project name, and dates—are read-only in the generation editor. The user edits those in the Profile editor and regenerates. All AI-authored `GroundedText`, plus cover-letter greeting and signoff, is directly editable.

Save rules:

- first accepted AI output is version 1 with `origin: 'ai'`;
- Regenerate creates the next version with `origin: 'ai'` and `parentId`;
- Save edits creates the next version with `origin: 'manual'` and `parentId`;
- existing records are never updated except to fill or replace their local PDF cache;
- version number allocation and insert happen in one Dexie transaction;
- users can view, download, or use any prior version.

PDF generation is entirely local. Use built-in Helvetica; no remote font. PDF blobs may be deleted at any time and regenerated without Claude. Version 1 records store `templateVersion: 1`; future template changes must add a renderer version rather than reinterpret old generations.

### 7.5 Database

Dexie database name is `career-genie`, schema version 1:

```text
settings:    '&id'
profiles:    '&id, updatedAt'
interview:   '&id, updatedAt'
jobs:        '&id, status, company, title, createdAt, updatedAt'
generations: '&id, jobId, [jobId+version], createdAt'
usage:       '&id, callKind, model, at'
```

The `[jobId+version]` index is unique by application-level transaction check. All write helpers catch quota and permission errors and return safe actionable messages. Call `navigator.storage.persist()` after onboarding from a user gesture; show the result and `navigator.storage.estimate()` in Settings.

### 7.6 Folder and downloads

Folder selection is initiated only by a Settings button and requests `{ mode: 'readwrite' }`. Store the structured-cloneable handle in Settings. Before each write, query permission and request it again from a user gesture when needed. If no folder is selected or permission is denied, use a normal browser download.

Filenames are ASCII-safe and deterministic:

```text
{company}-{title}-resume-v{n}.pdf
{company}-{title}-cover-letter-v{n}.pdf
```

Replace unsafe runs with `-`, trim separators, and cap the stem at 100 characters.

### 7.7 API-key lifecycle

`lib/crypto.ts` uses Web Crypto only:

- PBKDF2-HMAC-SHA-256, 600,000 iterations;
- 16 random salt bytes;
- AES-256-GCM;
- 12 random IV bytes per encryption;
- authenticated additional data exactly `career-genie:key:v1`;
- a non-extractable derived AES `CryptoKey`;
- base64 encoding implemented locally;
- passphrase minimum 12 characters.

The iteration count and AAD identifier are stored in the record and used during decrypt. Authentication failure reports “wrong passphrase or damaged key data” without distinguishing them. Encryption protects IndexedDB at rest only; it cannot protect an unlocked key from XSS, a malicious dependency, browser extensions, or a compromised browser.

`lib/keys.ts` owns all key state:

- `stageKey(key)` accepts the password-input value and places it in module memory without persisting it;
- the caller validates the staged key by fetching the live model catalog through `withApiKey`;
- `commitStagedKey(mode, passphrase?)` persists only after successful validation;
- encrypted mode persists only ciphertext and last four characters;
- session mode persists only the mode and hint;
- plaintext mode requires a separate warning checkbox and persists `plaintextKey`;
- changing modes atomically removes fields belonging to the old mode;
- encrypted `unlock(passphrase)` stores only the non-extractable wrapping `CryptoKey` after a successful test decrypt;
- encrypted `withApiKey(fn)` decrypts immediately before the callback and drops its plaintext reference when the callback settles;
- session mode necessarily retains its staged plaintext in module memory; plaintext mode reads its persisted value only for the callback;
- `lock()` drops the wrapping key and all staged/session plaintext references;
- encrypted/session modes auto-lock after 15 minutes without a completed `withApiKey` call and on `pagehide`;
- reload, tab close, and each new tab start locked;
- `withApiKey(fn)` is the only way to receive plaintext and throws a typed locked error otherwise.

JavaScript strings cannot be reliably zeroed; do not claim memory erasure. Do not sync plaintext or passphrases across tabs.

### 7.8 Backup

Export constructs `BackupV1` from an allowlist in fixed property order, computes SHA-256 over the UTF-8 JSON with `checksumSha256` omitted, then inserts the lowercase hex checksum. It excludes encrypted/plaintext keys, key hint, folder handle, PDF blobs, and original uploads. Import:

1. rejects files over 20 MiB before parsing;
2. parses JSON and reconstructs the allowlisted payload in canonical property order;
3. checks format, version, and SHA-256 checksum computed with `checksumSha256` omitted;
4. enforces at most 10,000 jobs, 50,000 generations, 100,000 usage records, and 10,000 interview turns;
5. validates every nested field and all referential integrity without writing;
6. shows counts and an explicit replacement warning;
7. downloads a pre-import backup of current data when any current data exists;
8. in one Dexie transaction clears profile, interview, jobs, generations, and usage, then inserts the backup;
9. preserves current key and folder settings, replacing only model preferences;
10. rolls back completely on failure.

Import never merges. After success, model selections are revalidated against the next live catalog.

Settings also has “Delete all local data.” A typed confirmation deletes the Dexie database, locks the in-memory key, revokes object URLs, and reloads to onboarding. It does not claim to erase browser backups or files the user already downloaded.

### 7.9 Public URL fetch route

`POST /api/fetch-job` is the only app server route. Request body is `{ "url": string }`; success is:

```ts
{
  finalUrl: string;
  contentType: 'text/html' | 'text/plain';
  body: string;
}
```

Enforce all of the following:

- same-origin `Origin` header;
- JSON body at most 4 KiB and URL at most 2,048 characters;
- HTTPS only, no credentials, fragments, or ports other than 443;
- reject localhost, `.local`, literal or resolved loopback, private, link-local, carrier-grade NAT, documentation, multicast, reserved, and unspecified IPv4/IPv6 ranges;
- resolve all addresses and reject the host if any address is non-public;
- use an `undici.Agent` custom lookup that returns only the already-validated address, closing DNS-rebinding time-of-check/time-of-use;
- redirect mode manual, maximum three hops, and repeat full validation with a new pinned agent for each hop;
- GET only, no cookies, authorization, referrer, or forwarded request headers;
- 10-second total timeout;
- accept only `text/html`, `application/xhtml+xml`, or `text/plain`;
- stream at most 1 MiB and abort rather than trusting `Content-Length`;
- return `Cache-Control: no-store` and never log body or URL query values.

Map invalid input to 400, blocked destination to 403, upstream timeout to 504, unsupported content to 415, oversized response to 413, and other upstream failures to 502. The browser converts XHTML to the same `'text/html'` success type. Do not add rendering, cookies, login support, or site-specific scrapers.

The production Vercel project must have one fixed-window WAF rule matching `POST /api/fetch-job`, counted by IP, allowing 20 requests per 10 minutes and returning 429 afterward. This is deployment configuration, not `vercel.json`; README records the Dashboard and `vercel firewall` setup steps. It limits public-proxy abuse and function cost but does not close D14's one-request exfiltration channel. Verify on the deployment by sending 21 invalid-body POSTs from one IP: the first 20 reach the route and return 400, and the 21st returns 429 without function execution.

### 7.10 CSP and static headers

`proxy.ts` follows the current Next.js nonce pattern: generate a cryptographically random nonce per request, place it in the request `x-nonce` header and both request/response CSP headers, and exclude static assets with a matcher. Root layout reads `headers()` so pages are dynamically rendered.

Production CSP:

```text
default-src 'self';
script-src 'self' 'nonce-{NONCE}' 'strict-dynamic';
style-src 'self' 'nonce-{NONCE}';
img-src 'self' blob: data:;
font-src 'self';
connect-src 'self' https://api.anthropic.com;
frame-src 'self' blob:;
worker-src 'self' blob:;
object-src 'none';
base-uri 'none';
form-action 'self';
frame-ancestors 'none';
upgrade-insecure-requests
```

Development may add `'unsafe-eval'` to `script-src` only. `next.config.ts` adds `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and `Cross-Origin-Opener-Policy: same-origin`. Do not set COEP because the direct Anthropic response is not guaranteed to opt in.

---

## 8. Ordered implementation tasks

Tasks are sequential unless their dependency line says otherwise. Do not modify files outside a task's file list. Every task ends with its verify command; the final task runs the whole suite.

### T0 — Bootstrap

**Files:** package files, TypeScript/Next/ESLint/Playwright config, `.gitignore`, `README.md`, `.github/dependabot.yml`, `app/globals.css`.

- Install only dependencies listed in §4, using current patched stable versions.
- Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `check`, `check:security`, `check:csp`, `eval:grounding`.
- Dependabot opens weekly npm and GitHub Actions PRs; no auto-merge.

**Verify:** `npm ci && npm run lint && npm run typecheck`

### T1 — Contracts and pure logic

**Depends on:** T0
**Files:** `lib/types.ts`, `lib/schemas.ts`, `lib/browser-support.ts`, `lib/model-config.ts`, `lib/grounding.ts`, `lib/job-text.ts`, `tests/model-config.test.ts`, `tests/grounding.test.ts`, fixtures.

- Implement exact types and four output schemas.
- Collect valid profile source IDs in one function.
- Grounding validation rejects empty, missing, and foreign source IDs on AI output, rejects metadata that differs from its referenced profile entity, and allows explicitly user-edited text blocks.
- Job extraction returns collapsed plain text and never markup.

**Verify:** `npm test -- tests/model-config.test.ts tests/grounding.test.ts`

### T2 — Local persistence, keys, storage, and backup

**Depends on:** T1
**Files:** `lib/db.ts`, `lib/crypto.ts`, `lib/keys.ts`, `lib/storage.ts`, `lib/backup.ts`, `tests/crypto.test.ts`, `tests/backup.test.ts`.

- Implement the library and database behavior in §7.5–§7.8. User-gesture controls and Settings UI belong to T6.
- Test crypto round trip, non-extractable wrapping keys, AAD mismatch, random salt/IV, wrong passphrase, mode transitions, idle/pagehide lock, backup exclusions/checksum/limits, invalid references, rollback, and replacement.
- No key-bearing fixture is committed.

**Verify:** `npm test -- tests/crypto.test.ts tests/backup.test.ts`

### T3 — Claude integration

**Depends on:** T1–T2
**Files:** `lib/anthropic.ts`, `lib/models.ts`, `lib/claude.ts`, `lib/parse-resume.ts`, `lib/docx-preflight.worker.ts`, `lib/usage.ts`, `tests/parse-resume.test.ts`.

- Implement §6 exactly.
- All calls pass through `withApiKey`, model config, shared response handling, schema assertion, and usage recording.
- File parsing enforces §6.2 signatures, worker timeout, actual ZIP expansion/text, and 10 MiB limits before allocation-heavy base64 conversion.
- No automatic retry and no streaming.

**Verify:** `npm test -- tests/parse-resume.test.ts && npm run lint -- lib/anthropic.ts lib/models.ts lib/claude.ts lib/parse-resume.ts lib/docx-preflight.worker.ts lib/usage.ts && npm run typecheck`

### T4 — Safe public URL import

**Depends on:** T0
**Files:** `lib/safe-fetch.ts`, `app/api/fetch-job/route.ts`, `tests/safe-fetch.test.ts`.

- Implement §7.9 with dependency injection for DNS and fetch behavior.
- Tests cover IPv4 and IPv6 blocked ranges, mixed public/private DNS answers, credentials, ports, redirect revalidation, DNS pinning, timeout, MIME, and byte limit without making internet requests.

**Verify:** `npm test -- tests/safe-fetch.test.ts`

### T5 — PDF documents

**Depends on:** T1
**Files:** `components/resume-pdf.tsx`, `components/cover-letter-pdf.tsx`, `components/pdf-preview.tsx`.

- One conservative ATS-friendly single-column template.
- Keep headings with following content where possible; avoid icons, columns, tables, images, and remote fonts.
- Preview uses a revocable blob URL and releases the previous URL on change/unmount.

**Verify:** `npm run lint -- components/resume-pdf.tsx components/cover-letter-pdf.tsx components/pdf-preview.tsx && npm run typecheck`

### T6 — Shell, onboarding, and settings

**Depends on:** T2–T3, T5
**Files:** `README.md`, `proxy.ts`, `next.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/error.tsx`, `components/app-shell.tsx`, `components/browser-gate.tsx`, `app/onboarding/page.tsx`, `components/profile-editor.tsx`, `components/interview.tsx`, `components/model-picker.tsx`, `app/settings/page.tsx`.

- Implement browser gate, nonce CSP, routing, onboarding, profile approval, interview diff approval, key lock/unlock/mode changes, model selectors, folder access, storage report, backup, and usage report.
- All forms have labels, inline errors, keyboard operation, visible focus, and `aria-live` status where calls complete.
- Responsive baseline supports 360 CSS pixels through desktop.

**Verify:** `npm run lint && npm run typecheck && npm run build`

### T7 — Dashboard and job workflow

**Depends on:** T3–T6 and T4
**Files:** `README.md`, `app/globals.css`, `app/dashboard/page.tsx`, `components/job-card.tsx`, `components/filters.tsx`, `components/stats.tsx`, `app/jobs/[id]/page.tsx`, `components/generation-editor.tsx`.

- Implement §7.3–§7.4.
- Any manual save or AI regeneration creates a version; no history mutation.
- Prevent navigation loss with an in-page confirmation when generation edits are dirty.

**Verify:** `npm run lint && npm run typecheck && npm run build`

### T8 — Executable security and product checks

**Depends on:** T0–T7
**Files:** `README.md`, `.github/workflows/ci.yml`, scripts and all Playwright specs.

- `security-check.ts` fails on `dangerouslySetInnerHTML`, `react/no-danger` downgrade, `console.*`, key fields read outside allowed files, extra server routes, extra `connect-src` hosts, or forbidden dependency additions.
- `csp-check.ts` starts the production build, fetches two pages, proves nonces differ, and asserts the exact production directives.
- CI runs on pull requests and main: `npm ci`, `npm audit --omit=dev --audit-level=high`, lint, typecheck, unit tests, production build, Playwright tests, and CSP/security scripts.
- E2E mocks Anthropic at the network boundary; no real key or paid call is used.
- E2E covers unsupported browser, encrypted onboarding reload/idle lock, proposal approval, XSS fixture rendering as text, URL fallback, job filters/status, generation/edit/regenerate history, PDF download, safety-export then backup replacement, delete-all, and refusal/error states.
- `grounding-check.ts` is a manual paid release eval. It requires `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`, tailors the fixture profile to the Kubernetes posting, and fails if Kubernetes appears as candidate experience or any source ID is invalid. It prints no prompts, responses, or key.

**Verify:** `npm run check`

---

## 9. Acceptance matrix

The production MVP is accepted only when all rows are objectively true.

| Area | Required evidence |
|---|---|
| Browser | Missing required capability shows only the unsupported screen; current desktop Chrome and Edge complete E2E. |
| Key | Encrypted default uses a non-extractable wrapping key, survives reload only as ciphertext, auto-locks after idle/pagehide, and starts locked; session key does not survive; plaintext requires warning consent; backup contains none of them. |
| Claude | Every call uses the chosen live model, capability adapter, structured output, no retry, refusal handling, and usage recording. |
| Resume import | PDF and DOCX under 10 MiB parse; wrong signatures, malformed/ZIP64/path-traversal/over-expanded DOCX, oversize input or text, empty DOCX, refusal, and incomplete output are safe errors. |
| Interview | No proposal changes the profile before approval; reject leaves it unchanged; reload retains a pending proposal. |
| Jobs | Paste works; public URL works in the test harness; blocked/login/JS pages fall back to paste; status/filter/search persist. |
| Grounding | Foreign or empty provenance is rejected; Kubernetes fixture never becomes candidate experience in the release eval. |
| Versions | AI generation, regeneration, and manual editing create immutable monotonically increasing versions. |
| PDFs | Both documents preview and download; deleting cached blobs and reopening creates non-empty PDFs from unchanged document records with zero Anthropic requests. |
| Backup | Export is checksummed allowlisted JSON; invalid, oversized, over-count, or checksum-mismatched import writes nothing; confirmed valid import first initiates a safety export, then replaces atomically and preserves key/folder settings. |
| XSS | Posting and model markup render visibly as text; no executable event handler or script runs. |
| SSRF | Unit tests prove all listed address classes and every redirect hop are blocked before connection. |
| URL fetch abuse | Production WAF limits `POST /api/fetch-job` to 20 requests per IP per 10 minutes and returns 429 for the next request. |
| CSP | Production header has a fresh nonce and exactly two `connect-src` entries. |
| Accessibility | Playwright's keyboard-only path completes onboarding, job creation, generation review, and download; headings, labels, focus order, errors, and status announcements are asserted. |
| Quality | `npm ci && npm run check` exits 0 from a clean checkout; Vercel production build succeeds. |

Manual release checks:

1. Run `npm run eval:grounding` with a low-value test key and compatible model.
2. Test encrypted-key unlock and folder permission after a full browser restart.
3. Generate both PDFs from a long two-page profile and inspect page breaks.
4. Verify Vercel headers with `npm run check:csp -- https://<deployment>`.
5. Run the mocked production E2E with a unique sentinel key. Assert the sentinel appears only in the intercepted Anthropic request header: not in `location.href`, rendered text, browser console messages, own-origin requests, exported backup JSON, or `.next` build files.
6. Verify the deployed `/api/fetch-job` WAF rule with invalid-body requests as specified in §7.9.

---

## 10. Explicit non-goals

Do not add these to v1:

- accounts, authentication, teams, cloud sync, or any server database;
- a server proxy for Anthropic;
- mobile, Firefox, or Safari fallback mode;
- LinkedIn/Indeed-specific scraping, browser automation, login cookies, or headless rendering;
- Markdown rendering, rich text, arbitrary HTML, or `dangerouslySetInnerHTML`;
- automatic applications, email, calendars, reminders, notifications, analytics, or telemetry;
- multiple resume templates, custom fonts, photos, columns, themes, or drag-and-drop layout;
- real-time streaming, tools, batches, Files API uploads, prompt caching policy, or extended thinking;
- model recommendations based on price, hardcoded model IDs, or locally maintained pricing (catalog family heuristics without prices are allowed for defaults);
- automatic retries, background calls, scheduled calls, or calls without an explicit user action;
- semantic claims that provenance IDs prove truth; the user remains the final reviewer;
- merge-style backup import, PDF blobs in backup, or original resume retention;
- speculative repositories, service layers, generic factories, design systems, or abstractions with one implementation.

---

## 11. Definition of done and handoff

A task is done only when its acceptance criteria and verify command pass, its files contain no placeholders, and any README section that task owns matches reality. The app is done when §9 passes from a clean checkout and the Vercel deployment passes the six manual release checks.

The README must state:

- supported browsers and why;
- that data stays in the browser except resume/job/profile content sent directly to Anthropic and public URLs sent to the fetch route;
- where the key is stored for each mode and the limits of browser security;
- that arbitrary URL import creates the accepted relay/exfiltration risk in D14 and paste-only use avoids that route;
- how to rotate/revoke an Anthropic key and immediately lock/remove it from Career Genie;
- that uninstalling/clearing site data deletes local records;
- how to export/import backups;
- that Claude usage is billed to the user's key and the app does not estimate price;
- URL import limitations and paste fallback;
- Vercel WAF setup and verification for `/api/fetch-job`;
- local development, verification, and Vercel deployment commands.

When implementation discovers a contract conflict, update this plan and get explicit approval before code diverges. Do not hide divergence behind a type cast, disabled rule, skipped test, or undocumented fallback.