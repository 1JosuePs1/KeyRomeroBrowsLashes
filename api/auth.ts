import { createHmac, timingSafeEqual } from 'node:crypto'

const cookieName = 'keylin_admin_session'

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

function sign(value: string) {
  return createHmac('sha256', getSecret()).update(value).digest('hex')
}

export function createAdminCookie() {
  const value = `admin.${Date.now() + 8 * 60 * 60 * 1000}`
  return `${cookieName}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
}

export function clearAdminCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

export function isAdminRequest(request: Request) {
  const cookie = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  if (!token) return false
  const separator = token.lastIndexOf('.')
  const value = separator > 0 ? token.slice(0, separator) : ''
  const signature = separator > 0 ? token.slice(separator + 1) : ''
  if (!value || !signature || Number(value.split('.')[1]) < Date.now()) return false
  const expected = sign(value)
  const received = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer)
}
