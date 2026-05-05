# ============================================
# uVOIZ Voice Agent Worker
# ============================================
#
# This is the LIVE process that handles a phone call. It is NOT part
# of the Next.js app. It runs as a separate Python service hosted
# on LiveKit Cloud (or locally during dev).
#
# Lifecycle:
#   1a. (Today) The user clicks "Test Call" on an agent in the
#       Next.js app. The browser hits /api/livekit/token which mints
#       a token and writes JSON metadata into the new room.
#   1b. (Future) The Next.js dialer cron tells TeleCMI to call a
#       customer; TeleCMI bridges that call audio into a LiveKit
#       room with similar metadata.
#   2. LiveKit dispatches a job to this worker; entrypoint() runs.
#   3. The worker reads the room's metadata, configures the Sarvam
#      STT + OpenAI + Sarvam TTS pipeline for the right agent, and
#      starts the conversation.
#   4. When the room empties (caller hangs up / user closes the
#      dialog) the session ends and the worker shuts down.
#
# How to test locally without a phone:
#   $ cd worker
#   $ uv pip install -e .         # or: pip install -r requirements.txt
#   $ python agent.py console     # talks to your laptop mic & speakers
#
# How to test in browser without a phone:
#   $ python agent.py dev         # starts the worker, hot-reloads
#   - Use https://agents-playground.livekit.io to test the worker
#     itself with no metadata (default config)
#   - OR use the "Test Call" button on /app/agents in the Next.js
#     dev server, which will dispatch to this same worker with
#     real metadata pulled from the agents row
#
# How to deploy to LiveKit Cloud:
#   $ lk agent deploy             # uses livekit.toml in this folder
# ============================================

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import openai, sarvam

# -----------------------------------------------------------------
# Setup
# -----------------------------------------------------------------

# .env.local lives in the parent directory (the Next.js project root).
# We deliberately share env files between the Next.js app and the
# worker so SARVAM_API_KEY etc. only need to be set in one place.
# When deployed to LiveKit Cloud, env vars are injected by the
# platform and this load_dotenv call is a no-op.
load_dotenv(dotenv_path="../.env.local")

# Mirror the Next.js side's logger format so worker logs and app
# logs read consistently when both end up in the same observability
# pipeline (Vercel Logs + LiveKit Cloud telemetry).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
logger = logging.getLogger("uvoiz.worker")


# -----------------------------------------------------------------
# Persona -> Bulbul speaker mapping
# -----------------------------------------------------------------
#
# Mirrors the mapping in lib/providers/sarvam-tts.ts on the Next.js
# side. Both sides MUST agree on which Bulbul speaker corresponds
# to each persona, because the Next.js side stores the persona name
# on the agents row and the worker resolves it here.
#
# Why duplicate the mapping rather than fetching from a shared API:
#   - the worker spins up per call, latency-sensitive
#   - persona mapping changes once a quarter, not per call
#   - keeping it inline means a deploy of either side is independent
#   - if they ever drift, the worker's choice wins for live calls
#     and the Next.js side is only used for voice-sample previews
#
# Keep this in sync with lib/providers/sarvam-tts.ts -> PERSONA_TO_BULBUL.


@dataclass
class PersonaConfig:
    speaker: str
    description: str


PERSONA_TO_BULBUL: dict[str, PersonaConfig] = {
    "Priya (Female)": PersonaConfig(speaker="priya", description="Warm & Empathetic"),
    "Arjun (Male)":   PersonaConfig(speaker="rahul", description="Confident & Clear"),
    "Kavya (Female)": PersonaConfig(speaker="kavya", description="Friendly & Bright"),
    "Rahul (Male)":   PersonaConfig(speaker="aditya", description="Calm & Professional"),
}

DEFAULT_PERSONA = "Priya (Female)"


def resolve_persona(name: str | None) -> PersonaConfig:
    """Map a persona display name to a Bulbul speaker.

    Falls back to the default persona on unknown input rather than
    crashing the call -- a stale persona name on an old agent row
    should not bring the line down.
    """
    if name and name in PERSONA_TO_BULBUL:
        return PERSONA_TO_BULBUL[name]
    if name:
        logger.warning("Unknown persona %r; falling back to %s", name, DEFAULT_PERSONA)
    return PERSONA_TO_BULBUL[DEFAULT_PERSONA]


# -----------------------------------------------------------------
# Language label -> BCP-47 mapping
# -----------------------------------------------------------------
#
# The Next.js side stores friendly labels like "Hindi + English" on
# the agents row so the BPO manager sees readable text in the UI.
# Sarvam needs BCP-47 codes (hi-IN, ta-IN, etc.). For mixed-language
# labels we pick the dominant Indic side -- Saaras V3 handles
# code-switching automatically once it knows the primary language.
#
# When adding a new language to this map, update the matching
# constant in app/t/agents/page.tsx (LANGUAGES) so the UI dropdown
# stays in sync with what the worker actually supports.

LANGUAGE_TO_BCP47: dict[str, str] = {
    "English":             "en-IN",
    "Hindi":               "hi-IN",
    "Hindi + English":     "hi-IN",
    "Tamil":               "ta-IN",
    "Tamil + English":     "ta-IN",
    "Telugu":              "te-IN",
    "Telugu + English":    "te-IN",
    "Kannada":             "kn-IN",
    "Kannada + English":   "kn-IN",
    "Marathi":             "mr-IN",
    "Marathi + English":   "mr-IN",
}

DEFAULT_LANGUAGE_CODE = "hi-IN"


def resolve_language(label: str | None) -> str:
    """Map a UI language label to a BCP-47 code. Defaults to hi-IN."""
    if label and label in LANGUAGE_TO_BCP47:
        return LANGUAGE_TO_BCP47[label]
    if label:
        logger.warning(
            "Unknown language %r; falling back to %s", label, DEFAULT_LANGUAGE_CODE
        )
    return DEFAULT_LANGUAGE_CODE


def build_language_rule(label: str | None) -> str:
    """Compose the language instruction for the LLM system prompt.

    Earlier versions had two failure modes:

      1. Without explicit instructions, the LLM would mirror the
         caller's language. If a Tamil agent's caller said one Hindi
         word, the agent switched to Hindi -- but the TTS speaker is
         configured for ta-IN, so it sounded wrong.

      2. With a too-strict "always reply in {label}" rule, the LLM
         became weirdly literal. Given label "Tamil + English" it
         apparently parsed the "+" as ambiguity and started refusing
         to speak Tamil at all ("I can only help in Hindi or English").

    The fix is to spell out exactly which languages are valid and
    why, in a way the model can actually follow:
      - Pick a clear PRIMARY language (the first half before "+")
      - Note that English code-mixing is welcome when the label
        ends in "+ English" -- this matches how Indians actually speak
      - Do NOT instruct the model to ignore caller language; let it
        match within the allowed pair naturally
      - Do allow explicit caller request to switch ("can you speak in
        English?") because forcing a stuck language feels rude
    """
    label = (label or "").strip() or "English"

    # Split "Tamil + English" into ("Tamil", "English"); plain
    # "Tamil" stays as ("Tamil", None).
    if " + " in label:
        primary, _, secondary = label.partition(" + ")
        primary = primary.strip()
        secondary = secondary.strip() or None
    else:
        primary = label
        secondary = None

    if secondary:
        # Bilingual case (most common in Indian BPO -- Hinglish,
        # Tanglish, etc.). Tell the model both languages are
        # allowed and natural code-mixing is welcome, but the
        # PRIMARY one is the default to use.
        return (
            f"You speak {primary} as your primary language. "
            f"You may freely mix in {secondary} words and phrases when "
            f"natural -- this is how people actually speak in India. "
            f"Default to {primary} for the bulk of your replies. "
            f"Only switch fully to {secondary} if the caller explicitly "
            f"asks (for example: 'can you speak in {secondary}?'). "
            f"Do not refuse to speak {primary} -- it is your main language."
        )
    else:
        # Monolingual case. Stay in the one language unless the
        # caller explicitly asks to switch.
        return (
            f"You speak {primary}. Reply in {primary}. "
            f"If the caller writes or speaks in another language, "
            f"continue to reply in {primary} unless they explicitly "
            f"ask you to switch."
        )


# -----------------------------------------------------------------
# Default instructions (used when no script is provided)
# -----------------------------------------------------------------

DEFAULT_INSTRUCTIONS = """\
You are a friendly voice assistant from uVOIZ, an Indian BPO platform. \
Your job is to have a short, natural conversation in Hindi or English \
depending on what the caller speaks. Keep replies under two sentences. \
If the caller says they are not interested, thank them politely and \
end the call. Never make false promises or quote prices.\
"""


# -----------------------------------------------------------------
# Per-call config (parsed from room metadata)
# -----------------------------------------------------------------


@dataclass
class CallConfig:
    """Resolved per-call configuration.

    Built from room metadata when present, with sensible defaults
    when the room joined was the playground / console / a room
    without metadata. Keeping all the resolution in one place means
    entrypoint() stays readable and the defaults are obvious.
    """

    agent_id: str | None
    agent_name: str
    persona: PersonaConfig
    language_code: str
    # Original UI language label, e.g. "Tamil + English". Kept
    # alongside the resolved BCP-47 code because the LLM prompt
    # needs the human-readable form ("Tamil") while Sarvam needs
    # the code ("ta-IN"). Resolving once at build time and stashing
    # both avoids re-parsing in the entrypoint.
    persona_language_label: str
    instructions: str
    is_browser_test: bool


def _default_config() -> CallConfig:
    return CallConfig(
        agent_id=None,
        agent_name="uVOIZ Assistant",
        persona=resolve_persona(None),
        language_code=DEFAULT_LANGUAGE_CODE,
        persona_language_label="Hindi + English",
        instructions=DEFAULT_INSTRUCTIONS,
        is_browser_test=False,
    )


def build_call_config(metadata_str: str | None) -> CallConfig:
    """Parse room metadata into a CallConfig, falling back gracefully.

    Three possible inputs:
      1. Empty string -- playground or console mode. Use defaults.
      2. Valid JSON with our expected fields -- normal browser-test or
         (future) telephony-bridged call from the Next.js side.
      3. Anything else -- someone else dispatched a job to our worker
         (unlikely but possible). Log and use defaults so the call
         doesn't fail outright.
    """
    if not metadata_str:
        logger.info("No room metadata; using defaults")
        return _default_config()

    try:
        data = json.loads(metadata_str)
    except json.JSONDecodeError:
        logger.warning("Room metadata is not valid JSON: %r; using defaults", metadata_str)
        return _default_config()

    persona = resolve_persona(data.get("persona"))
    language_code = resolve_language(data.get("language"))
    agent_name = data.get("agentName") or "uVOIZ Assistant"
    personality = data.get("personality") or "Friendly & Empathetic"
    script = (data.get("script") or "").strip()
    is_browser_test = data.get("mode") == "browser-test"

    # Build instructions per-call. The agent's name + personality
    # shape the tone; the script (if present) is the actual content
    # the BPO manager wrote. Without a script we fall back to the
    # generic test-conversation prompt so the agent still has
    # something to say.
    #
    # The language line is critical and goes first. The TTS speaker
    # is configured for one specific language (en-IN, hi-IN, ta-IN,
    # etc.) -- if the LLM replies in a different language, Bulbul
    # tries to render that text with the wrong phonetic model and
    # the result sounds off. See build_language_rule() for the
    # nuanced rule we landed on after a few iterations.
    language_rule = build_language_rule(data.get("language"))

    if script:
        instructions = (
            f"You are {agent_name}, a {personality.lower()} voice assistant from uVOIZ. "
            f"{language_rule} "
            f"Have a natural conversation with the caller. "
            f"Keep replies under two sentences. "
            f"Never make false promises or quote prices that aren't in your script. "
            f"\n\nYour script:\n{script}"
        )
    else:
        instructions = (
            f"You are {agent_name}, a {personality.lower()} voice assistant from uVOIZ. "
            f"{language_rule} "
            f"This is a test conversation -- the BPO manager is checking how you sound. "
            f"Have a brief friendly chat. "
            f"Keep replies under two sentences."
        )

    logger.info(
        "Resolved call config: agent=%s persona=%s lang=%s test=%s script=%s",
        agent_name, persona.speaker, language_code, is_browser_test, bool(script),
    )

    return CallConfig(
        agent_id=data.get("agentId"),
        agent_name=agent_name,
        persona=persona,
        language_code=language_code,
        persona_language_label=(data.get("language") or "English").strip() or "English",
        instructions=instructions,
        is_browser_test=is_browser_test,
    )


# -----------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------


async def entrypoint(ctx: JobContext) -> None:
    """LiveKit invokes this when a job (room) is dispatched to the worker.

    For testing in console / dev mode, this still runs -- LiveKit creates
    a synthetic room representing your local mic and speakers.
    """

    # Connect to the room. Until this resolves, ctx.room exists but has
    # no live media -- connecting starts the WebRTC handshake.
    await ctx.connect()
    logger.info("Worker connected to room %s", ctx.room.name)

    # Read per-call config from metadata. The Next.js side
    # (app/api/livekit/token/route.ts) attaches a JSON blob to the
    # agent dispatch when minting the access token. We read it from
    # `ctx.job.metadata` -- this is where dispatch metadata lands.
    #
    # IMPORTANT: do NOT use ctx.room.metadata here. The room itself
    # has no metadata for browser-test rooms (we don't pre-create
    # the room with metadata via the server API; the room is created
    # implicitly when the browser joins with the token, at which
    # point only the dispatch carries our config). An earlier version
    # of this worker read ctx.room.metadata and silently fell back
    # to defaults -- which meant every test call ran in Hindi
    # regardless of the agent's configured language. Symptom: Tamil
    # agents transcribing speech as garbled Devanagari, agents
    # refusing to speak Tamil saying "I can only help in Hindi or
    # English".
    #
    # We also check ctx.room.metadata as a fallback for future paths
    # (e.g. SIP-bridged calls where TeleCMI may set room metadata
    # at the call-create stage). Whichever has content wins.
    raw_metadata = (
        ctx.job.metadata
        if ctx.job and ctx.job.metadata
        else (ctx.room.metadata or "")
    )
    if raw_metadata:
        logger.info("Using metadata from %s",
                    "job" if ctx.job and ctx.job.metadata else "room")
    else:
        # Both empty. Useful diagnostic when the Tamil-becomes-Hindi
        # bug recurs: tells us if the dispatch-side wiring is
        # correct (i.e. metadata reached the dispatch) or not.
        logger.warning(
            "No metadata on job or room (job.metadata=%r, room.metadata=%r); "
            "using defaults. Tamil agents will speak Hindi, etc.",
            getattr(ctx.job, "metadata", None),
            ctx.room.metadata,
        )
    config = build_call_config(raw_metadata)

    # Build the pipeline.
    #
    # The four components of a cascading voice agent:
    #   STT  -- Sarvam Saaras V3, Indian-language native, code-mix aware
    #   LLM  -- OpenAI gpt-4.1-mini (env-overridable via OPENAI_MODEL)
    #   TTS  -- Sarvam Bulbul V3, mapped to the persona's speaker
    #   VAD  -- handled internally by the Sarvam STT plugin, see below
    #
    # IMPORTANT: per Sarvam's LiveKit integration guide, we DO NOT
    # pass a separate VAD instance. Sarvam's STT plugin emits its
    # own start/end-of-speech signals; layering a second VAD on top
    # produces double turn-taking and ugly cut-offs. Hence:
    #   - flush_signal=True on the STT (use Sarvam's signals)
    #   - turn_detection="stt" on the session (trust those signals)
    #   - min_endpointing_delay=0.07s (Sarvam's processing latency)
    #   - no `vad=...` argument anywhere

    stt = sarvam.STT(
        language=config.language_code,
        model="saaras:v3",
        mode="transcribe",      # spoken-language transcript; switch to
                                # "translate" when feeding an English-only LLM
                                # against Hindi callers.
        flush_signal=True,      # required for proper turn-taking
        # high_vad_sensitivity=False is the default -- leave alone unless
        # we get reports of agents cutting off mid-sentence.
    )

    llm = openai.LLM(
        model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        temperature=0.7,
    )

    tts = sarvam.TTS(
        target_language_code=config.language_code,
        model="bulbul:v3",
        speaker=config.persona.speaker,
        # pace=1.0 default. Slower (0.85) for elderly callers can be
        # configured per campaign later.
        # temperature=0.6 default expressiveness -- fine for BPO.
    )

    # AgentSession ties the components together and runs the pipeline.
    # We deliberately don't pass `vad=` (Sarvam handles it).
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection="stt",
        min_endpointing_delay=0.07,
        # allow_interruptions=True is the default -- caller can talk
        # over the agent and the agent will stop. Critical for BPO
        # where customers often interrupt with "not interested".
    )

    agent = Agent(instructions=config.instructions)

    await session.start(agent=agent, room=ctx.room)

    # Kick off the conversation. For browser tests we use a friendly
    # opener so the manager hears the agent right away. For real
    # calls (future) we'll play the campaign's first_message instead.
    #
    # We pass the agent_name and language explicitly into the opener
    # so the LLM doesn't have to guess. "Greet in their language" was
    # ambiguous — "their" who? Now it's anchored to the agent's
    # configured language.
    primary_language = (
        (config.persona_language_label or "English").split(" + ")[0].strip()
    )
    if config.is_browser_test:
        opener = (
            f"Greet the caller warmly in {primary_language} as "
            f"{config.agent_name}, introduce yourself in one short "
            f"sentence, and ask how you can help. Keep it under "
            f"two sentences."
        )
    else:
        opener = (
            f"Greet the caller in {primary_language} and ask how you "
            f"can help. Keep it under two sentences."
        )

    await session.generate_reply(instructions=opener)


# -----------------------------------------------------------------
# CLI runner
# -----------------------------------------------------------------

if __name__ == "__main__":
    # cli.run_app gives us three subcommands for free:
    #
    #   python agent.py console  -> terminal mode, uses your mic/speakers,
    #                               no LiveKit server required. Best for
    #                               "does the basic pipeline work".
    #
    #   python agent.py dev      -> connects to LiveKit Cloud, hot-reloads
    #                               on file changes. Best for iterating
    #                               with the Agents Playground in browser.
    #
    #   python agent.py start    -> production mode, no hot-reload.
    #                               What `lk agent deploy` runs in the cloud.
    # `agent_name` makes this worker addressable by name from the
    # Next.js side. The token endpoint sets a matching
    # roomConfig.agents[].agentName so LiveKit Cloud knows which
    # worker to dispatch the job to. Without an explicit name, jobs
    # would only flow via implicit auto-dispatch which is unreliable
    # for our pattern of "create a room, then expect a worker".
    #
    # Keep this string in sync with:
    #   - app/api/livekit/token/route.ts (LIVEKIT_AGENT_NAME constant)
    #   - worker/livekit.toml ([agent].name)
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="uvoiz-default-agent",
        )
    )
