/**
 * Centralized role-based access control for uVOIZ.
 * Single source of truth — middleware AND sidebar both read from here.
 *
 * URL CONVENTION (single-subdomain layout):
 *   User-facing URLs all live under uvoiz.unntangle.com:
 *     uvoiz.unntangle.com/app/dashboard       (BPO app)
 *     uvoiz.unntangle.com/console/dashboard   (super admin console)
 *
 *   Internal (Next.js file structure) paths:
 *     /t/dashboard, /t/agents, etc.        (BPO routes — rewritten by middleware)
 *     /console, /console/clients, etc.     (super admin routes — no rewrite, files at app/console/*)
 *
 *   middleware.ts rewrites /app/* → /t/* before auth checks. /console/*
 *   pass through unchanged. Permission checks below run on the INTERNAL paths.
 *
 *   NAMING NOTE: The user-facing label for /app/agents is "Assistants".
 *   The internal route, code identifiers (Agent, AgentCard), API routes
 *   (/api/agents), and DB schema all still say "agent" — renaming those
 *   would be a bigger lift with no user benefit. The display label is the
 *   only thing the customer sees, and that's what changed.
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
  // Team route disabled for v1 — sidebar entry hidden, URL also blocked.
  // Page file still exists at app/t/team/page.tsx; uncomment to re-enable.
  // { path: '/t/team',                 allowedRoles: ['admin'] },
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
  if (role === 'super_admin') return '/console/dashboard';
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
  // Display label is "Assistants" — internal route stays /app/agents to
  // avoid touching API routes, code identifiers, and DB schema. The href
  // is the only thing the router cares about; the label is purely UI.
  { label: 'Assistants', href: '/app/agents',     allowedRoles: ['admin', 'manager'], iconName: 'Bot' },
  { label: 'Campaigns',  href: '/app/campaigns',  allowedRoles: ['admin', 'manager'], iconName: 'Megaphone' },
  { label: 'Live Calls', href: '/app/calls',      allowedRoles: ['admin', 'manager'], iconName: 'Phone' },
  { label: 'Analytics',  href: '/app/analytics',  allowedRoles: ['admin', 'manager'], iconName: 'BarChart3' },
  { label: 'Billing',    href: '/app/billing',    allowedRoles: ['admin'],            iconName: 'CreditCard' },
  // Team management is hidden from sidebar for v1 — single-user workspaces
  // are the norm during early beta. Route + page still exist; re-add this
  // entry when multi-user becomes a customer ask.
  // { label: 'Team',       href: '/app/team',       allowedRoles: ['admin'],            iconName: 'Users' },
];

export const BPO_NAV_GENERAL: NavItem[] = [
  { label: 'Settings',        href: '/app/settings', allowedRoles: ['admin'],            iconName: 'Settings' },
  { label: 'Help & Support',  href: '/app/support',  allowedRoles: ['admin', 'manager'], iconName: 'HelpCircle' },
];

export const CONSOLE_NAV: NavItem[] = [
  { label: 'Global Overview',  href: '/console/dashboard',   allowedRoles: ['super_admin'], iconName: 'LayoutDashboard' },
  { label: 'BPO Clients',      href: '/console/clients',     allowedRoles: ['super_admin'], iconName: 'Users' },
  { label: 'Platform Billing', href: '/console/billing',     allowedRoles: ['super_admin'], iconName: 'CreditCard' },
  { label: 'Credit Ledger',    href: '/console/credits',     allowedRoles: ['super_admin'], iconName: 'Coins' },
  { label: 'System Health',    href: '/console/health',      allowedRoles: ['super_admin'], iconName: 'Server' },
  { label: 'Security & Audit', href: '/console/audit',       allowedRoles: ['super_admin'], iconName: 'Shield' },
  { label: 'Platform Settings',href: '/console/settings',    allowedRoles: ['super_admin'], iconName: 'Settings' },
];

export function filterNavByRole(items: NavItem[], role: Role | null | undefined): NavItem[] {
  if (!role) return [];
  return items.filter(item => item.allowedRoles.includes(role));
}
