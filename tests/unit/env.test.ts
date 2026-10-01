import { describe, expect, it } from 'vitest'
import { missingProductionEnv } from '@/config/env'

describe('missingProductionEnv', () => {
  const full = {
    VITE_FIREBASE_API_KEY: 'key',
    VITE_FIREBASE_AUTH_DOMAIN: 'porchlight.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'porchlight',
    VITE_FIREBASE_STORAGE_BUCKET: 'porchlight.appspot.com',
    VITE_FIREBASE_APP_ID: 'app',
    VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: 'site-key',
  }

  it('is empty when every Firebase variable and the reCAPTCHA key are set', () => {
    expect(missingProductionEnv(full)).toEqual([])
  })

  it('lists blank or missing variables, including the App Check key', () => {
    expect(
      missingProductionEnv({ ...full, VITE_FIREBASE_PROJECT_ID: '', VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: undefined }),
    ).toEqual(['VITE_FIREBASE_PROJECT_ID', 'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'])
    expect(missingProductionEnv({})).toHaveLength(6)
  })
})
