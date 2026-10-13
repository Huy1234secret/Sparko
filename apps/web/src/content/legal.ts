/**
 * Facts the Terms of Service and Privacy Policy rely on. Change them here,
 * and move the effective date forward whenever either document changes.
 */
export const legal = {
  effectiveDate: '12 October 2026',
  operator: 'VietHuy',
  country: 'Vietnam',
  minimumAge: 13,
  email: 'Sparko.support@gmail.com',
  discordInvite: 'https://discord.gg/HwvYrwupZm',
  site: 'https://panel.coin-sprite.com',
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
