const cookieName = 'keylin_admin_session'

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(getSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password: string, configuredPassword: string) {
  const received = await digest(password)
  const expected = await digest(configuredPassword)
  return received === expected
}

export async function createAdminCookie() {
  const value = `admin.${Date.now() + 8 * 60 * 60 * 1000}`
  return `${cookieName}=${value}.${await sign(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
}

export function clearAdminCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

export async function isAdminRequest(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  if (!token) return false
  const separator = token.lastIndexOf('.')
  const value = separator > 0 ? token.slice(0, separator) : ''
  const signature = separator > 0 ? token.slice(separator + 1) : ''
  if (!value || !signature || Number(value.split('.')[1]) < Date.now()) return false
  return signature === await sign(value)
}
