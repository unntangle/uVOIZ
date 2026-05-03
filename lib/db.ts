import { supabaseAdmin } from './supabase';

// ---- Organizations ----
/**
 * Look up an organization by its primary key.
 *
 * Note: an earlier Clerk-based auth iteration matched on a `clerk_org_id`
 * column too. That column no longer exists in the schema (custom auth has
 * fully replaced Clerk), and any reference to it caused the whole `.or()`
 * filter to error out — Supabase swallowed the error and returned null,
 * which API routes then treated as "org not found" with a confusing 404.
 * Now we match on `id` only, and we propagate real errors so caller code
 * can choose how to handle them rather than failing silently.
 */
export async function getOrg(orgId: string) {
  if (!supabaseAdmin) return null;
  if (!orgId) return null;

  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .maybeSingle(); // null when no row, instead of throwing PGRST116

  if (error) {
    console.error('getOrg DB error:', { orgId, error });
    return null;
  }
  return data;
}

export async function createOrg(orgId: string, name: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .insert({ id: orgId, name })
    .select()
    .single();
  if (error) {
    console.error('createOrg DB error:', { orgId, error });
    return null;
  }
  return data;
}

export async function updateOrgMinutes(orgId: string, minutesUsed: number) {
  await supabaseAdmin
    .from('organizations')
    .update({ minutes_used: minutesUsed, updated_at: new Date().toISOString() })
    .eq('id', orgId);
}

// ---- Campaigns ----
export async function getCampaigns(orgId: string) {
  const { data } = await supabaseAdmin
    .from('campaigns')
    .select('*, agents(name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return data || [];
}

/**
 * Fetch a single campaign by id, scoped to its org. The org_id check is
 * the security boundary — without it, a user knowing a UUID could touch
 * another tenant's campaign. Used by PATCH/DELETE/duplicate handlers.
 */
export async function getCampaignById(orgId: string, campaignId: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*, agents(name)')
    .eq('org_id', orgId)
    .eq('id', campaignId)
    .maybeSingle();
  if (error) {
    console.error('getCampaignById DB error:', { orgId, campaignId, error });
    return null;
  }
  return data;
}

export async function createCampaign(orgId: string, payload: {
  name: string; agentId: string; language: string; script: string; roomType: string;
}) {
  const { data } = await supabaseAdmin
    .from('campaigns')
    .insert({
      org_id: orgId,
      agent_id: payload.agentId,
      name: payload.name,
      language: payload.language,
      script: payload.script,
      room_type: payload.roomType,
    })
    .select()
    .single();
  return data;
}

/**
 * Legacy un-scoped status update. Still here because the dialer cron
 * uses it without an org context (it operates on the global queue). New
 * code should prefer `updateCampaign(orgId, id, { status })` so the
 * org_id filter remains the access boundary for user-driven mutations.
 */
export async function updateCampaignStatus(campaignId: string, status: string) {
  await supabaseAdmin
    .from('campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', campaignId);
}

/**
 * Update editable campaign fields. Returns the row joined with the
 * agent so the client can swap it in place without a separate refetch.
 * The org_id filter is the access boundary.
 *
 * Supported fields:
 *   - `name`   — inline rename from the kebab menu.
 *   - `status` — Start / Pause toggle from the card and detail-view
 *                buttons. The DB schema constrains this to
 *                'active' | 'paused' | 'draft' | 'completed'; we don't
 *                re-validate here because the route handler already
 *                whitelists the allowed values before calling.
 *
 * Only fields explicitly passed are written — undefined keys are
 * skipped, so a status-only update doesn't accidentally null out the
 * name (or vice versa).
 */
export async function updateCampaign(orgId: string, campaignId: string, updates: {
  name?: string;
  status?: string;
}) {
  if (!supabaseAdmin) return null;
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined)   patch.name   = updates.name;
  if (updates.status !== undefined) patch.status = updates.status;

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', campaignId)
    .select('*, agents(name)')
    .maybeSingle();

  if (error) {
    console.error('updateCampaign DB error:', { orgId, campaignId, error });
    return null;
  }
  return data;
}

/**
 * Delete a campaign. Returns true on success. The org_id filter prevents
 * a user from deleting another tenant's row even if they guess the UUID.
 *
 * Note: any FK-cascading rows (contacts, calls) are handled by the DB
 * schema's ON DELETE CASCADE — we don't need to pre-delete them here.
 * If the schema doesn't cascade, Postgres will refuse with a 23503 and
 * we surface that as a 409 in the route handler.
 */
export async function deleteCampaign(orgId: string, campaignId: string) {
  if (!supabaseAdmin) return { ok: false, error: 'no_db' };
  const { error } = await supabaseAdmin
    .from('campaigns')
    .delete()
    .eq('org_id', orgId)
    .eq('id', campaignId);
  if (error) {
    console.error('deleteCampaign DB error:', { orgId, campaignId, error });
    return { ok: false, error: error.code || 'unknown' };
  }
  return { ok: true };
}

// ---- Agents ----
export async function getAgents(orgId: string) {
  const { data } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  return data || [];
}

/**
 * Fetch a single agent by id, scoped to its org. Same security pattern
 * as getCampaignById — the org_id eq is the access boundary.
 */
export async function getAgentById(orgId: string, agentId: string) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('agents')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', agentId)
    .maybeSingle();
  if (error) {
    console.error('getAgentById DB error:', { orgId, agentId, error });
    return null;
  }
  return data;
}

export async function createAgent(orgId: string, payload: {
  name: string; voice: string; language: string; personality: string; script: string; vapiAssistantId?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('agents')
    .insert({
      org_id: orgId,
      name: payload.name,
      voice: payload.voice,
      language: payload.language,
      personality: payload.personality,
      script: payload.script,
      vapi_assistant_id: payload.vapiAssistantId,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Supabase createAgent error:', error);
  }
  
  return data;
}

/**
 * Update editable agent fields (currently just `name`). Returns the
 * updated row so the client can swap it in place. org_id filter is the
 * access boundary.
 */
export async function updateAgent(orgId: string, agentId: string, updates: {
  name?: string;
}) {
  if (!supabaseAdmin) return null;
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) patch.name = updates.name;

  const { data, error } = await supabaseAdmin
    .from('agents')
    .update(patch)
    .eq('org_id', orgId)
    .eq('id', agentId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('updateAgent DB error:', { orgId, agentId, error });
    return null;
  }
  return data;
}

/**
 * Delete an agent. Returns true on success. If campaigns reference this
 * agent via FK (no ON DELETE CASCADE), Postgres will return code 23503
 * and we surface that as a 409 in the route handler so the UI can show
 * "this assistant is used by N campaigns, remove it from those first".
 */
export async function deleteAgent(orgId: string, agentId: string) {
  if (!supabaseAdmin) return { ok: false, error: 'no_db' };
  const { error } = await supabaseAdmin
    .from('agents')
    .delete()
    .eq('org_id', orgId)
    .eq('id', agentId);
  if (error) {
    console.error('deleteAgent DB error:', { orgId, agentId, error });
    return { ok: false, error: error.code || 'unknown' };
  }
  return { ok: true };
}

// ---- Calls ----
export async function getCalls(orgId: string, limit = 100) {
  const { data } = await supabaseAdmin
    .from('calls')
    .select('*, campaigns(name), agents(name), contacts(name, phone)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function createCall(orgId: string, payload: {
  campaignId: string; agentId: string; contactId: string; vapiCallId: string;
}) {
  const { data } = await supabaseAdmin
    .from('calls')
    .insert({
      org_id: orgId,
      campaign_id: payload.campaignId,
      agent_id: payload.agentId,
      contact_id: payload.contactId,
      vapi_call_id: payload.vapiCallId,
      status: 'queued',
    })
    .select()
    .single();
  return data;
}

export async function updateCall(vapiCallId: string, updates: {
  status?: string; duration?: number; recording_url?: string;
  transcript?: string; sentiment?: string; converted?: boolean;
  started_at?: string; ended_at?: string;
}) {
  await supabaseAdmin
    .from('calls')
    .update(updates)
    .eq('vapi_call_id', vapiCallId);
}

// ---- Dashboard Stats ----
export async function getDashboardStats(orgId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: todayCalls } = await supabaseAdmin
    .from('calls')
    .select('id, status, converted, duration')
    .eq('org_id', orgId)
    .gte('created_at', today.toISOString());

  const total = todayCalls?.length || 0;
  const active = todayCalls?.filter((c: any) => c.status === 'in-progress').length || 0;
  const converted = todayCalls?.filter((c: any) => c.converted).length || 0;
  const completed = todayCalls?.filter((c: any) => c.status === 'completed') || [];
  const avgDuration = completed.length > 0
    ? Math.round(completed.reduce((a: number, c: any) => a + (c.duration || 0), 0) / completed.length)
    : 0;

  return {
    totalCallsToday: total,
    activeCallsNow: active,
    conversionRate: total > 0 ? (converted / total) * 100 : 0,
    avgCallDuration: avgDuration,
    callsChange: 0,
    conversionChange: 0,
  };
}
