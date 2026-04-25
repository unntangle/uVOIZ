import { NextResponse } from 'next/server';

export async function GET() {
  const envKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes('supa'));
  return NextResponse.json({
    envKeys,
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY
  });
}
