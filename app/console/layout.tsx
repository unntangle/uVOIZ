import ConsoleSidebar from './ConsoleSidebar';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) redirect('/login');

  // Only super_admin can access /console/*
  // Demo fallback: keep admin@uvoiz.com working until super_admin role is assigned in DB
  const isSuperAdmin = session.role === 'super_admin' || session.email === 'admin@uvoiz.com';
  if (!isSuperAdmin) redirect('/t/dashboard');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <ConsoleSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
