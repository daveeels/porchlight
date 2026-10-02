<script setup lang="ts">
// /about — how Porchlight works, privacy policy and terms (SPEC F9, §10).
// Public. The privacy policy URL for the Google consent screen is /about#privacy.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { COMMUNITY_RULES, RULES_TITLE } from '@/config/terms'
import { useAppConfigStore } from '@/stores/appConfig'
import { useAuthStore } from '@/stores/auth'
import { useTermsStore } from '@/stores/terms'
import { useWelcomeStore } from '@/stores/welcome'
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  onIonViewDidEnter,
} from '@ionic/vue'

const CONTACT_EMAIL = 'dewetellis@gmail.com'
const LAST_UPDATED = '2 October 2026'

const route = useRoute()
const appConfig = useAppConfigStore()
const auth = useAuthStore()
const terms = useTermsStore()
const welcome = useWelcomeStore()

const rulesButton = computed(() => (auth.isSignedIn && !terms.accepted ? 'Read and agree' : 'Open the community rules'))

// ion-content scrolls itself (not the document), so sections are scrolled to
// by hand, and the URL hash isn't touched (it would trigger a navigation).
function jump(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

onIonViewDidEnter(() => {
  const id = route.hash.replace(/^#/, '')
  if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
})
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" class="back" />
        </ion-buttons>
        <ion-title>About Porchlight</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <article class="about mx-auto flex max-w-2xl flex-col gap-2 pb-10">
        <nav aria-label="On this page" class="flex flex-wrap gap-x-4 text-sm">
          <a href="#how" class="link" @click.prevent="jump('how')">How it works</a>
          <a href="#rules" class="link" @click.prevent="jump('rules')">Community rules</a>
          <a href="#privacy" class="link" @click.prevent="jump('privacy')">Privacy policy</a>
          <a href="#terms" class="link" @click.prevent="jump('terms')">Terms</a>
          <a href="#credits" class="link" @click.prevent="jump('credits')">Credits</a>
        </nav>

        <section id="how" aria-labelledby="how-h">
          <h1 id="how-h">How Porchlight works</h1>
          <p>
            Porchlight helps you find the houses worth the drive at Halloween and Christmas, starting in Tauranga &amp;
            surrounds. Anyone can search by town or suburb, or tap “Near me”, without an account. Sign in with Google to
            use the map, add your own display and vote.
          </p>
          <ion-button fill="outline" class="tap mt-1" data-testid="about-welcome-open" @click="welcome.reopen()">
            Show me the quick tour
          </ion-button>
          <h2>Adding a display</h2>
          <p>
            Each account can add one display per season, with a photo, a short title and an optional description. New
            displays go live straight away as <strong>Unverified</strong>. Displays are cleared out after each season,
            so every year starts fresh.
          </p>
          <h2>Verification and votes</h2>
          <p>
            When you visit a display, tap <strong>It's here ✓</strong> or <strong>Not there ✗</strong>. Once at least
            three people say it's there (and they clearly outnumber the “not there” votes), it becomes
            <strong>Verified</strong> and shows higher in the list. If enough people say it's not there, it's hidden
            until a moderator checks it. You can change your vote, but you can't vote on your own display. If a photo
            changes, the votes start again, because people confirmed the old photo.
          </p>
          <p>
            Something wrong or inappropriate? Use <strong>Report</strong> on the display. Displays with several reports
            are hidden while a moderator takes a look.
          </p>
          <h2>Location and photos</h2>
          <p>
            We show each display about 25–50 m from where it was placed, and we strip hidden data such as GPS
            coordinates and camera details from every photo. That makes the exact house a little harder to pinpoint, but
            it doesn't hide it — the photo still shows the house. Only the suburb or town is shown, never the street, and
            displays never show who added them.
          </p>
        </section>

        <section id="rules" aria-labelledby="rules-h" data-testid="about-rules">
          <h1 id="rules-h">Community rules</h1>
          <p>{{ RULES_TITLE }}, everyone agrees to these. You'll be asked once, after you first sign in.</p>
          <ol>
            <li v-for="(rule, i) in COMMUNITY_RULES" :key="i">{{ rule }}</li>
          </ol>
          <ion-button fill="outline" class="tap mt-2" data-testid="about-rules-open" @click="terms.showRules()">
            {{ rulesButton }}
          </ion-button>
        </section>

        <section id="privacy" aria-labelledby="privacy-h">
          <h1 id="privacy-h">Privacy policy</h1>
          <p class="meta">Last updated {{ LAST_UPDATED }}</p>
          <p>
            Porchlight is a small community project run from Aotearoa New Zealand. We follow the
            <strong>Privacy Act 2020</strong> and its Information Privacy Principles. This policy explains what we
            collect, why, and what you can do about it.
          </p>
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Your Google account email</strong> (and the name and profile picture Google shares), held by
              Firebase Authentication so you can sign in. It's never shown on displays or stored with them.
            </li>
            <li>
              <strong>Approximate location of your display.</strong> When you add a display, the point you choose is
              sent to our server, which moves it a random 25–50 m and stores only that approximate point and the town.
              The exact point isn't stored or logged.
            </li>
            <li>
              <strong>Photos</strong> you upload, after we remove their hidden data (including GPS location).
            </li>
            <li>
              <strong>Your activity:</strong> the display you added, your votes and reports, linked to an anonymous
              account ID so we can enforce one display, one vote and one report per person, plus daily limits.
            </li>
            <li>
              <strong>“Near me” location</strong> is used on your device to look up nearby displays. We don't store it.
            </li>
            <li>
              <strong>Technical data:</strong> basic service logs and anti-abuse checks (Firebase App Check with Google
              reCAPTCHA), used to keep bots out.
            </li>
          </ul>
          <h2>Why we collect it</h2>
          <p>
            Only to run Porchlight: to sign you in, show displays to other people, count votes fairly, stop spam and
            abuse, and answer your requests. We don't sell your information, show ads based on it, or share it with
            anyone except the service providers below.
          </p>
          <h2>Where it's stored and who else sees it</h2>
          <ul>
            <li>
              <strong>Google Cloud (Firebase)</strong> runs Porchlight and stores its data in the
              <strong>United States</strong> (us-central1). Google processes it on our behalf under its standard data
              protection terms.
            </li>
            <li>
              <strong>Map tiles (OpenFreeMap).</strong> When you open the map, or choose where your display is, your
              browser loads the map pictures directly from OpenFreeMap. Like any website, it sees your IP address and
              which part of the map you're looking at. We don't send it anything else.
            </li>
            <li>
              <strong>Address search (Photon).</strong> When you add a display, you can search for your address. What
              you type into address search is sent to Photon, run by komoot in Germany, only to find the address. We
              don't store what you type; only the point you choose goes on to our server (which moves it 25–50 m, as
              above).
            </li>
            <li>
              <strong>Private beta.</strong> While Porchlight is in beta, we keep a list of tester email addresses on
              our server to decide who can post. It's never shown to anyone.
            </li>
          </ul>
          <h2>How long we keep it</h2>
          <p>
            Displays, photos, votes and reports are deleted about <strong>13 months</strong> after the season ends. Your
            sign-in account stays until you ask us to delete it.
          </p>
          <p>
            When you delete your display, it's hidden from everyone straight away and its photo is deleted. The rest
            (title, description, approximate location, town and votes) is kept, hidden, until that season's data is
            deleted, so we can enforce the per-season limits. If your display was reported, its photo is kept until a
            moderator has looked at it. To have everything removed sooner, email us.
          </p>
          <h2>Your rights</h2>
          <p>
            You can ask to see the personal information we hold about you, to correct it, or to delete it (including
            your account). If someone has posted your house and you'd like it taken down, email us and we'll remove it.
            Contact <a :href="`mailto:${CONTACT_EMAIL}`" class="link">{{ CONTACT_EMAIL }}</a>. We aim to reply within a
            few days. If you're not happy with our response, you can complain to the
            <a href="https://www.privacy.org.nz" target="_blank" rel="noopener" class="link">Privacy Commissioner</a>.
            If there's ever a serious privacy breach, we'll tell the people affected and the Privacy Commissioner, as the
            law requires.
          </p>
        </section>

        <section id="terms" aria-labelledby="terms-h">
          <h1 id="terms-h">Terms of use and community guidelines</h1>
          <p>By using Porchlight you agree to these terms. Kia pai te haere — have fun out there.</p>
          <h2>What you can post</h2>
          <ul>
            <li>Real decorated displays only — houses, gardens or shopfronts dressed up for the season.</li>
            <li>
              Only post a house if it's yours or you have the owner's permission. You confirm this each time you add a
              display.
            </li>
            <li>No house numbers, car plates or people's faces in photos, titles or descriptions.</li>
            <li>No links, ads, offensive content, or anything that isn't a display.</li>
            <li>Use photos you took yourself or have the right to share. You keep ownership; you let us show them on Porchlight.</li>
          </ul>
          <h2>Who can use it</h2>
          <p>You need to be at least <strong>13 years old</strong> to create an account.</p>
          <h2>Visiting displays</h2>
          <p>
            Be a good neighbour: stay on the footpath, don't block driveways, keep the noise down, and respect the
            owner's wishes. Locations are approximate and displays change, so we can't promise one will be there.
          </p>
          <h2>Moderation</h2>
          <p>Before you post, edit, vote or report, you agree to the community rules above (once per version).</p>
          <p>
            We can hide or remove any display, and suspend accounts that break these guidelines or abuse the service,
            with or without notice. Displays reported by the community may be hidden while we review them.
          </p>
          <h2>The fine print</h2>
          <p>
            Porchlight is provided free and “as is”. We do our best to keep it running and accurate, but we're not
            responsible for what people post or for anything that happens on a visit. These terms may change; we'll
            update the date above when they do. They're governed by New Zealand law.
          </p>
        </section>

        <section id="credits" aria-labelledby="credits-h">
          <h1 id="credits-h">Credits</h1>
          <ul>
            <li>
              Town and suburb names from
              <a href="https://www.geonames.org" target="_blank" rel="noopener" class="link">GeoNames</a>, licensed under
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener" class="link">CC BY 4.0</a>.
            </li>
            <li>
              Map data ©
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" class="link">OpenStreetMap contributors</a>,
              map tiles by
              <a href="https://openfreemap.org" target="_blank" rel="noopener" class="link">OpenFreeMap</a>
              (© OpenMapTiles), drawn with MapLibre.
            </li>
            <li>
              Address search by
              <a href="https://photon.komoot.io" target="_blank" rel="noopener" class="link">Photon</a> (komoot), using
              © OpenStreetMap contributors data.
            </li>
          </ul>
          <template v-if="appConfig.config.donateUrl">
            <h2>Support Porchlight</h2>
            <p>
              Porchlight is free, ad-free and made by a local in Tauranga. If it made your night out better,
              <a :href="appConfig.config.donateUrl" target="_blank" rel="noopener" class="link" data-testid="donate-about"
                >buy a bad decision 🍻</a
              >. Donations are handled by Ko-fi on their own site, under Ko-fi's privacy policy — Porchlight never sees
              your payment details.
            </p>
          </template>
          <h2>Contact</h2>
          <p>
            Questions, takedown requests or privacy requests:
            <a :href="`mailto:${CONTACT_EMAIL}`" class="link">{{ CONTACT_EMAIL }}</a>
          </p>
        </section>
      </article>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.back {
  --min-height: 44px;
  --min-width: 44px;
}
.about section {
  scroll-margin-top: 8px;
}
.about h1 {
  margin: 1.5rem 0 0.5rem;
  font-family: var(--pl-font-display);
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1.1;
  font-synthesis: none;
}
.about h2 {
  margin: 1.25rem 0 0.25rem;
  font-size: 1.1rem;
  font-weight: 800;
}
.about p,
.about li {
  line-height: 1.55;
}
.about p {
  margin: 0.5rem 0;
}
.about ul,
.about ol {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
}
.tap {
  min-height: 44px;
}
.about li {
  margin: 0.35rem 0;
}
.meta {
  font-size: 0.85rem;
  color: var(--pl-muted);
}
.link {
  color: var(--ion-color-primary);
  font-weight: 800;
  overflow-wrap: anywhere;
}
nav .link {
  display: inline-block;
  padding: 12px 0;
}
</style>
