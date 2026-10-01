// "Send feedback" mailto link for the private beta (SPEC §5 "Beta mode").

export const FEEDBACK_SUBJECT = 'Porchlight beta feedback'

export interface FeedbackContext {
  url: string
  version: string
  userAgent: string
  screen: string
  signedIn: boolean
}

export function feedbackBody(ctx: FeedbackContext): string {
  return [
    'What happened, or what would you like to see?',
    '',
    '',
    '',
    '— Please keep the details below, they help us fix things —',
    `Page: ${ctx.url}`,
    `App version: ${ctx.version}`,
    `Browser: ${ctx.userAgent}`,
    `Screen: ${ctx.screen}`,
    `Signed in: ${ctx.signedIn ? 'yes' : 'no'}`,
  ].join('\n')
}

/** mailto: with subject and body percent-encoded (spaces as %20, newlines as %0A). */
export function feedbackMailto(to: string, ctx: FeedbackContext): string {
  const q = `subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent(feedbackBody(ctx))}`
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${q}`
}
