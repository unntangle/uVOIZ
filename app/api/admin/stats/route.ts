import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    // For demo/development, allow admin@uvoiz.com or explicit superadmin role
    if (!session || (session.email !== 'admin@uvoiz.com' && session.role !== 'superadmin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      // Return mock data if no db
      return NextResponse.json({
        totalBPOs: 12,
        totalActiveCalls: 145,
        totalAgents: 48,
        totalMinutesUsed: 125000,
        revenueEstimate: 14500,
      });
    }

    // Fetch high level stats
    const { count: totalBPOs } = await supabaseAdmin.from('organizations').select('*', { count: 'exact', head: true });
    
    // Sum of all minutes used
    const { data: orgs } = await supabaseAdmin.from('organizations').select('minutes_used, plan');
    const totalMinutesUsed = orgs?.reduce((acc, org) => acc + (org.minutes_used || 0), 0) || 0;
    
    // Estimate MRR (very rough estimate based on plan)
    let revenueEstimate = 0;
    orgs?.forEach(org => {
      if (org.plan === 'enterprise') revenueEstimate += 499;
      else if (org.plan === 'pro') revenueEstimate += 199;
      else if (org.plan === 'starter') revenueEstimate += 49;
    });

    const { count: totalAgents } = await supabaseAdmin.from('agents').select('*', { count: 'exact', head: true });
    
    // Active calls globally
    const { count: totalActiveCalls } = await supabaseAdmin.from('calls').select('*', { count: 'exact', head: true }).eq('status', 'in-progress');

    return NextResponse.json({
      totalBPOs: totalBPOs || 0,
      totalActiveCalls: totalActiveCalls || 0,
      totalAgents: totalAgents || 0,
      totalMinutesUsed,
      revenueEstimate,
    });

  } catch (error) {
    console.error('Admin stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
