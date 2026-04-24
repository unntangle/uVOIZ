import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrg, getCampaigns, createCampaign } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(orgId || userId);
    if (!org) return NextResponse.json({ campaigns: [] });

    const campaigns = await getCampaigns(org.id);
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('GET campaigns error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const org = await getOrg(orgId || userId);
    if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });

    const body = await req.json();
    const campaign = await createCampaign(org.id, {
      name: body.name,
      agentId: body.agentId,
      language: body.language,
      script: body.script,
      roomType: body.roomType,
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('POST campaign error:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
