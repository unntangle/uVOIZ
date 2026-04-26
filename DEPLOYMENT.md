# Deployment Guide — uVOIZ on Vercel with Subdomain Routing

This guide walks through deploying the uVOIZ app to Vercel with subdomain-based routing for `unntangle.com`.

## Final URL structure

```
unntangle.com                   → Existing marketing site (untouched, hosted elsewhere)
unntangle.com/uvoiz             → uVOIZ marketing page (build later, also on marketing site)

uvoiz.unntangle.com             → THE BPO APP (this repo)
   /login                       → BPO login
   /sign-up                     → BPO signup
   /onboarding                  → BPO onboarding
   /forgot-password             → Password reset request
   /reset-password              → Password reset form
   /app/dashboard               → BPO dashboard
   /app/agents                  → AI Agents
   /app/campaigns               → Campaigns
   /app/calls                   → Live Calls
   /app/analytics               → Analytics
   /app/billing                 → Billing
   /app/team                    → Team management
   /app/settings                → Settings

console.unntangle.com           → Super admin console (this repo, same Vercel project)
   /dashboard                   → Global overview
   /clients                     → BPO clients
   /billing                     → Platform billing
   /credits                     → Credit ledger
   /health                      → System health
   /audit                       → Security & audit
   /settings                    → Platform settings
```

Both subdomains (`uvoiz.*` and `console.*`) are served by **the same Next.js app**.
Middleware reads the `Host` header and rewrites paths internally.

---

## Step 1 — Push to GitHub

If you haven't already:

```bash
git add .
git commit -m "Subdomain routing setup"
git push origin main
```

## Step 2 — Create a Vercel project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: **leave default** (the repo root)
5. Build command: **leave default** (`next build`)
6. Output directory: **leave default**
7. **Don't deploy yet** — first add environment variables (next step)

## Step 3 — Add environment variables in Vercel

In the project settings → **Environment Variables**, add the following for **Production**:

```
NEXT_PUBLIC_SUPABASE_URL=https://sjirtjxlemiqlljnlghf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<your supabase service role key>
JWT_SECRET=<generate a new random 64-char string>
SUPER_ADMIN_EMAIL=gokul@unntangle.com
SUPER_ADMIN_PASSWORD=<a strong password — change from local>
NEXT_PUBLIC_APP_URL=https://uvoiz.unntangle.com
COOKIE_DOMAIN=.unntangle.com
```

> **Important:** Generate a new `JWT_SECRET` for production. Don't reuse the dev one.
> Run this locally: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

> **`COOKIE_DOMAIN=.unntangle.com`** with the leading dot — this is what allows the
> session cookie to be shared between `uvoiz.unntangle.com` and `console.unntangle.com`.

## Step 4 — Deploy

Click **Deploy**. Vercel will build and assign you a default URL like
`uvoiz-abc123.vercel.app`. Don't worry about it — we're about to attach your
real domain.

## Step 5 — Add the custom domain

In Vercel project → **Settings → Domains**:

1. Click **Add Domain**
2. Enter `uvoiz.unntangle.com` and click **Add**
3. Click **Add Domain** again
4. Enter `console.unntangle.com` and click **Add**

Vercel will show you DNS records to add. They'll look like:

```
Type    Name        Value
CNAME   uvoiz       cname.vercel-dns.com.
CNAME   console     cname.vercel-dns.com.
```

## Step 6 — Add DNS records at your registrar

Go to wherever `unntangle.com` is registered (GoDaddy, Namecheap, Cloudflare, etc.)
and add the two CNAME records above.

> **If your DNS host is Cloudflare:** Set the CNAMEs to **DNS only** (gray cloud,
> not orange). Cloudflare's proxying interferes with Vercel's edge routing.

DNS propagation usually takes 5-30 minutes. You can check progress with:
```bash
nslookup uvoiz.unntangle.com
nslookup console.unntangle.com
```

Both should resolve to a Vercel IP once propagated.

## Step 7 — Vercel auto-issues SSL certificates

Once DNS is verified, Vercel automatically requests Let's Encrypt SSL certificates
for both subdomains. This usually takes 1-2 minutes after DNS propagates.

You'll see a green checkmark next to each domain in the Vercel dashboard when
the cert is ready.

## Step 8 — Test the deployment

1. Visit `https://uvoiz.unntangle.com` → should redirect to `/login`
2. Sign in with your super admin credentials
3. You should land on `https://console.unntangle.com/dashboard`
4. Click around — verify all nav items work (clean URLs like `/clients`, `/billing`)
5. Sign out, sign in with a BPO admin (or sign up a new BPO user)
6. You should land on `https://uvoiz.unntangle.com/app/dashboard`
7. Verify navigation works between dashboard, agents, campaigns, etc.

## Common issues & fixes

### "Invalid host header" or 404 on subdomain
DNS hasn't propagated yet OR the domain isn't added in Vercel. Check both.

### Cookie not shared between subdomains
Verify `COOKIE_DOMAIN=.unntangle.com` is set in production env vars
(with the leading dot). Then re-login to issue a new cookie.

### Middleware not rewriting
Check that `middleware.ts` is in the project root (not in `app/`). Vercel
deploys middleware as edge functions automatically.

### Logged in as super admin but seeing BPO pages
Clear cookies, log in again. Old JWT may have stale role data. After re-login,
super admin should auto-redirect to `console.unntangle.com`.

### Hot reload broken in local dev
Local subdomain dev requires accessing via `uvoiz.localhost:3000` and
`console.localhost:3000` (modern Chrome/Firefox/Edge support `*.localhost`
without hosts file edits). Plain `localhost:3000` still works but won't trigger
the subdomain rewrites.

---

## Local development

```bash
npm run dev
```

Then open in the browser:

- **BPO app:** http://uvoiz.localhost:3000/login
- **Super admin console:** http://console.localhost:3000/login
- **Plain (no subdomain):** http://localhost:3000/login (still works, no rewrites)

Sign-in flow uses these credentials:

| Role | Email | Password | Lands on |
|---|---|---|---|
| Super admin | `gokul@unntangle.com` | (your dev password) | `console.localhost:3000/dashboard` |
| BPO admin | `admin@v4u.com` | `admin123` | `uvoiz.localhost:3000/app/dashboard` |

---

## Future products on the same domain

When you add a second product (e.g. uMail), the same architecture extends:

1. Create new pages under `app/umail/` (or similar) in this repo, OR create a
   separate Next.js app for it
2. Add new domain `umail.unntangle.com` to the Vercel project (or a new project)
3. Add CNAME `umail` → `cname.vercel-dns.com.` in DNS
4. Update `middleware.ts` to detect the `umail.` subdomain and route accordingly
5. Cookie is already scoped to `.unntangle.com` so cross-product SSO works
   automatically — a user signed in on `uvoiz.*` is also signed in on `umail.*`

That's the whole multi-product flywheel: one auth, one billing, one identity,
multiple products sharing the same Unntangle account.
