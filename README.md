# Airtrohp

Airtrohp is a premium AI coding assistant platform: landing page, guest chat (5 free messages enforced on the server), Firebase accounts, a streaming Gemini-powered chat, project workspace with file/ZIP uploads, Patreon memberships (Free / Pro / Ultimate-ready), a user dashboard and an admin dashboard.

```
Browser (React + Vite, hosted on Vercel)
        |  HTTPS, Firebase ID token  or  signed guest token
        v
Cloudflare Worker  (worker/)  -- GEMINI_API_KEY lives ONLY here
        |-- verifies Firebase ID tokens (RS256, Google public keys)
        |-- Durable Object counters: guest limit, daily quotas, rate limits
        |-- Firestore REST (service account): plans, usage stats, Patreon links
        |-- Patreon OAuth + webhook
        v
Google Gemini API (streamGenerateContent, SSE)
```

Firestore is also read/written **directly by the browser** for the signed-in user's own conversations, messages, projects and preferences. `firestore.rules` restricts that to the owner and makes plan/usage/Patreon data server-only.

## Repository layout

```
airtrohp/
├─ index.html                 Vite entry (SEO meta, fonts, "powered by DevTop" bar)
├─ package.json  vite.config.ts  tsconfig.json  tailwind.config.js  postcss.config.js
├─ vercel.json                SPA rewrites + security headers
├─ .env.example               Frontend variables (placeholders) + list of Worker secrets
├─ firestore.rules  firestore.indexes.json  firebase.json
├─ public/favicon.svg
├─ src/
│  ├─ main.tsx  App.tsx  index.css
│  ├─ lib/        api (streaming client), firebase, guest, storage, workspace, files (safe ZIP), prefs, ...
│  ├─ context/    AuthContext, StorageContext, ToastContext
│  ├─ hooks/      useChat (streaming, edit, regenerate, stop), useMisc
│  ├─ components/ chat/ (ChatView, Composer, MessageItem, Markdown, CodeBlock), layout/, ui/
│  └─ pages/      Landing, AuthPages, ChatPage, Dashboard, Settings, Workspace, Admin, NotFound
└─ worker/
   ├─ wrangler.toml  package.json  tsconfig.json  .dev.vars.example
   ├─ src/  index.ts (router/CORS)  chat.ts  gemini.ts  auth.ts  usage.ts (Durable Object)
   │        firestore.ts  store.ts  patreon.ts  admin.ts  config.ts  utils.ts  env.ts
   └─ test/run.ts            65 integration tests (mocked Gemini/Firebase/Patreon)
```

## What is real and what needs your credentials

Everything below is implemented in code. Features that talk to a third party **cannot work until you add your own credentials**, and they have not been exercised against the real services (see "Verification status").

| Feature | Needs |
|---|---|
| Chat / streaming | Gemini API key (Worker secret) |
| Accounts, history, workspace | Firebase project (Auth + Firestore) |
| Server-side quotas, plans, admin stats | Firebase service account (Worker secret) |
| Pro membership | Patreon client + campaign + webhook (all optional until you want billing) |

---

## 1. Run it locally

```bash
npm install
cp .env.example .env.local        # fill in VITE_* values (section 4)
npm run dev                        # http://localhost:5173

cd worker
npm install
cp .dev.vars.example .dev.vars    # fill in secrets; git-ignored
npx wrangler dev                   # http://localhost:8787
```

Set `VITE_API_URL=http://localhost:8787` and keep `http://localhost:5173` in `ALLOWED_ORIGINS` (`worker/wrangler.toml`).

## 2. GitHub

1. Create an empty repository on GitHub (private is fine).
2. In this folder:
   ```bash
   git init && git add . && git commit -m "Airtrohp"
   git branch -M main
   git remote add origin https://github.com/<you>/airtrohp.git
   git push -u origin main
   ```
3. **Commit:** everything in this folder, including `worker/`, `firestore.rules`, `.env.example`, `worker/.dev.vars.example`.
4. **Never commit:** `.env`, `.env.local`, `worker/.dev.vars`, any Firebase service-account JSON, any API key. `.gitignore` already excludes them. Real secrets live only in Cloudflare (Worker) and Vercel (public `VITE_*` values only).
5. If a secret ever reaches Git history, rotate it immediately (new Gemini key, new service-account key, new Patreon secret).

## 3. Cloudflare Worker (backend)

```bash
cd worker
npm install
npx wrangler login
```

1. Edit `worker/wrangler.toml` `[vars]`:
   - `FIREBASE_PROJECT_ID`: your Firebase project ID
   - `ALLOWED_ORIGINS`: your Vercel URL(s), comma separated, no trailing slash (keep `http://localhost:5173` for dev)
   - `FRONTEND_URL`: your primary Vercel URL
   - `GEMINI_MODEL` / `GEMINI_MODEL_PRO`: model names. **Check Google's current model list and change these if a name has been retired.**
2. Create the secrets (each command prompts for the value; nothing goes in a file):
   ```bash
   npx wrangler secret put GEMINI_API_KEY            # from https://aistudio.google.com/apikey
   cat serviceAccount.json | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
   npx wrangler secret put APP_SECRET                # 32+ random chars, e.g. `openssl rand -base64 48`
   npx wrangler secret put ADMIN_UIDS                # your Firebase UID(s), comma separated (section 5)
   # Patreon (later, section 6):
   npx wrangler secret put PATREON_CLIENT_ID
   npx wrangler secret put PATREON_CLIENT_SECRET
   npx wrangler secret put PATREON_WEBHOOK_SECRET
   ```
   `GEMINI_API_KEY` is read only inside the Worker (`env.GEMINI_API_KEY`), sent to Google in a request header, and never returned to the browser. Delete `serviceAccount.json` from your disk afterwards or keep it outside the repo.
3. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Wrangler prints the URL, e.g. `https://airtrohp-api.<subdomain>.workers.dev`. Open `<url>/api/health`; you should see `{"ok":true,...}`.
4. The Durable Object (`UsageCounter`) is created automatically by the migration in `wrangler.toml` (SQLite-backed, available on the free plan).
5. Put that URL into Vercel as `VITE_API_URL` (section 4) and into `PATREON_REDIRECT_URI` in `wrangler.toml` (`<url>/api/patreon/callback`), then redeploy the Worker.

Tuning without code changes: `GUEST_MESSAGE_LIMIT` (default 5), `GUEST_IP_DAILY_LIMIT` (15), `RATE_LIMIT_PER_MINUTE` (12), and `TIER_CONFIG` (JSON overrides for price, daily messages, context size per tier). Defaults: Free 20 messages/day, Pro 300/day, Ultimate 1000/day (disabled until `ENABLE_ULTIMATE=true`).

## 4. Firebase

1. https://console.firebase.google.com → **Add project**. Under Project settings → General, set the **Public-facing name** to `Airtrohp` (it appears in verification and reset emails).
2. **Authentication → Sign-in method → Email/Password → Enable.** Leave "Email link" off.
3. **Authentication → Settings → Authorized domains:** add your Vercel domain.
4. **Authentication → Templates:** optionally edit the verification and password-reset emails.
5. **Firestore Database → Create database** (production mode, pick a region).
6. Deploy the security rules (either way):
   - Console: Firestore → Rules → paste the contents of `firestore.rules` → Publish, or
   - CLI: `npm i -g firebase-tools && firebase login && firebase use <project-id> && firebase deploy --only firestore:rules`
7. **Web app config:** Project settings → General → Your apps → Add web app → copy the config into Vercel / `.env.local`:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
   These are public identifiers; security comes from the rules and the Worker.
8. **Service account (backend only):** Project settings → Service accounts → Generate new private key. Store the JSON as the `FIREBASE_SERVICE_ACCOUNT` Worker secret (section 3). Never put it in the frontend or Git.

### What is stored in Firestore

| Path | Written by | Notes |
|---|---|---|
| `users/{uid}` | Worker (created on first `/api/me`); client may change only `displayName`, `preferences` | holds membership, so it can't be self-upgraded |
| `users/{uid}/conversations/{id}/messages/{id}` | the user | owner + verified email only |
| `users/{uid}/projects/{id}/files/{id}` | the user | workspace |
| `usage_daily`, `stats`, `stats_daily`, `patreon_links`, `private_tokens` | Worker only | no client rules, so clients are denied |

## 5. Vercel (frontend)

1. https://vercel.com/new → import the GitHub repository.
2. Framework preset **Vite** (auto-detected; `vercel.json` sets build to `npm run build`, output `dist`).
3. Environment Variables (Production and Preview): `VITE_API_URL` and the six `VITE_FIREBASE_*` values from `.env.example`.
4. Deploy. Then make sure the final Vercel URL is in the Worker's `ALLOWED_ORIGINS` and `FRONTEND_URL`, and in Firebase authorized domains. Redeploy the Worker after changing vars.
5. **Become admin:** register in Airtrohp and verify your email, copy your UID from Firebase Console → Authentication → Users, run `npx wrangler secret put ADMIN_UIDS` with that UID, then reload. (Alternatively set `ADMIN_EMAILS`; it only counts when the Firebase token says the email is verified.) The Admin link appears in the sidebar, but the Worker is what grants access.

## 6. Patreon (memberships)

Billing is optional. Until configured, the dashboard shows that billing is unavailable and everyone is on Free.

1. Create a Patreon creator page with a tier priced **$9.99/month** (Airtrohp Pro).
2. https://www.patreon.com/portal/registration/register-clients → **Create client**.
   - **Redirect URIs:** `https://airtrohp-api.<subdomain>.workers.dev/api/patreon/callback`
   - Copy **Client ID** and **Client Secret** → `wrangler secret put PATREON_CLIENT_ID` / `PATREON_CLIENT_SECRET`.
3. Find your campaign and tier IDs using the **Creator's Access Token** shown on the client page:
   ```bash
   curl -H "Authorization: Bearer <CREATOR_ACCESS_TOKEN>" "https://www.patreon.com/api/oauth2/v2/campaigns"
   curl -H "Authorization: Bearer <CREATOR_ACCESS_TOKEN>" "https://www.patreon.com/api/oauth2/v2/campaigns/<CAMPAIGN_ID>?include=tiers&fields%5Btier%5D=title,amount_cents"
   ```
   Put `PATREON_CAMPAIGN_ID` and `PATREON_PRO_TIER_ID` in `wrangler.toml`. Set `PATREON_JOIN_URL` to your public Patreon page (used by the "Upgrade on Patreon" button).
4. **Webhook:** Patreon developer portal → Webhooks → Create. URI `https://airtrohp-api.<subdomain>.workers.dev/api/patreon/webhook`; triggers `members:pledge:create`, `members:pledge:update`, `members:pledge:delete` (and `members:create/update/delete` if offered). Copy the webhook secret → `wrangler secret put PATREON_WEBHOOK_SECRET`.
5. **Ultimate (future):** create a second Patreon tier, set `PATREON_ULTIMATE_TIER_ID`, `ENABLE_ULTIMATE = "true"`, and adjust price/limits in `TIER_CONFIG`. No code change is needed.
6. **How access works:** the user pledges on Patreon, clicks **Connect Patreon** in the dashboard (OAuth, scopes `identity identity.memberships`), and the Worker reads the membership straight from Patreon, matching your campaign and tier IDs. The webhook then keeps it current; the Worker also re-verifies with Patreon every 6 hours on `/api/me`, and treats a membership past its next charge date (plus 3 days' grace) as expired. A declined payment, cancellation, or revoked OAuth removes Pro. The browser never sends or decides plan information.
7. **Test it (needs two Patreon accounts; you cannot pledge to your own campaign):** pledge from a second account to the Pro tier → in Airtrohp log in as a different user → Connect Patreon → dashboard shows Pro and the 300/day allowance → cancel the pledge → within a webhook delivery (or after **Re-verify**) the account returns to Free. Check `wrangler tail` for logs.

## 7. Security model (what is and isn't protected)

- **Gemini key:** Worker secret only. Not in the frontend bundle, env vars, repo, config, or responses (a test asserts it never appears in a response).
- **Auth:** the Worker verifies every Firebase ID token itself (signature against Google's JWKS, `iss`, `aud`, `exp`, `iat`, `sub`). It does not trust the client. Token revocation is **not** checked per request; a disabled account is blocked via a `disabled` flag the Worker checks on chat, and Firebase blocks token refresh within about an hour.
- **Guest limit:** a server-signed guest token (HMAC) is counted in a Durable Object, atomically, before Gemini is called. A second counter limits guest messages per IP per day (default 15) so clearing browser storage doesn't mint unlimited fresh guests. **This is not impossible to bypass:** someone who changes IP address and clears storage can get another five messages, and a shared network (office, school) shares the IP cap. Regenerate and edit each count as a message. Tighten `GUEST_IP_DAILY_LIMIT` or add Cloudflare Turnstile if abuse appears.
- **Quotas and rate limits:** per-user daily counters and per-minute burst limits are in Durable Objects; failed upstream calls are refunded.
- **Admin:** granted only by Worker secrets `ADMIN_UIDS` / `ADMIN_EMAILS`. Not a database field, not a client check.
- **Patreon:** webhook HMAC-MD5 signature verified over the raw body with a constant-time compare; OAuth `state` is HMAC-signed, expires in 10 minutes, and is bound to the Firebase UID.
- **CORS:** only origins in `ALLOWED_ORIGINS`.
- **Uploads:** read as text in the browser only. ZIPs are filtered before decompression (path traversal, extension allow-list, ignored dirs, size and entry-count caps). Uploaded code is **never executed**; if you ever add execution it must run in a separate, isolated sandbox.
- **Prompt safety:** the system prompt and Gemini's built-in safety filters decline clearly harmful requests (credential theft, malware, phishing, unauthorized access). That is policy by instruction, not a guarantee.
- **Privacy:** messages and attachments are sent to Google's Gemini API. Tell your users (the FAQ already does). You still need to write your own Terms and Privacy Policy pages.

## 8. "powered by DevTop" footer

`index.html` includes the DevTop bar (Go to our page, plus the hidden Post option) with the DevTop hub's own public Firebase web config and a SHA-256 hash of the post code. No plain code or credentials are in the source. To remove it, delete the `#devtopBar` element and the script after it, and the `#devtopBar` CSS block in `src/index.css`, and the `--devtop-h` padding.

## 9. Verification status (honest)

Run in the build sandbox (no internet package installs were possible there):

- Worker: `tsc` strict typecheck clean; **65 integration tests pass** (`cd worker && npm test`) using mocked Gemini, Firebase keys and Patreon payloads. They cover: exactly 5 guest messages and the 6th blocked, refresh not resetting the count, forged guest tokens, IP cap, Firebase token checks (tampered/expired/wrong aud/iss/kid), unverified-email block, daily limits, rate limiting, refund on upstream failure, streaming assembly, key never leaked, CORS, admin permissions, admin-by-email requires verified email, disabled accounts, webhook signature (HMAC-MD5 checked against Node's implementation), Pro activation, decline/cancel downgrade, expiry fallback, OAuth state forgery.
- Frontend: library logic tests (path safety, code-block/file extraction, file-type detection) pass; all source files parse; a partial typecheck against stubbed React/Firebase types was clean.

**Not run (could not be, here):** `npm install` / `vite build` / full frontend typecheck, any browser (so visual design, mobile responsiveness, console errors and every button were not exercised), real Firebase sign-up/verification/reset emails, real Gemini calls and streaming, real Firestore REST calls and the security rules (no emulator), Cloudflare runtime and real Durable Objects, Patreon OAuth and webhooks, ZIP extraction (needs `fflate`), file upload UI. Treat these as the first things to test after deploying:

- [ ] `npm install && npm run build` finishes with no TypeScript errors
- [ ] Landing page renders on desktop, tablet, phone; no console errors
- [ ] Register → verification email arrives → verify → lands in chat; password reset email works
- [ ] Guest chat: counter shows 5, decrements per message, 6th is blocked with the Create account prompt, reload does not reset it
- [ ] Guest conversation appears in the account after registering
- [ ] Streaming works, Stop works, Edit and Regenerate work, code Copy/Download work
- [ ] Attach a few files and a ZIP; Workspace upload; "Chat with project"
- [ ] Dashboard usage matches messages sent; Admin page shows counts; a non-admin gets 403
- [ ] Patreon flow per section 6, including cancellation
- [ ] Firestore rules: in the Rules Playground confirm another user's `users/{uid}/...` and `users/{uid}` membership edits are denied

## Known limitations

- Code execution is intentionally not implemented.
- Attachments are text/code only (no images or PDFs).
- Conversation titles come from the first message (rename any time).
- Gemini token counts come from the API's usage metadata; dollar costs are not tracked.
- No in-app account deletion or email change (use Firebase console / password-reset email for now).
- Terms of Service and Privacy Policy pages are not included.
