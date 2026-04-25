import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) {
    process.env[key.trim()] = value.join('=').trim().replace(/^"|"$/g, '');
  }
});

async function test() {
  console.log('Testing createAgent...');
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

    
    if (!supabaseAdmin) {
       console.log("No supabase admin"); return;
    }

    const { data: orgs } = await supabaseAdmin.from('organizations').select('id').limit(1);
    if (!orgs || orgs.length === 0) {
      console.log('No orgs found');
      return;
    }
    const orgId = orgs[0].id;
    console.log('Using Org:', orgId);

    const { data, error } = await supabaseAdmin
      .from('agents')
      .insert({
        org_id: orgId,
        name: 'Test Agent',
        voice: 'Priya',
        language: 'English',
        personality: 'Friendly',
        script: 'Hello!',
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase Error:', error);
    } else {
      console.log('Success:', data);
    }
  } catch (err) {
    console.error('Catch Error:', err);
  }
}

test();
