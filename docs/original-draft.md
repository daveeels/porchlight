Here is a clear architectural overview and a ready-to-use CLAUDE.md context file designed to align AI assistants (like Claude, Cursor, or Copilot) with your exact stack, cross-platform scaling goals, anti-spam protections, and seasonal flexibility.

Key Technical Answers Before You Start
Firebase + Magic Links: Yes, Firebase Authentication natively supports passwordless Email Link (Magic Link) sign-in out of the box. It sends an authorization link to the user's email, preventing bot accounts without requiring passwords.

Preventing Map API Key Cost Blowouts:

Google Maps can get expensive ($7 per 1,000 map loads). Mapbox GL JS / Leaflet with OpenStreetMap tiles is much safer. Mapbox gives 50,000 free web map loads per month.

Rate-limiting & Caching: Load pins as a geo-filtered cluster (GeoHash / Bounding Box) from Firestore rather than re-querying the whole world. Store your Mapbox public token safely with domain-restricted HTTP referrer rules.

Cross-Platform Mobile (Web, iOS, Android):

Build it as a Progressive Web App (PWA) first using Vue 3 + Vite + Tailwind CSS + Ionic Framework / PrimeVue components.

When you are ready for native app stores (iOS & Android), wrap your exact same Vue codebase using CapacitorJS. Capacitor compiles web code into native Android and iOS apps without rewriting anything.

Monetization & Covering Costs:

Premium Pin Upgrades ("Featured House"): Homeowners pay a small $2–$5 fee (via Stripe) to make their pin custom-colored, larger, or pinned to top search results.

Sponsor / Decorator Ads: Local stores (e.g., local light shops, party supply stores) pay for banner placement or a featured map marker.

In-App Donations: Simple Buy Me a Coffee / Ko-fi link for visitors who love using the map.

Project File: CLAUDE.md
Save the block below into the root of your project directory as CLAUDE.md.

Markdown

# Project Directive: Seasonal Lights & Display Finder (Holiday Display Map)

## 1. High-Level Vision

A responsive cross-platform web and mobile app (iOS/Android capable) that allows users to discover and share decorated houses for major holidays (Halloween, Christmas, etc.).

### Core Principles

- **Theme Switcher:** Seamless transition between Halloween ("Spooky Map") and Christmas ("Festive Lights") themes, swapping UI palettes, map icons, and active dataset query filters.
- **Anti-Spam First:** Public browsing is free, but pin submission requires lightweight magic-link authentication, image proof, and automated rate limiting.
- **Privacy First:** Exact home coordinates are slightly jittered (approx. 30–50m offset), and image metadata (EXIF GPS data) is wiped on upload.

---

## 2. Tech Stack Definition

- **Frontend Framework:** Vue 3 (Composition API `<script setup lang="ts">`)
- **Language:** TypeScript
- **Styling & UI Components:** Tailwind CSS + Ionic Vue (or PrimeVue) for mobile-first adaptive UI (responsive across Phone, Tablet, Desktop).
- **Map Library:** Mapbox GL JS or Leaflet.js with custom tile themes (Dark/Spooky for Halloween, Snowy/Bright for Christmas).
- **Backend & Auth:** Firebase (Firestore Data Store, Firebase Auth with Email Magic Links, Firebase Storage for photo uploads).
- **Cross-Platform Deployment:** PWA for web browser access, compiled to Native Android/iOS via **CapacitorJS**.

---

## 3. Core Requirements & Logic

### A. Dynamic Seasonal Modes

- Toggle states: `HALLOWEEN` | `CHRISTMAS`.
- Selecting a season filters Firestore queries by active tag (e.g., `season == "HALLOWEEN"`).
- UI dynamically adjusts colors (Orange/Purple for Halloween, Red/Green for Christmas).

### B. Anti-Spam & Moderation Controls

1. **Magic Link Sign-In:** Users must authenticate via Email Link before dropping a pin.
2. **Submission Constraints:**
   - 1 active pin per user per seasonal event.
   - Required photo upload of display (wiping EXIF data server-side/client-side before upload).
   - Rate limit backend writes to prevent script spamming.
3. **Crowd Moderation:**
   - Community "Flag / Inaccurate" button.
   - Automatically hide pins receiving 3+ flags pending admin approval.
   - Community "Visited!" button to boost trust scores on legitimate pins.
4. **Auto-Expiration:** Pins automatically archive 7 days after the holiday ends (e.g., Nov 7th for Halloween, Jan 7th for Christmas).

### C. Monetization & Sustainability Strategy

- **Featured Pins:** Homeowners can buy a "Sparkle / Animated Marker" upgrade via Stripe to highlight their display.
- **Local Sponsor Markers:** Local businesses (light suppliers, holiday markets) buy custom icon pins.
- **Donation Banner:** Subtle "Keep the map running" coffee tip-jar footer.

---

## 4. Firestore Data Schema Structure

```typescript
// /collections/displays/{displayId}
interface DisplayPin {
  id: string;
  userId: string;
  season: 'HALLOWEEN' | 'CHRISTMAS';
  title: string;
  description?: string;
  photoUrl: string;
  location: {
    latitude: number;   // Jittered coordinate (+/- 0.0004)
    longitude: number;  // Jittered coordinate (+/- 0.0004)
    geohash: string;    // Used for bounded map queries
  };
  isFeatured: boolean;  // Paid highlight state
  trustScore: number;   // Upvotes minus flags
  flagsCount: number;
  status: 'ACTIVE' | 'FLAGGED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
}
5. Architectural Standards & Developer Rules
Script Setup: Always use Vue 3 <script setup lang="ts"> syntax.

State Management: Use Pinia for state management (useSeasonStore, useAuthStore, useMapStore).

Clean Maps: Never expose raw un-restricted API keys in client repos. Restrict Mapbox / Map API keys by domain origin in the map provider dashboard.

Mobile Layout: Design mobile-first. Test tap targets (min 44px) and bottom-sheet drawer overlays for pin details.


---

<ElicitationsGroup message="How would you like to proceed next?">
  <Elicitation label="Generate initial Vue 3 + Firebase starter code" query="Can you generate a starter Vue 3 TypeScript component set for the map, pin submission drawer, and theme switcher?"/>
  <Elicitation label="Set up the CapacitorJS build pipeline for mobile apps" query="How do I set up CapacitorJS with Vue 3 to build native APKs for Android and iOS builds later?"/>
</ElicitationsGroup>
```
