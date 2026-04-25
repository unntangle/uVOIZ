export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'busy';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type AgentStatus = 'active' | 'inactive' | 'training';

export interface Contact {
  id: string;
  orgId: string;
  campaignId: string;
  name: string;
  phone: string;
  createdAt: Date;
}

export interface Call {
  id: string;
  campaignId: string;
  campaignName: string;
  contactName: string;
  contactPhone: string;
  status: CallStatus;
  duration: number;
  startedAt: Date | null;
  endedAt: Date | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  converted: boolean;
  recordingUrl: string | null;
  transcript: string | null;
  agentId: string;
  agentName: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  agentId: string;
  agentName: string;
  totalContacts: number;
  called: number;
  converted: number;
  failed: number;
  createdAt: Date;
  scheduledAt: Date | null;
  script: string;
  language: 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'mr';
  roomType: string;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  language: string;
  voice: string;
  personality: string;
  script: string;
  callsHandled: number;
  successRate: number;
  avgDuration: number;
  createdAt: Date;
}

export interface DashboardStats {
  totalCallsToday: number;
  activeCallsNow: number;
  conversionRate: number;
  avgCallDuration: number;
  callsChange: number;
  conversionChange: number;
}
