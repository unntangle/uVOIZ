import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { getSessionFromRequest } from '@/lib/auth';
import { getOrg, getAgentById } from '@/lib/db';

/**
 * POST /api/livekit/token
 * ============================================
 *
 * Mint a short-lived LiveKit access token so the user's browser can
 * connect to a LiveKit room and have a voice conversation with one
 * of their AI agents.
 *
 * Why this lives in the Next.js app and not the worker:
 *   The worker runs on LiveKit Cloud and only knows how to JOIN rooms
 *   it's dispatched to. The browser needs a token to CREATE/JOIN a
 *   room in the first place. Token minting requires the LiveKit
 *   API_SECRET, which only the Next.js server has.
 *
 * Flow:
 *   1. User on /app/agents clicks "Test Call" on an agent card.
 *   2. Browser POSTs here with { agentId }.
 *   3. We look up the agent (org-scoped — caller can only test their
 *      own agents), build a unique room name, mint a token granting
 *      this user permission to join that room with their mic, and
 *      return { token, url, roomName, metadata }.
 *   4. Browser connects to LiveKit Cloud using the token.
 *   5. Worker (running on LiveKit Cloud) auto-dispatches into the
 *      new room because of its WorkerOptions.
 *   6. Worker reads the room metadata to learn which agent's
 *      persona/language/script to use for this call.
 *
 * What we do NOT do here:
 *   - Debit minutes_used. Browser test calls are free — they're for
 *     the BPO manager to validate their own script. Real customer-
 *     facing calls (TeleCMI → PSTN) will debit minutes via the
 *     dialer cron, not this endpoint.
 *   - Persist the call to the `calls` table. The worker writes that
 *     itself when the session ends, via a webhook back to Next.js.
 *
 * Security:
 *   - Session-checked: anonymous callers get 401.
 *   - Org-scoped agent lookup: caller can only mint a token for
 *     their own org's agents (getAgentById is org-scoped).
 *   - Tokens expire in 15 minutes. Rooms auto-clean when empty.
 *   - Rate limiting NOT implemented yet — TODO before public launch.
 *     A motivated user could spam this endpoint and rack up Sarvam/
 *     OpenAI/LiveKit minutes. Acceptable risk during private beta.
 */

// Token TTL. 15 minutes is enough for a long test call but short
// enough that a leaked token is mostly worthless. We don't refresh
// tokens mid-call — if a call runs over 15 min the user reconnects.
const TOKEN_TTL_SECONDS = 15 * 60;

// Name of the LiveKit agent worker to dispatch into the room. Must
// match the `agent_name` passed to WorkerOptions in worker/agent.py
// AND the `[agent].name` in worker/livekit.toml. If these drift,
// LiveKit will register the worker but never route jobs to it,
// producing the silent-room failure mode (browser connected, no
// agent ever speaks).
const LIVEKIT_AGENT_NAME = 'uvoiz-default-agent';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate config up front. Failing here gives a clearer error
    // than letting AccessToken throw mysteriously below.
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
      console.error('LiveKit env vars missing — cannot mint token');
      return NextResponse.json(
        { error: 'Voice testing is not configured' },
        { status: 503 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const agentId: unknown = body.agentId;
    if (typeof agentId !== 'string' || !agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 },
      );
    }

    const org = await getOrg(session.orgId);
    if (!org) {
      return NextResponse.json(
        { error: 'Organisation not found' },
        { status: 404 },
      );
    }

    // Org-scoped lookup. If `agentId` belongs to another org this
    // returns null — same response as a totally unknown id, so we
    // don't leak whether the id exists.
    const agent = await getAgentById(org.id, agentId);
    if (!agent) {
      return NextResponse.json(
        { error: 'Assistant not found' },
        { status: 404 },
      );
    }

    // Unique room name. Includes agentId so the worker can read it
    // back from ctx.room.name as a quick debugging aid even if
    // metadata parsing fails. Includes timestamp so two simultaneous
    // tests of the same agent by the same user don't collide.
    //
    // Format: talk-{agentId}-{userId}-{timestamp}
    // 'talk-' prefix lets future filtering distinguish browser test
    // rooms from telephony-bridged rooms (which will start 'tele-').
    const roomName = `talk-${agentId}-${session.id}-${Date.now()}`;

    // Metadata travels with the room. The worker reads this to
    // configure the per-call session (persona, language, script).
    // JSON-encoded because LiveKit's metadata field is a single
    // string; we prefer structured JSON to ad-hoc string parsing.
    //
    // Field naming mirrors the agents table column names so the
    // worker can switch on these without a translation layer.
    const roomMetadata = JSON.stringify({
      agentId: agent.id,
      agentName: agent.name ?? 'Assistant',
      // Persona display name (e.g. "Priya (Female)"). The worker's
      // PERSONA_TO_BULBUL map translates this to a Bulbul speaker.
      persona: agent.voice ?? 'Priya (Female)',
      // Internal language label as stored on the agent row, e.g.
      // "Hindi + English". The worker maps this to a BCP-47 code.
      language: agent.language ?? 'Hindi + English',
      personality: agent.personality ?? 'Friendly & Empathetic',
      // Script may be empty for assistants — that's fine, the worker
      // falls back to a generic "ask how can I help" prompt.
      script: agent.script ?? '',
      // Mode tells the worker this is a browser test, not a real
      // outbound call. Lets the worker disable any
      // production-only behaviour (e.g. compliance gating) for tests.
      mode: 'browser-test',
      // Trace fields — useful when debugging a failed test call.
      orgId: org.id,
      userId: session.id,
    });

    // Build the access token. The participant identity must be
    // unique per LiveKit room — using userId+timestamp guarantees
    // that even if the same user reconnects mid-call we don't get
    // an "identity already in room" collision.
    const at = new AccessToken(apiKey, apiSecret, {
      identity: `user-${session.id}-${Date.now()}`,
      name: session.email ?? 'BPO User',
      ttl: TOKEN_TTL_SECONDS,
    });

    // Permissions:
    //   roomJoin       → can connect to the room
    //   room           → which room (creates it if it doesn't exist)
    //   canPublish     → can send mic audio
    //   canSubscribe   → can hear the agent's audio
    //   roomCreate     → not granted — user can't create arbitrary
    //                    rooms; only this exact one named above
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      // canPublishData false — no need to send arbitrary data
      // packets from the browser. Tightens the blast radius.
      canPublishData: false,
    });

    // Attach the same metadata to the participant grant so the
    // worker can read it via room.localParticipant.metadata too.
    // Belt-and-braces — mostly we use room metadata, but if the
    // worker ever needs per-participant info this is the channel.
    at.metadata = roomMetadata;

    // Tell LiveKit Cloud to dispatch a job to our named agent
    // worker as soon as this room becomes active. Without this,
    // the browser would connect to a room with no agent in it and
    // sit there silently — the failure mode we hit on first try.
    //
    // The room metadata is repeated here on the dispatch so the
    // worker can read it from JobContext as well as from the
    // Room object. Both paths land on ctx.room.metadata in the
    // worker, but having it on the dispatch makes the worker's
    // first job-accept decision metadata-aware too (future use:
    // refusing dispatch if the agent isn't compliance-cleared).
    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: LIVEKIT_AGENT_NAME,
          metadata: roomMetadata,
        }),
      ],
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url,
      roomName,
      // Echo metadata so the browser can show it in the UI ("Talking
      // to Priya in Hindi...") without re-fetching the agent.
      metadata: JSON.parse(roomMetadata),
    });
  } catch (error) {
    console.error('POST /api/livekit/token error:', error);
    return NextResponse.json(
      { error: 'Failed to start voice session' },
      { status: 500 },
    );
  }
}
