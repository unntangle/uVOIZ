# uVOIZ — AI Telecaller SaaS for Indian BPOs

> Fully custom-built. No Clerk. No watermarks. 100% your brand.
> Replace human telecallers with AI. Calls in Hindi, Tamil, Telugu, Kannada, English.

---

## Quick Start (5 minutes)

### Step 1 — Install
```bash
cd D:\unntangle\uVOIZ
npm install
```

### Step 2 — Create Supabase project (free)
1. Go to supabase.com → New project
2. Open SQL Editor → paste contents of `lib/schema.sql` → click Run
3. Go to Settings → API → copy your URL and keys

### Step 3 — Create .env.local
```bash
copy .env.example .env.local
```
Open `.env.local` and fill in at minimum:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET` (any long random string)

### Step 4 — Run
```bash
npm run dev
```
Open http://localhost:3001

### Step 5 — Create your account
- Go to http://localhost:3001/sign-up
- Enter your company name, email, password
- You're in — no external auth needed!

---

## What makes this a real SaaS

| Feature | Status |
|---------|--------|
| Custom branded login (no Clerk watermark) | ✅ |
| JWT session auth (bcrypt + jose) | ✅ |
| Multi-tenant (each BPO = isolated org) | ✅ |
| Supabase database | ✅ |
| VAPI real AI calls | ✅ |
| Razorpay billing (UPI, cards) | ✅ |
| TRAI compliance settings | ✅ |
| 8 Indian languages | ✅ |

---

## API Keys needed for production

| Service | Cost | Purpose |
|---------|------|---------|
| Supabase | Free | Database |
| VAPI | Pay per minute | AI voice calls |
| OpenAI | Pay per token | Conversation AI |
| ElevenLabs | Free tier | Voice synthesis |
| Deepgram | Free tier | Speech to text |
| Exotel | Pay per call | Indian telephony |
| Razorpay | Free to set up | Payments |

---

## Auth Flow

```
User visits any page
  → middleware checks for uvoiz_session cookie
  → No cookie → redirect to /sign-in
  → Has cookie → verify JWT → allow access

Sign Up:
  email + password + company name
  → bcrypt hash password
  → create organization in Supabase
  → create user in Supabase
  → create JWT → set cookie → redirect to /onboarding

Sign In:
  email + password
  → bcrypt compare
  → create JWT → set cookie → redirect to /dashboard

Sign Out:
  DELETE cookie → redirect to /sign-in
```

---

## Deployment

```bash
npm install -g vercel
vercel --prod
```

Add all `.env.local` variables in Vercel Dashboard → Settings → Environment Variables.
Update `NEXT_PUBLIC_APP_URL` to your production domain.

---

## Pricing to sell to BPOs

| Plan | Price | Your infra cost | Profit |
|------|-------|-----------------|--------|
| Starter | Rs.15,000/mo | ~Rs.4,000 | Rs.11,000 |
| Pro | Rs.40,000/mo | ~Rs.18,000 | Rs.22,000 |
| Agency | Rs.1,00,000/mo | ~Rs.45,000 | Rs.55,000 |

---
