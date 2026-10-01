import { describe, expect, it } from 'vitest'
import { authDomainRedirect, type LocationLike } from '@/lib/hostRedirect'

function loc(host: string, path = '/', search = '', hash = ''): LocationLike {
  return { host, hostname: host.replace(/:\d+$/, ''), pathname: path, search, hash }
}

describe('authDomainRedirect (SPEC F4)', () => {
  const authDomain = 'porchlight-nz.firebaseapp.com'

  it('stays on the authDomain', () => {
    expect(authDomainRedirect(loc('porchlight-nz.firebaseapp.com', '/t/te-puke'), authDomain)).toBeNull()
    expect(authDomainRedirect(loc('Porchlight-NZ.firebaseapp.com'), authDomain)).toBeNull()
  })

  it('sends web.app visitors to the same path, query and hash on the authDomain', () => {
    expect(authDomainRedirect(loc('porchlight-nz.web.app', '/', '?pin=abc_HALLOWEEN_2026', '#x'), authDomain)).toBe(
      'https://porchlight-nz.firebaseapp.com/?pin=abc_HALLOWEEN_2026#x',
    )
    expect(authDomainRedirect(loc('porchlight-nz.web.app', '/a/tauranga'), authDomain)).toBe(
      'https://porchlight-nz.firebaseapp.com/a/tauranga',
    )
  })

  it('never redirects local previews or the demo project', () => {
    expect(authDomainRedirect(loc('localhost:4173'), authDomain)).toBeNull()
    expect(authDomainRedirect(loc('127.0.0.1:5173'), authDomain)).toBeNull()
    expect(authDomainRedirect(loc('porchlight-nz.web.app'), 'demo-porchlight.firebaseapp.com')).toBeNull()
    expect(authDomainRedirect(loc('porchlight-nz.web.app'), '')).toBeNull()
  })
})
