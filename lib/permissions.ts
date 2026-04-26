/**
 * Centralized role-based access control for uVOIZ.
 * Single source of truth — middleware AND sidebar both read from here.
 *
 * URL CONVENTION:
 *   User-facing URLs use clean subdomain paths:
 *     uvoiz.unntangle.com/app/dashboard   (BPO app)
 *     console.unntangle.com/dashboard      (super admin console)
 *
 *   Internal (Next.js file structure) paths:
 *     /t/dashboard, /t/agents, etc.        (BPO routes)
 *     /console, /console/clients, etc.     (super admin routes)
 *
 *   middleware.ts rewrites between the two. Permission checks below run on
 *   the INTERNAL paths so the file structure remains the source of truth.
 *
 * ROLE HIERARCHY:
 *   super_admin  → Unntangle staff. Access to /console/* only.
 *   admin        → BPO owner. Access to /t/* including billing, team, settings.
 *   manager      → BPO ops lead. Access to /t/* except billing, team, settings.
 */

export type Role = 'super_admin' | 'admin' | 'manager';

export type AppRoute = {
  path: string;
  allowedRoles: Role[];
};

/**
 * Route → allowed roles map.
 * Order matters for prefix matching: more specific paths first.
 */
export const ROUTE_PERMISSIONS: AppRoute[] = [
  // ---------- Super admin (Unntangle) ----------
  { path: '/console',                allowedRoles: ['super_admin'] },

  // ---------- BPO admin-only ----------
  { path: '/t/billing',              allowedRoles: ['admin'] },
  { path: '/t/team',                 allowedRoles: ['admin'] },
  { path: '/t/settings',             allowedRoles: ['admin'] },

  // ---------- BPO shared (admin + manager) ----------
  { path: '/t/dashboard',            allowedRoles: ['admin', 'manager'] },
  { path: '/t/agents',               allowedRoles: ['admin', 'manager'] },
  { path: '/t/campaigns',            allowedRoles: ['admin', 'manager'] },
  { path: '/t/calls',                allowedRoles: ['admin', 'manager'] },
  { path: '/t/analytics',            allowedRoles: ['admin', 'manager'] },
  { path: '/t/support',              allowedRoles: ['admin', 'manager'] },
  { path: '/t',                      allowedRoles: ['admin', 'manager'] }, // root /t redirect

  // ---------- Onboarding (any signed-in user) ----------
  { path: '/onboarding',             allowedRoles: ['super_admin', 'admin', 'manager'] },
];

/**
 * Public routes — no auth required.
 */
export const PUBLIC_ROUTES = [
  '/login',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/api/auth',
  '/api/webhooks',
];

/**
 * Check if a given role can access a given path.
 * Uses prefix matching against ROUTE_PERMISSIONS.
 */
export function canAccess(path: string, role: Role | null | undefined): boolean {
  if (!role) return false;

  // Find the most specific matching route
  const matched = ROUTE_PERMISSIONS.find(r => path === r.path || path.startsWith(r.path + '/'));
  if (!matched) return false;

  return matched.allowedRoles.includes(role);
}

/**
 * Where to send a user after they log in based on their role.
 * Returns the INTERNAL path — the login page (which knows about subdomains)
 * is responsible for converting to the right absolute URL via lib/urls.ts.
 */
export function getDefaultLandingPath(role: Role): string {
  if (role === 'super_admin') return '/console';
  return '/t/dashboard';
}

/**
 * Sidebar nav items — filtered by role at render time.
 *
 * `href` here is the USER-FACING url (what shows in the browser bar and
 * what <Link> needs). Middleware rewrites these to internal paths before
 * Next.js renders the corresponding `app/t/*` or `app/console/*` files.
 */
export type NavItem = {
  label: string;
  href: string;
  allowedRoles: Role[];
  iconName: string; // resolved to lucide icon in the component
  badge?: string;
};

export const BPO_NAV: NavItem[] = [
  { label: 'Dashboard',  href: '/app/dashboard',  allowedRoles: ['admin', 'manager'], iconName: 'LayoutDashboard' },
  { label: 'AI Agents',  href: '/app/agents',     allowedRoles: ['admin', 'manager'], iconName: 'Bot' },
  { label: 'Campaigns',  href: '/app/campaigns',  allowedRoles: ['admin', 'manager'], iconName: 'Megaphone' },
  { label: 'Live Calls', href: '/app/calls',      allowedRoles: ['admin', 'manager'], iconName: 'Phone' },
  { label: 'Analytics',  href: '/app/analytics',  allowedRoles: ['admin', 'manager'], iconName: 'BarChart3' },
  { label: 'Billing',    href: '/app/billing',    allowedRoles: ['admin'],            iconName: 'CreditCard' },
  { label: 'Team',       href: '/app/team',       allowedRoles: ['admin'],            iconName: 'Users' },
];

export const BPO_NAV_GENERAL: NavItem[] = [
  { label: 'Settings',        href: '/app/settings', allowedRoles: ['admin'],            iconName: 'Settings' },
  { label: 'Help & Support',  href: '/app/support',  allowedRoles: ['admin', 'manager'], iconName: 'HelpCircle' },
];

export const CONSOLE_NAV: NavItem[] = [
  { label: 'Global Overview',  href: '/dashboard',   allowedRoles: ['super_admin'], iconName: 'LayoutDashboard' },
  { label: 'BPO Clients',      href: '/clients',     allowedRoles: ['super_admin'], iconName: 'Users' },
  { label: 'Platform Billing', href: '/billing',     allowedRoles: ['super_admin'], iconName: 'CreditCard' },
  { label: 'Credit Ledger',    href: '/credits',     allowedRoles: ['super_admin'], iconName: 'Coins' },
  { label: 'System Health',    href: '/health',      allowedRoles: ['super_admin'], iconName: 'Server' },
  { label: 'Security & Audit', href: '/audit',       allowedRoles: ['super_admin'], iconName: 'Shield' },
  { label: 'Platform Settings',href: '/settings',    allowedRoles: ['super_admin'], iconName: 'Settings' },
];

export function filterNavByRole(items: NavItem[], role: Role | null | undefined): NavItem[] {
  if (!role) return [];
  return items.filter(item => item.allowedRoles.includes(role));
}
