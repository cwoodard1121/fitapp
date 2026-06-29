/**
 * AES-256-GCM encryption for wearable OAuth tokens at rest.
 *
 * Server-only (uses node:crypto). The key comes from WEARABLE_TOKEN_ENC_KEY — a
 * 32-byte key, base64-encoded. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Ciphertext format: "<ivB64>.<tagB64>.<ctB64>" so each field decodes
 * independently. A wrong/short key throws loudly rather than silently storing
 * recoverable plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function getKey(): Buffer {
  const raw = process.env.WEARABLE_TOKEN_ENC_KEY
  if (!raw) throw new Error('WEARABLE_TOKEN_ENC_KEY is not set')
  const key = Buffer.from(raw.trim(), 'base64')
  if (key.length !== 32) {
    throw new Error(
      'WEARABLE_TOKEN_ENC_KEY must be a base64-encoded 32-byte key (got ' +
        key.length +
        ' bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    )
  }
  return key
}

/** Encrypt a UTF-8 string; returns "iv.tag.ciphertext" (all base64). */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

/** Decrypt a value produced by encryptToken(). Throws on tamper/format error. */
export function decryptToken(payload: string): string {
  const key = getKey()
  const [ivB64, tagB64, ctB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed encrypted token')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ])
  return pt.toString('utf8')
}
