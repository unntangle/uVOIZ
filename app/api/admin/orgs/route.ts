import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    // Allow super_admin role (or legacy admin@uvoiz.com demo account)
    if (!session || (session.email !== 'admin@uvoiz.com' && session.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      // Return mock data if no db
      return NextResponse.json({
        orgs: [
          { id: '1', name: 'Acme BPO', plan: 'enterprise', minutes_used: 45000, minutes_limit: 100000, created_at: new Date().toISOString() },
          { id: '2', name: 'Global Connect', plan: 'pro', minutes_used: 8500, minutes_limit: 10000, created_at: new Date().toISOString() },
          { id: '3', name: 'My BPO Company', plan: 'starter', minutes_used: 120, minutes_limit: 1000, created_at: new Date().toISOString() },
        ]
      });
    }

    // Fetch all organizations
    const { data: orgs, error } = await supabaseAdmin
      .from('organizations')
      .select('id, name, plan, minutes_used, minutes_limit, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orgs:', error);
      return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }

    // Get user counts per org (optional enhancement)
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('org_id');

    const orgsWithUserCounts = orgs?.map(org => ({
      ...org,
      user_count: users?.filter(u => u.org_id === org.id).length || 0,
    })) || [];

    return NextResponse.json({ orgs: orgsWithUserCounts });

  } catch (error) {
    console.error('Admin orgs API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
