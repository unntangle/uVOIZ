import { redirect } from 'next/navigation';

/**
 * /t → /t/dashboard
 * Catches users who land on the BPO root and sends them home.
 */
export default function TenantIndexPage() {
  redirect('/t/dashboard');
}
