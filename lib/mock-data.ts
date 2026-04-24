import { Call, Campaign, Agent, DashboardStats } from '@/types';

export const mockStats: DashboardStats = {
  totalCallsToday: 1284,
  activeCallsNow: 47,
  conversionRate: 23.4,
  avgCallDuration: 142,
  callsChange: 12.5,
  conversionChange: 3.2,
};

export const mockCalls: Call[] = [
  { id: 'c1', campaignId: 'camp1', campaignName: 'Insurance Renewal Q1', contactName: 'Ravi Kumar', contactPhone: '+91 98765 43210', status: 'in-progress', duration: 87, startedAt: new Date(), endedAt: null, sentiment: 'positive', converted: false, recordingUrl: null, transcript: null, agentId: 'a1', agentName: 'Priya AI' },
  { id: 'c2', campaignId: 'camp1', campaignName: 'Insurance Renewal Q1', contactName: 'Meera Sharma', contactPhone: '+91 87654 32109', status: 'completed', duration: 234, startedAt: new Date(Date.now()-300000), endedAt: new Date(), sentiment: 'positive', converted: true, recordingUrl: '#', transcript: 'Customer showed interest in premium plan...', agentId: 'a1', agentName: 'Priya AI' },
  { id: 'c3', campaignId: 'camp2', campaignName: 'Credit Card Upsell', contactName: 'Arun Patel', contactPhone: '+91 76543 21098', status: 'completed', duration: 56, startedAt: new Date(Date.now()-600000), endedAt: new Date(), sentiment: 'negative', converted: false, recordingUrl: '#', transcript: 'Customer requested callback...', agentId: 'a2', agentName: 'Arjun AI' },
  { id: 'c4', campaignId: 'camp2', campaignName: 'Credit Card Upsell', contactName: 'Sunita Reddy', contactPhone: '+91 65432 10987', status: 'no-answer', duration: 0, startedAt: null, endedAt: null, sentiment: null, converted: false, recordingUrl: null, transcript: null, agentId: 'a2', agentName: 'Arjun AI' },
  { id: 'c5', campaignId: 'camp3', campaignName: 'EMI Reminder Tamil', contactName: 'Karthik Murugan', contactPhone: '+91 99887 76655', status: 'completed', duration: 178, startedAt: new Date(Date.now()-900000), endedAt: new Date(), sentiment: 'neutral', converted: true, recordingUrl: '#', transcript: 'EMI confirmed for next month...', agentId: 'a3', agentName: 'Kavya AI' },
  { id: 'c6', campaignId: 'camp1', campaignName: 'Insurance Renewal Q1', contactName: 'Deepak Singh', contactPhone: '+91 88776 65544', status: 'ringing', duration: 0, startedAt: new Date(), endedAt: null, sentiment: null, converted: false, recordingUrl: null, transcript: null, agentId: 'a1', agentName: 'Priya AI' },
  { id: 'c7', campaignId: 'camp2', campaignName: 'Credit Card Upsell', contactName: 'Anjali Menon', contactPhone: '+91 77665 54433', status: 'failed', duration: 0, startedAt: null, endedAt: null, sentiment: null, converted: false, recordingUrl: null, transcript: null, agentId: 'a2', agentName: 'Arjun AI' },
  { id: 'c8', campaignId: 'camp3', campaignName: 'EMI Reminder Tamil', contactName: 'Vijay Anand', contactPhone: '+91 66554 43322', status: 'completed', duration: 312, startedAt: new Date(Date.now()-1200000), endedAt: new Date(), sentiment: 'positive', converted: true, recordingUrl: '#', transcript: null, agentId: 'a3', agentName: 'Kavya AI' },
];

export const mockCampaigns: Campaign[] = [
  { id: 'camp1', name: 'Insurance Renewal Q1', status: 'active', agentId: 'a1', agentName: 'Priya AI', totalContacts: 5000, called: 3241, converted: 847, failed: 312, createdAt: new Date('2024-01-15'), scheduledAt: null, script: 'Hello, I am calling from ABC Insurance...', language: 'hi', roomType: 'Insurance' },
  { id: 'camp2', name: 'Credit Card Upsell', status: 'active', agentId: 'a2', agentName: 'Arjun AI', totalContacts: 2500, called: 1876, converted: 312, failed: 189, createdAt: new Date('2024-01-18'), scheduledAt: null, script: 'Congratulations! You are eligible for...', language: 'en', roomType: 'Banking' },
  { id: 'camp3', name: 'EMI Reminder Tamil', status: 'active', agentId: 'a3', agentName: 'Kavya AI', totalContacts: 1800, called: 1200, converted: 980, failed: 87, createdAt: new Date('2024-01-20'), scheduledAt: null, script: 'Vanakkam! Ungal EMI paymant...', language: 'ta', roomType: 'Banking' },
  { id: 'camp4', name: 'Survey - Product Feedback', status: 'paused', agentId: 'a1', agentName: 'Priya AI', totalContacts: 3000, called: 900, converted: 654, failed: 45, createdAt: new Date('2024-01-10'), scheduledAt: null, script: 'Hi, we would love your feedback...', language: 'en', roomType: 'Survey' },
  { id: 'camp5', name: 'Loan Offer Kannada', status: 'draft', agentId: 'a4', agentName: 'Rahul AI', totalContacts: 4000, called: 0, converted: 0, failed: 0, createdAt: new Date('2024-01-22'), scheduledAt: new Date('2024-02-01'), script: 'Namaskara! Nimma hesaralli...', language: 'kn', roomType: 'Loans' },
];

export const mockAgents: Agent[] = [
  { id: 'a1', name: 'Priya AI', status: 'active', language: 'Hindi + English', voice: 'Priya (Female)', personality: 'Friendly, empathetic, professional', script: 'Default insurance script', callsHandled: 12450, successRate: 26.1, avgDuration: 168, createdAt: new Date('2023-12-01') },
  { id: 'a2', name: 'Arjun AI', status: 'active', language: 'English', voice: 'Arjun (Male)', personality: 'Confident, persuasive, concise', script: 'Sales upsell script', callsHandled: 8920, successRate: 16.6, avgDuration: 134, createdAt: new Date('2023-12-15') },
  { id: 'a3', name: 'Kavya AI', status: 'active', language: 'Tamil + English', voice: 'Kavya (Female)', personality: 'Warm, patient, detailed', script: 'Tamil EMI reminder', callsHandled: 5640, successRate: 81.7, avgDuration: 195, createdAt: new Date('2024-01-01') },
  { id: 'a4', name: 'Rahul AI', status: 'training', language: 'Kannada + English', voice: 'Rahul (Male)', personality: 'Professional, informative', script: 'Loan offer script', callsHandled: 0, successRate: 0, avgDuration: 0, createdAt: new Date('2024-01-20') },
];

export const mockChartData = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i}:00`,
  calls: Math.floor(Math.random() * 120) + 20,
  conversions: Math.floor(Math.random() * 30) + 5,
  failed: Math.floor(Math.random() * 15) + 2,
}));

export const mockWeeklyData = [
  { day: 'Mon', calls: 1240, converted: 287, revenue: 145000 },
  { day: 'Tue', calls: 1380, converted: 312, revenue: 168000 },
  { day: 'Wed', calls: 1190, converted: 241, revenue: 132000 },
  { day: 'Thu', calls: 1560, converted: 398, revenue: 210000 },
  { day: 'Fri', calls: 1420, converted: 356, revenue: 189000 },
  { day: 'Sat', calls: 890, converted: 198, revenue: 98000 },
  { day: 'Sun', calls: 640, converted: 134, revenue: 72000 },
];
