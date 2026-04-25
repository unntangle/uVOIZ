import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

// Helper to get campaign contacts
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaignId = params.id;

    if (!supabaseAdmin) {
      // Mock data for demo if db is not connected
      return NextResponse.json({ contacts: [] });
    }

    const { data: contacts, error } = await supabaseAdmin
      .from('contacts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('org_id', session.orgId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching contacts:', error);
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    return NextResponse.json({ contacts: contacts || [] });
  } catch (error) {
    console.error('Contacts GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Bulk insert contacts
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const campaignId = params.id;
    const body = await req.json();
    const { contacts } = body;

    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      // Mock success if db is not connected
      return NextResponse.json({ success: true, count: contacts.length });
    }

    // Format for bulk insert
    const insertData = contacts.map(c => ({
      org_id: session.orgId,
      campaign_id: campaignId,
      name: c.name,
      phone: c.phone,
    }));

    const { error } = await supabaseAdmin
      .from('contacts')
      .insert(insertData);

    if (error) {
      console.error('Error inserting contacts:', error);
      return NextResponse.json({ error: 'Failed to insert contacts' }, { status: 500 });
    }

    // Update campaign total_contacts
    const { data: currentCampaign } = await supabaseAdmin
      .from('campaigns')
      .select('total_contacts')
      .eq('id', campaignId)
      .single();

    const currentTotal = currentCampaign?.total_contacts || 0;

    await supabaseAdmin
      .from('campaigns')
      .update({ total_contacts: currentTotal + contacts.length })
      .eq('id', campaignId);

    return NextResponse.json({ success: true, count: contacts.length });
  } catch (error) {
    console.error('Contacts POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
