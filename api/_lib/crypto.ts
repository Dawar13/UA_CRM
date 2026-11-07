/**
 * Refresh tokens at rest (D-050): AES-256-GCM with a 96-bit random IV per token and a key version,
 * so a key can be rotated while older tokens stay readable. The tag is appended to the
 * ciphertext; any change to either is rejected. Keys live only in Vercel environment variables,
 * so a database backup holds ciphertext alone.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export interface Sealed {
  ciphertext: string
  iv: string
  keyVersion: number
}

const TAG_BYTES = 16

export function seal(plain: string, keys: ReadonlyMap<number, Buffer>, version: number): Sealed {
  const key = keys.get(version)
  if (!key) throw new Error(`No token key for version ${version}`)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return { ciphertext: body.toString('base64'), iv: iv.toString('base64'), keyVersion: version }
}

export class SealError extends Error {
  constructor(reason: 'unknown-key' | 'tampered') {
    super(
      reason === 'unknown-key' ? 'Token key version not available' : 'Token failed verification',
    )
    this.name = 'SealError'
  }
}

export function open(sealed: Sealed, keys: ReadonlyMap<number, Buffer>): string {
  const key = keys.get(sealed.keyVersion)
  if (!key) throw new SealError('unknown-key')
  try {
    const body = Buffer.from(sealed.ciphertext, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'))
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES))
    return Buffer.concat([
      decipher.update(body.subarray(0, body.length - TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    throw new SealError('tampered')
  }
}

/** URL-safe random text: OAuth state nonces, PKCE verifiers, push channel tokens. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** PKCE S256 challenge for a verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** A one-way hash, for comparing a push channel's token without storing it. */
export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
