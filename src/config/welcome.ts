// First-run welcome (SPEC F14): four storybook cards. Cards 1–3 are for every
// visitor; card 4 follows a first sign-in and leads into the community rules.
// The season label ("Halloween" / "Christmas") comes from SEASON_THEMES.
// A non-breaking space keeps "10–15 m" on one line.

export type WelcomeStep = 'find' | 'search' | 'vote' | 'add'

export interface WelcomeCard {
  step: WelcomeStep
  title: string
  text: string
}

/** The visitor cards, in order. */
export const VISITOR_STEPS: readonly WelcomeStep[] = ['find', 'search', 'vote']
/** The member card (after a first sign-in). */
export const MEMBER_STEP: WelcomeStep = 'add'

export function welcomeCard(step: WelcomeStep, seasonLabel: string): WelcomeCard {
  switch (step) {
    case 'find':
      return {
        step,
        title: 'Find the houses worth the drive',
        text: `Porchlight shows the best ${seasonLabel} displays around Tauranga, shared by the people who made them.`,
      }
    case 'search':
      return {
        step,
        title: 'Search your suburb, or tap Near me',
        text: "Glowing houses are verified: neighbours have checked they're really there.",
      }
    case 'vote':
      return {
        step,
        title: 'Seen one? Tell everyone',
        text: 'Tap "It\'s here" after you visit. Three votes and a display gets the ✓ Verified sticker.',
      }
    case 'add':
      return {
        step,
        title: 'Add your own display',
        text: 'Snap a photo and drop a pin. We show it 10–15\u00a0m away, so your exact address stays a little private.',
      }
  }
}
