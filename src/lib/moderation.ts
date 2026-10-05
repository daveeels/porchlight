// Pure helpers for the Moderation page.

export const REPORT_REASON_LABELS: Record<string, string> = {
  NOT_A_DISPLAY: 'Not a display',
  INAPPROPRIATE: 'Inappropriate',
  PRIVACY: 'Privacy',
  SPAM: 'Spam',
  OTHER: 'Other',
}

/** "Inappropriate ×2 · Spam", most common first. Uncounted reports still listed. */
export function summariseReports(reasons: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([r, n]) => `${REPORT_REASON_LABELS[r] ?? r}${n > 1 ? ` ×${n}` : ''}`)
    .join(' · ')
}
