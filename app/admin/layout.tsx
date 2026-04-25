import AdminSidebar from './AdminSidebar';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Protect admin routes
  if (!session) {
    redirect('/login');
  }

  // Demo fallback for admin@uvoiz.com
  if (session.email !== 'admin@uvoiz.com' && session.role !== 'superadmin') {
    redirect('/dashboard'); // redirect normal users to their dashboard
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <AdminSidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
