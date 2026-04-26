/**
 * Console dashboard at /console/dashboard.
 *
 * The actual implementation lives in app/console/page.tsx (the route at /console).
 * This file re-exports it so /console/dashboard renders the same component.
 *
 * Why both URLs work:
 *   - /console            → app/console/page.tsx (legacy URL, kept working)
 *   - /console/dashboard  → this file → re-exports the same component (canonical URL)
 *
 * The canonical URL matches the BPO convention (/app/dashboard) and is what the
 * sidebar, topbar, and login redirect all point at.
 */
export { default } from '../page';
