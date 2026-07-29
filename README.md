# Career Genie

Career Genie tailors resumes locally in your browser with your own Anthropic API key. It requires current desktop Chrome or Microsoft Edge: the app needs IndexedDB, Web Crypto, and the File System Access API. Safari, Firefox, and mobile browsers are not supported.

## Privacy and key storage

Your profile, interview, jobs, usage, and settings stay in this browser's IndexedDB. Resume/profile content goes directly from your browser to Anthropic when you request an AI call. Public job URLs go to the app's `/api/fetch-job` route; pasted job text does not. Original resume uploads and generated PDF caches are not persisted.

Choose one storage mode:

- **Encrypted** (default): only encrypted key material and its last four characters are stored. Unlock it with a 12+ character passphrase after reload.
- **Session**: the key remains only in memory until the tab reloads or is locked.
- **Plaintext**: stores the key unencrypted in this browser after explicit confirmation.

Browser storage cannot protect an unlocked key from malicious extensions, compromised dependencies, or a compromised browser. Rotate or revoke a key in Anthropic Console, then lock Career Genie and replace or remove the saved key. Clearing site data or uninstalling the browser deletes local records; it cannot erase downloaded files or browser backups.

## Backups and usage

Settings can export a checksummed JSON backup and import it as a complete replacement. Backups exclude keys, key hints, folder handles, PDFs, and uploaded resumes. Import automatically downloads a safety backup when local data exists.

Usage reports show tokens grouped by model and call type. Anthropic bills usage to your own key; Career Genie does not estimate prices.

## URL import warning

URL import is best-effort: login walls, WAFs, bot protection, and client-rendered job boards often fail, so paste job text instead. As accepted in D14, any URL fetch route has residual relay/exfiltration risk if a malicious client dependency encodes sensitive data in a public URL. Paste-only use avoids that route.

## Jobs and versions

Use **Jobs** to add a posting by URL or pasted text, then review the AI analysis before saving it. Job text and AI output are always shown as plain text. Each tailored resume and cover letter is an immutable version: regeneration creates a new AI version, and saving edits creates a new manual version. PDFs are generated locally with Helvetica and can be regenerated from any saved version.

## Development and deployment

```bash
npm ci
npm run dev
npm run lint && npm run typecheck && npm run build
npm run check
```

Deploy as a normal Next.js project on Vercel. Configure a fixed-window Vercel WAF rule for `POST /api/fetch-job`: 20 requests per IP per 10 minutes, returning 429 after the limit. Verify from one IP with 21 invalid-body POSTs: the first 20 should return 400 and the 21st 429 without running the function.

## Desktop app (Windows and Linux)

Tagged releases (`v*`) build self-contained desktop installers via [`.github/workflows/release.yml`](.github/workflows/release.yml) and attach them to the GitHub Release:

| Platform | Artifact |
|---|---|
| Windows | `Career Genie-Setup-<version>.exe` |
| Linux (amd64) | `career-genie_<version>_amd64.deb` |

Each installer bundles embedded Chromium (Electron) and a local Next.js server. Launch **Career Genie** from the Start menu (Windows) or application menu (Linux). The app opens in its own window — no separate Chrome, Edge, or Firefox install required.

The hosted web app still requires current desktop Chrome or Microsoft Edge.

To cut a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

To run the desktop shell locally during development:

```bash
npm run desktop:dev
```

## Vercel WAF rate limit

In the Vercel Dashboard, open the production project, then **Firewall** → **Rate Limiting** → **Create rule**. Match method `POST` and path `/api/fetch-job`, use a fixed window keyed by client IP, set the threshold to **20 requests** and the window to **10 minutes**, and choose a `429` response. Publish the rule to production. The interactive `vercel firewall` command can create or inspect the same project firewall configuration; run `vercel firewall --help` first because its options are CLI-version specific.

After deployment, verify the rule from one IP with invalid JSON bodies. Requests 1–20 must reach the route and return `400`; request 21 must return `429`.

```bash
for i in $(seq 1 21); do
  curl -sS -o /dev/null -w "%{http_code}\n" \
    -X POST "https://<deployment>/api/fetch-job" \
    -H "content-type: application/json" --data '{'
done
```

Run the local executable checks with `npm run check`, and verify deployed CSP headers and per-request nonces with `npm run check:csp -- https://<deployment>`. The paid grounding release check requires a low-value compatible key: `ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... npm run eval:grounding`.

`npm audit --omit=dev --audit-level=high` is also required in CI. Transitive `postcss` and `sharp` versions inherited from Next.js are pinned to patched releases via `package.json` overrides.
