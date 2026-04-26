import { redirect } from 'next/navigation';

/**
 * Legacy /contact route. The old standalone page has been replaced by
 * an in-app Help & Support page at /app/support. We redirect for any
 * old bookmarks or external links.
 */
export default function ContactRedirect() {
  redirect('/app/support');
}
