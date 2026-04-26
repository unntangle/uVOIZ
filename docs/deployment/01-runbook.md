# uVOIZ Deployment Runbook

**Stack:** Vercel Pro · Supabase · Cloudflare R2 · Inngest · Resend · TeleCMI · GitHub Actions
**Subdomains:** `uvoiz.unntangle.com` (BPO app) · `console.unntangle.com` (super admin)
**Target cost (Stage 1, pre-customer):** ~₹1,700/mo fixed (Vercel Pro). Everything else free or pass-through.

This runbook walks through every step from "code on my laptop" to "production live on subdomains." Read it sequentially the first time. Each section has a rollback note at the bottom.

---

## Pre-deploy checklist (do these BEFORE anything else)

These are non-negotiable. Skipping them produces silent failures in production.

- [ ] **Run the pending SQL migrations in Supabase.** All migrations in `supabase/migrations/`. Without these, settings, password reset, and onboarding fail in production.
- [ ] **Rotate the Supabase service-role key.** It was exposed in chat history. Settings → API → Reset `service_role`. Update `.env.local` AND prepare to update Vercel env vars in Step 2.
- [ ] **Migrate super admin to DB.** Sign up `gokul@unntangle.com` with a real password via the normal sign-up flow, then in Supabase SQL Editor: `UPDATE users SET role='super_admin' WHERE email='gokul@unntangle.com';`. Then DELETE the `DEMO_USERS` array from `app/api/auth/login/route.ts`. **Do not deploy with hardcoded demo passwords.**
- [ ] **Replace JWT_SECRET fallback in middleware.ts.** Currently has `'voiceai_jwt_secret_change_in_production_2024'` as a fallback. The secret in production must come from env vars only. Generate a new one: `openssl rand -hex 64`.
- [ ] **Fix the agents route filesystem write.** In `app/api/agents/route.ts`, two `require('fs').writeFileSync('scratch/error.log', ...)` calls will crash on Vercel (read-only filesystem). Replace with `console.error(...)` — Vercel captures stdout/stderr automatically.
- [ ] **Check `/api/analytics/stats` exists.** Currently 404s, dashboard stat cards silently fail. Either build it or make the dashboard tolerate the missing endpoint without a console error.

---

## Stage 0: Prerequisites

You need accounts on:

| Service | Sign up | Notes |
|---|---|---|
| GitHub | github.com | Code lives here |
| Vercel | vercel.com (sign in with GitHub) | Will become Pro after first project |
| Supabase | supabase.com | Already have project `sjirtjxlemiqlljnlghf` |
| Cloudflare | cloudflare.com | For R2 + DNS |
| Inngest | inngest.com | Background jobs |
| Resend | resend.com | Transactional email |
| TeleCMI | telecmi.com | Telephony — needs sales contact for production keys |
| Razorpay | razorpay.com | Already integrated |
| Sentry | sentry.io | Error tracking (optional but recommended) |
| UptimeRobot | uptimerobot.com | Uptime monitoring (optional) |

Local tools:
- Node 20+
- Git
- `gh` CLI (optional, makes GitHub setup faster)

---

## Step 1: Push code to GitHub

```powershell
# From D:\unntangle\uVOIZ\uVOIZ
cd D:\unntangle\uVOIZ\uVOIZ

# Verify .gitignore covers .env.local — it should.
# If not, add this line:
#   .env.local
# DO NOT commit .env.local. It contains secrets.

git status
git add .
git commit -m "Pre-deploy: production-ready state"

# Create the repo on GitHub. Either via web UI, or:
gh repo create unntangle/uvoiz --private --source=. --push
```

If you already have a repo, just `git push origin main`.

**Verify:** Open the repo on GitHub. Confirm `.env.local` is NOT in the file list. If it is, immediately `git rm --cached .env.local`, commit, push, and rotate every key in it.

---

## Step 2: Vercel project setup

### 2.1 Import the repo

1. Go to vercel.com → **Add New** → **Project**
2. Select your `uvoiz` repo from the GitHub list
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: leave as `./`
5. Build command: `next build` (default)
6. Output directory: `.next` (default)
7. Install command: `npm install` (default)
8. **Don't deploy yet.** Click **Environment Variables** first.

### 2.2 Add environment variables

Add these in Vercel → Project Settings → Environment Variables. Set scope to **Production, Preview, and Development** unless noted.

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://sjirtjxlemiqlljnlghf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your publishable key>
SUPABASE_SERVICE_ROLE_KEY=<your NEW rotated service-role key>

# Auth
JWT_SECRET=<output of: openssl rand -hex 64>
COOKIE_DOMAIN=.unntangle.com

# App URLs
NEXT_PUBLIC_APP_URL=https://uvoiz.unntangle.com

# TeleCMI (placeholders until sales call complete)
TELECMI_APP_ID=
TELECMI_APP_SECRET=
TELECMI_FROM_NUMBER=
TELECMI_WEBHOOK_SECRET=

# Razorpay
RAZORPAY_KEY_ID=<live key when ready, test key for now>
RAZORPAY_KEY_SECRET=<live secret>
NEXT_PUBLIC_RAZORPAY_KEY_ID=<same as RAZORPAY_KEY_ID>

# R2 (object storage)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=uvoiz-recordings
R2_PUBLIC_URL=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Deepgram (transcription)
DEEPGRAM_API_KEY=

# Resend (email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@unntangle.com

# Cron auth
CRON_SECRET=<output of: openssl rand -hex 32>

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=
```

You'll fill in the empty ones in subsequent steps. The deploy will succeed without them; the features that need them will fail gracefully (we coded for that).

### 2.3 Deploy

Click **Deploy**. Wait ~3 minutes. You'll get a URL like `uvoiz-xyz.vercel.app`.

Visit it. Login page should load. Don't try to log in yet — you don't have a real super admin and DNS isn't routed.

### 2.4 Upgrade to Pro

Vercel → Account Settings → Plans → **Upgrade to Pro** ($20/mo).

This gives you:
- Commercial use rights (Hobby forbids it)
- 300 GB-hours/mo function compute
- 1 TB bandwidth
- Sub-daily cron jobs (every minute)
- 60s function timeout (vs 10s on Hobby)
- Team features for when you hire

**Rollback:** You can downgrade to Hobby anytime. Project keeps running but will throttle if you exceed Hobby limits.

---

## Step 3: DNS — wire up the subdomains

You're hosting `unntangle.com` somewhere already (since the marketing site exists). The subdomain CNAMEs need to point to Vercel. You can either keep DNS where it is, or move it to Cloudflare (recommended for the analytics + free DDoS protection).

### Option A: Keep current DNS provider

In your DNS dashboard, add:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `uvoiz` | `cname.vercel-dns.com.` | 300 |
| CNAME | `console` | `cname.vercel-dns.com.` | 300 |

### Option B: Move DNS to Cloudflare (recommended)

1. cloudflare.com → **Add a Site** → enter `unntangle.com`
2. Choose Free plan
3. Cloudflare scans your existing DNS records — verify everything is captured
4. At your registrar, change the nameservers to the two Cloudflare gives you (e.g. `lana.ns.cloudflare.com`, `walt.ns.cloudflare.com`)
5. Wait for propagation (5 min – 24 hours, usually <1 hr)
6. Once active, add the two CNAMEs above. **Set proxy status to DNS-only (grey cloud), not Proxied (orange cloud)** for these — Vercel handles its own SSL and Cloudflare proxying breaks WebSocket and some Vercel features.

### Add domains in Vercel

Vercel → Project → Settings → **Domains**

1. Add `uvoiz.unntangle.com`
2. Add `console.unntangle.com`
3. Vercel verifies the CNAMEs and provisions Let's Encrypt SSL certificates (~1 min)

**Verify:**
- `https://uvoiz.unntangle.com/login` loads
- `https://console.unntangle.com/login` loads
- Both have valid SSL (green padlock)
- The middleware should be doing the right routing — confirm by checking that internal paths render. E.g. `https://uvoiz.unntangle.com/app/dashboard` (will redirect to login since no session — that's expected and correct)

**Rollback:** Remove domains in Vercel, remove CNAMEs in DNS. The `*.vercel.app` URL still works as a backup.

---

## Step 4: Cloudflare R2 — call recording storage

R2 is S3-compatible object storage with **zero egress fees**. Critical for serving call recordings without bleeding bandwidth costs.

### 4.1 Create the bucket

1. Cloudflare dashboard → **R2** → **Create bucket**
2. Name: `uvoiz-recordings`
3. Location: **Asia-Pacific (APAC)** for best latency to Indian users
4. Create

### 4.2 Generate API credentials

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Permissions: **Object Read & Write**
3. Specify bucket: `uvoiz-recordings`
4. TTL: forever
5. Create. **Copy the Access Key ID and Secret Access Key immediately — they show once.**

Add to Vercel env vars:
```
R2_ACCOUNT_ID=<from Cloudflare → R2 → Account ID in sidebar>
R2_ACCESS_KEY_ID=<from token>
R2_SECRET_ACCESS_KEY=<from token>
R2_BUCKET=uvoiz-recordings
```

### 4.3 Public access (for signed URLs)

You don't want public bucket access — recordings are PII. Instead, generate **signed URLs** in your app code (5-min TTL) and serve those to the player.

For static-asset CDN in front of R2 (optional): Cloudflare R2 → bucket → **Settings** → **Public access** → **Custom domain**. Map `recordings.unntangle.com` → R2. Then `R2_PUBLIC_URL=https://recordings.unntangle.com`. Skip this in Stage 1; signed URLs are simpler.

### 4.4 Install the SDK

```powershell
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

R2 is S3-compatible, so the AWS SDK works.

### 4.5 Add the R2 helper

Create `lib/r2.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;

/** Upload a recording. Returns the R2 key. */
export async function uploadRecording(key: string, body: Buffer | Uint8Array, contentType = 'audio/mpeg') {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return key;
}

/** Generate a 5-minute signed URL for a recording. */
export async function getRecordingUrl(key: string, ttlSeconds = 300): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: ttlSeconds }
  );
}
```

**Verify:** From a Node REPL or a one-off API route, call `uploadRecording('test/hello.txt', Buffer.from('hi'))` and check it lands in the bucket.

**Rollback:** Delete bucket, revoke API token.

---

## Step 5: Inngest — background jobs

Inngest replaces "do this in a Vercel function with a 60s timeout" with a proper job queue: retries, exponential backoff, fan-out, and a UI to inspect failed jobs.

You need it for:
- Webhook processing (TeleCMI fires webhook → enqueue → return 200 in <500ms → process async)
- Recording fetch + R2 upload (long-running)
- Transcription (calls Deepgram, can take 30s+)
- Dialer orchestration (per-tenant rate-limited)

### 5.1 Sign up

1. inngest.com → sign up with GitHub
2. Create app: name it `uvoiz`
3. Copy the **Event Key** (for sending events) and **Signing Key** (for verifying incoming requests). Add to Vercel env:
   ```
   INNGEST_EVENT_KEY=...
   INNGEST_SIGNING_KEY=...
   ```

### 5.2 Install

```powershell
npm install inngest
```

### 5.3 Create the Inngest client

Create `lib/inngest.ts`:

```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'uvoiz',
  // Event key picked up from INNGEST_EVENT_KEY env var automatically
});
```

### 5.4 Create the API endpoint Inngest hits

Create `app/api/inngest/route.ts`:

```typescript
import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest';
import {
  processTelecmiWebhook,
  fetchAndStoreRecording,
  transcribeRecording,
  dialerTick,
} from '@/lib/jobs';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processTelecmiWebhook,
    fetchAndStoreRecording,
    transcribeRecording,
    dialerTick,
  ],
});
```

Job definitions (`lib/jobs.ts`) are in document **03-inngest-jobs.md** — copy that file in once you're ready.

### 5.5 Wire to Inngest cloud

1. Inngest dashboard → **Apps** → **Sync new app**
2. URL: `https://uvoiz.unntangle.com/api/inngest`
3. Inngest hits the URL, discovers your functions, registers them
4. You should see your 4 functions listed in the Inngest dashboard

**Verify:** From the Inngest dashboard, **Send test event** for `telecmi/webhook.received` with sample payload. Check it runs.

**Rollback:** Remove the `/api/inngest` route and unsync the app. Jobs stop firing; webhooks fall back to whatever sync handler you keep as the entry point.

---

## Step 6: Resend — transactional email

For password reset, email verification, daily digests, billing receipts.

### 6.1 Sign up + domain verification

1. resend.com → sign up
2. **Domains** → **Add Domain** → `unntangle.com`
3. Resend gives you DNS records (SPF, DKIM, DMARC). Add them to your DNS:
   - `TXT @ "v=spf1 include:_spf.resend.com ~all"`
   - `TXT resend._domainkey "<DKIM key>"`
   - `MX send.unntangle.com 10 feedback-smtp.us-east-1.amazonses.com` (the exact value Resend shows)
4. Wait for verification (5-30 min)

### 6.2 Generate API key

Resend → **API Keys** → **Create**. Permissions: Sending access only. Copy.

```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=no-reply@unntangle.com
```

### 6.3 Install + helper

```powershell
npm install resend
```

Create `lib/email.ts`:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL || 'no-reply@unntangle.com';

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return resend.emails.send({
    from: `uVOIZ <${FROM}>`,
    to,
    subject: 'Reset your uVOIZ password',
    html: `
      <p>Someone requested a password reset for your uVOIZ account.</p>
      <p><a href="${resetUrl}">Reset password</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, ignore this email.</p>
    `,
  });
}
```

### 6.4 Wire into forgot-password route

In `app/api/auth/forgot-password/route.ts`, replace the `console.log(resetUrl)` with `await sendPasswordResetEmail(email, resetUrl)`.

**Verify:** Trigger forgot-password from the UI. Check Resend dashboard → **Logs** for the send event. Email arrives within seconds.

**Rollback:** Revert to `console.log`. Password reset still works for whoever can read server logs.

---

## Step 7: GitHub Actions cron (fallback / pre-Pro)

Even on Vercel Pro you can use Vercel Cron, but GitHub Actions is a free, transparent fallback that survives if you ever leave Vercel. Useful for the every-minute dialer.

### 7.1 Create the workflow file

Create `.github/workflows/dialer-cron.yml`:

```yaml
name: Dialer Cron

on:
  schedule:
    # Every minute. Note: GitHub Actions cron has up to 5-min delay under load.
    # For Stage 1 this is fine. Move to Vercel Cron when latency matters.
    - cron: '* * * * *'
  workflow_dispatch:  # allow manual trigger from Actions tab

jobs:
  trigger-dialer:
    runs-on: ubuntu-latest
    steps:
      - name: Hit dialer endpoint
        run: |
          curl -X POST https://uvoiz.unntangle.com/api/cron/dialer \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            --max-time 30 \
            --fail-with-body
```

### 7.2 Add the secret

GitHub → repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
- Name: `CRON_SECRET`
- Value: (same value as in Vercel env)

### 7.3 Update the dialer route to require the secret

In `app/api/cron/dialer/route.ts`, at the top of the handler:

```typescript
const auth = req.headers.get('authorization');
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Also change the export from `GET` to `POST` to match the curl above.

**Verify:** Push to main. Wait 1 minute. Check **Actions** tab → most recent **Dialer Cron** run. Should be green. Check Vercel function logs for the dialer invocation.

**Rollback:** Disable the workflow in GitHub Actions UI. Switch to Vercel Cron via `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/dialer", "schedule": "* * * * *" }]
}
```

---

## Step 8: Sentry (optional, recommended)

Catches the bugs your users would otherwise have to report.

### 8.1 Install

```powershell
npx @sentry/wizard@latest -i nextjs
```

The wizard walks through it. Pick:
- **Yes** to source maps
- **Yes** to tracing
- **No** to session replay (heavy on free tier)

### 8.2 Add the env var

Wizard adds `NEXT_PUBLIC_SENTRY_DSN` automatically. Mirror it in Vercel.

**Verify:** Trigger a deliberate error (`throw new Error('test')` in a route). Check Sentry dashboard.

---

## Step 9: UptimeRobot (optional)

1. uptimerobot.com → sign up (free)
2. **Add New Monitor** → HTTP(s)
3. URL: `https://uvoiz.unntangle.com/login`
4. Interval: 5 minutes
5. Alert contacts: your email + WhatsApp via the integration if you want
6. Repeat for `https://console.unntangle.com/login`

---

## Step 10: TeleCMI integration

This is its own document — see **02-telecmi-integration.md**. Do that BEFORE going live with paying customers; everything else can deploy first.

---

## Final smoke tests

Run through this checklist on production URLs after all of the above is done:

- [ ] `https://uvoiz.unntangle.com/login` loads, SSL valid
- [ ] `https://console.unntangle.com/login` loads, SSL valid
- [ ] Sign up a new BPO user → onboarding wizard → dashboard
- [ ] Login with super admin (gokul@unntangle.com) → redirects to `console.unntangle.com/dashboard`
- [ ] Forgot password flow → email arrives → reset works
- [ ] Cookie persists across page reloads (test `.unntangle.com` cookie domain working)
- [ ] Cross-subdomain redirect: try logging in as super admin on `uvoiz.*` → bounces to `console.*`
- [ ] Razorpay test order works (test mode keys)
- [ ] GitHub Actions cron has fired at least once and returned 200
- [ ] Sentry has received at least one event (trigger one deliberately)
- [ ] R2 bucket has at least one test object uploaded successfully
- [ ] Inngest dashboard shows your app and 4 registered functions

---

## Operational notes

**Costs to watch:**
- Vercel function-hours: monitor in Vercel → Usage. Stay under 300 GB-hours/mo.
- Supabase DB size: free tier caps at 500 MB. Mostly call records + transcripts. Plan to upgrade to Pro ($25/mo) at ~50 active campaigns.
- R2 storage: 10 GB free. ~3,000 calls @ 3 MB each.
- Deepgram credits: pay as you go, $200 free credit on signup.
- Resend: 3,000 emails/mo free, then $20/mo for 50K.

**Emergency contacts:**
- Vercel status: vercel-status.com
- Supabase status: status.supabase.com
- Cloudflare status: cloudflarestatus.com
- TeleCMI: ops@telecmi.com (confirm during sales call)

**Backup strategy (Stage 1):**
- Weekly: `pg_dump` from Supabase → upload to R2 → keep last 4 weeks. Automate later.
- R2 has 11 9's of durability; no separate backup needed for recordings.

**When to revisit this runbook:**
- First paying customer signed → add Supabase Pro for backups + Mumbai region
- 5th paying customer → consider moving outbound API caller to Fly.io if TeleCMI requires static IP
- 10 GB R2 used → it's fine, costs ~$0.015/GB/mo after free tier
- Hit 80% of Vercel Pro function quota → optimize cold paths, not a panic
