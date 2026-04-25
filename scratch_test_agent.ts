import { createAgent } from './lib/db';
import { getOrg } from './lib/db';

async function test() {
  console.log('Testing createAgent...');
  try {
    // Assuming we have org "org_2dfv..." or we can pass a hardcoded one if we know it.
    // Wait, let's just do a direct supabase query to get an org id.
    const { supabaseAdmin } = require('./lib/supabase');
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
