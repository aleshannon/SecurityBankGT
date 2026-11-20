function mix(value: string): string {
  let hash = 2166136261
  for (let round = 0; round < 24; round += 1) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index) + round * 17
      hash = Math.imul(hash, 16777619)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function hashSecret(value: string, salt: string): string {
  const digest = mix(`${salt}|${value}|securitybankgt`)
  return `${salt}$${digest}`
}

export function verifySecret(value: string, stored: string): boolean {
  const salt = stored.split('$')[0]
  if (!salt) return false
  const next = hashSecret(value, salt)
  if (next.length !== stored.length) return false
  let diff = 0
  for (let index = 0; index < next.length; index += 1) {
    diff |= next.charCodeAt(index) ^ stored.charCodeAt(index)
  }
  return diff === 0
}

export function sessionTag(token: string, userId: string, mfaVerified: boolean): string {
  return hashSecret(`${token}|${mfaVerified ? '1' : '0'}`, userId)
}

export function randomDigits(length = 6): string {
  const bytes = new Uint32Array(length)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 1_000_000)
  }
  return Array.from(bytes, (value) => String(value % 10)).join('')
}

export function randomId(prefix: string): string {
  const part = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${part}`
}
