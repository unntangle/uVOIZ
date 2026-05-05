// ============================================
// DND scrubbing — provider interface + stub
// ============================================
//
// Indian outbound calling requires checking each phone number against
// the National Customer Preference Register (NCPR / DND) before
// placing a promotional call. The check is provided by licensed access
// providers (Vi, Airtel, Jio, or aggregators like RouteMobile, Karix,
// Gupshup). Each one has a slightly different API but the same shape:
//
//   input  : list of phone numbers, your account creds
//   output : same list, each annotated 'clean' / 'dnd' / 'unreachable'
//
// We don't have a provider account at the moment. Rather than block on
// vendor selection, this file ships the abstraction now and a stub
// implementation that flags every number 'unchecked'. Once a provider
// is contracted, swap the implementation of `scrubBatch()` and nothing
// upstream needs to change.
//
// Where this is called from:
//   - Bulk: a future "Scrub contacts" button on the campaign contacts
//     page, or a cron that scrubs newly-added contacts in the
//     background. Writes results back to contacts.dnd_status.
//   - Per-call: NOT called per-call. The dialer reads the cached
//     dnd_status off the contacts row. Per-call scrubs would explode
//     latency and cost, and providers price by API hit.
// ============================================

export type DndStatus = 'unchecked' | 'clean' | 'dnd' | 'unreachable';

export interface DndScrubResult {
  phone: string;
  status: DndStatus;
  /** ISO timestamp the provider returned (or our wall clock if unknown). */
  checkedAt: string;
  /** Provider-specific identifier for the scrub. Useful for audit. */
  providerRef?: string;
}

export interface DndProvider {
  /** Lowercase machine name, written into contacts.dnd_provider. */
  name: string;

  /**
   * Scrub a batch of phone numbers. Implementations should:
   *   - De-duplicate the input internally if the provider charges
   *     per number rather than per request
   *   - Treat any provider error or timeout as 'unreachable' (NOT
   *     'clean') — false negatives risk regulatory violations
   *   - Always return the same number of results as inputs, in order
   */
  scrubBatch(phones: string[]): Promise<DndScrubResult[]>;
}

// ─────────────────────────────────────────────────────────────────
// Stub provider — until a real one is wired up
// ─────────────────────────────────────────────────────────────────
//
// Returns 'unchecked' for every input. The dialer treats 'unchecked'
// as allowed-with-warning (see lib/compliance.ts checkDndStatus), so
// dev work is not blocked but a strict-mode org will see warnings
// fire until a real provider is in place.
//
// Don't change this to return 'clean' just to silence the warnings —
// that would mask the missing integration.

export const stubDndProvider: DndProvider = {
  name: 'stub',
  async scrubBatch(phones) {
    const checkedAt = new Date().toISOString();
    return phones.map((phone) => ({
      phone,
      status: 'unchecked' as const,
      checkedAt,
      providerRef: 'stub-no-op',
    }));
  },
};

// ─────────────────────────────────────────────────────────────────
// Provider selection
// ─────────────────────────────────────────────────────────────────
//
// Driven by env. When a real provider is added, register it in the
// switch below and add the corresponding env vars to .env.example.
// Keeping this single switch means there's exactly one place to grep
// for "what provider is in production right now".

export function getDndProvider(): DndProvider {
  const name = (process.env.DND_PROVIDER || 'stub').toLowerCase();
  switch (name) {
    case 'stub':
      return stubDndProvider;
    // case 'routemobile':
    //   return routeMobileProvider;
    // case 'karix':
    //   return karixProvider;
    default:
      console.warn(
        `Unknown DND_PROVIDER "${name}" — falling back to stub. Calls will not be scrubbed.`,
      );
      return stubDndProvider;
  }
}
