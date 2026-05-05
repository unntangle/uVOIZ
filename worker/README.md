# uVOIZ Worker

The live voice agent that handles a phone call. Separate from the Next.js app.

## What this is

A Python service that joins a LiveKit room as a participant, runs the
Sarvam STT → OpenAI → Sarvam TTS pipeline against whatever audio the
room produces, and talks back. Hosted on LiveKit Cloud in production.

The Next.js app (in the parent directory) handles UI, billing, agent
config storage, and the dialer cron. It does NOT handle live audio.

## Prerequisites

- Python 3.10 or newer
- A LiveKit Cloud account ([cloud.livekit.io](https://cloud.livekit.io)) with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in `../.env.local`
- A Sarvam API key in `../.env.local` as `SARVAM_API_KEY`
- An OpenAI API key in `../.env.local` as `OPENAI_API_KEY`

The worker reads `../.env.local` so all keys live in one place,
shared with the Next.js side.

## Install

Pick one. They're equivalent.

### With uv (recommended)

```bash
cd worker
uv venv
uv pip install -e .
```

### With plain pip

```bash
cd worker
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run modes

### `console` — talk via your laptop mic and speakers

The fastest way to verify the pipeline works end to end. No LiveKit
server, no browser, no phone. Just:

```bash
python agent.py console
```

You'll hear the agent greet you in Hindi. Say something back. The
agent should respond. If it doesn't, check the logs — common
problems are listed below.

### `dev` — run a worker that LiveKit Cloud can dispatch jobs to

```bash
python agent.py dev
```

This mode connects to your LiveKit Cloud project and waits for
incoming jobs. Hot-reloads on file changes. Pair it with the
[Agents Playground](https://agents-playground.livekit.io) to test
in a browser without setting up a phone — connect the playground
to the same LiveKit project and the playground's audio will be
routed to your local worker.

### `start` — production mode

```bash
python agent.py start
```

What `lk agent deploy` runs inside the LiveKit Cloud container. No
hot-reload, optimized for stability.

## Deploying to LiveKit Cloud

Once the worker behaves correctly in `console` and `dev` modes:

```bash
# Install the CLI once
brew install livekit-cli   # or see docs.livekit.io for other platforms

# Authenticate
lk cloud auth

# Deploy
lk agent deploy
```

`livekit.toml` in this folder controls the deploy. Update its
`subdomain` to match your actual LiveKit Cloud project id before
the first deploy.

After deploy, set the required env vars (`SARVAM_API_KEY`,
`OPENAI_API_KEY`, `OPENAI_MODEL`) in your LiveKit Cloud project's
Settings → Environment. The local `.env.local` is NOT used by the
deployed agent.

## Common problems

**"SARVAM_API_KEY not set" on startup**
The `load_dotenv("../.env.local")` call only finds the file if you
run `python agent.py` from the `worker/` directory. Don't run it
from the project root.

**Agent never speaks back in console mode**
Most often a microphone permission issue. Grant Python access to
your mic in your OS's privacy settings.

**Agent talks over you / cuts you off mid-sentence**
The Sarvam STT plugin handles VAD — don't add a `vad=` argument to
`AgentSession`. The current `agent.py` already gets this right;
this note is a future-self warning.

**LiveKit playground says "no agent available"**
Check that you're running `python agent.py dev` (not `console`)
and that `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in
`../.env.local` match the project you opened in the playground.

## Roadmap

This is the first iteration. Next milestones:

- Read campaign config (script, persona, language) from room
  metadata pushed by the Next.js dialer cron, instead of using
  hardcoded defaults
- Write call outcome (transcript, sentiment, conversion) back to
  the Next.js `/api/webhooks` endpoint at end of session
- Apply TRAI compliance rules from `lib/compliance.ts` — refuse to
  start a call if the room metadata says the agent has no DLT
  template id (in strict mode)
- Wire up SIP bridge so TeleCMI calls can reach the worker
