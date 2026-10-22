/** Filled in when the site is built (see vite.config.ts); absent in tests. */
declare const __SITE_FACTS__: Partial<Record<keyof typeof stand, string>>;

/** What a developer's copy shows when the env file has no value. */
const stand = {
  site: 'http://localhost:5173',
  email: 'support@example.com',
  discordInvite: 'https://discord.com',
  operator: 'the Sparko operator',
  country: 'their home country',
};
const built = typeof __SITE_FACTS__ === 'undefined' ? {} : __SITE_FACTS__;
const fact = (k: keyof typeof stand) => built[k] || stand[k];

/**
 * Facts the Terms of Service and Privacy Policy rely on. The contact and
 * operator details come from the server's env file, so they aren't kept in
 * the repository. Move the effective date forward whenever either document
 * changes.
 */
export const legal = {
  effectiveDate: '12 October 2026',
  operator: fact('operator'),
  country: fact('country'),
  minimumAge: 13,
  email: fact('email'),
  discordInvite: fact('discordInvite'),
  site: fact('site'),
  /** Days a removed server's data is kept so an accidental removal can be undone. */
  removalGraceDays: 7,
  /** Longest a ticket transcript is kept, on any plan. */
  transcriptDays: 30,
  /** Ticket transcripts on the Free plan. */
  freeTranscriptDays: 7,
  sessionDays: 7,
  exportDays: 30,
  refundWindowDays: 14,
  /** Encrypted backups are deleted after this many days. */
  backupDays: 30,
} as const;
