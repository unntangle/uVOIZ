import { supabaseAdmin } from './supabase';

// ---- Organizations ----
export async function getOrg(orgId: string) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('*')
    .or(`id.eq.${orgId},clerk_org_id.eq.${orgId}`)
    .single();
  return data;
}

export async function createOrg(orgId: string, name: string) {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from('organizations')
    .insert({ id: orgId, name })
    .select()
    .single();
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

export async function updateCampaignStatus(campaignId: string, status: string) {
  await supabaseAdmin
    .from('campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', campaignId);
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
    console.error("Supabase createAgent Error:", error);
    require('fs').writeFileSync('scratch/supabase_error.log', JSON.stringify(error, null, 2));
  }
  
  return data;
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
  const active = todayCalls?.filter(c => c.status === 'in-progress').length || 0;
  const converted = todayCalls?.filter(c => c.converted).length || 0;
  const completed = todayCalls?.filter(c => c.status === 'completed') || [];
  const avgDuration = completed.length > 0
    ? Math.round(completed.reduce((a, c) => a + (c.duration || 0), 0) / completed.length)
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
