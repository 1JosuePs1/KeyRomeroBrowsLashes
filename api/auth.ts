import { createHash, createHmac, timingSafeEqual } from 'crypto'
import type { IncomingMessage } from 'node:http'

const cookieName = 'keylin_admin_session'

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

function hash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest()
}

function sign(value: string) {
  return createHmac('sha256', getSecret()).update(value, 'utf8').digest('hex')
}

export function verifyPassword(password: string, configuredPassword: string) {
  const received = hash(password)
  const expected = Buffer.from(configuredPassword, 'base64')
  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function createAdminCookie() {
  const value = `admin.${Date.now() + 8 * 60 * 60 * 1000}`
  return `${cookieName}=${value}.${sign(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`
}

export function clearAdminCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
}

export function isAdminRequest(request: Request | IncomingMessage) {
  let cookieHeader: string | undefined
  if (typeof (request.headers as Headers).get === 'function') {
    cookieHeader = (request.headers as Headers).get('cookie') ?? undefined
  } else {
    const value = (request.headers as IncomingMessage['headers']).cookie
    cookieHeader = Array.isArray(value) ? value[0] : value
  }
  const cookie = cookieHeader?.split(';').map((item: string) => item.trim()).find((item: string) => item.startsWith(`${cookieName}=`))
  const token = cookie?.slice(cookieName.length + 1)
  if (!token) return false
  const separator = token.lastIndexOf('.')
  const value = separator > 0 ? token.slice(0, separator) : ''
  const signature = separator > 0 ? token.slice(separator + 1) : ''
  if (!value || !signature || Number(value.split('.')[1]) < Date.now()) return false
  const received = Buffer.from(signature)
  const expected = Buffer.from(sign(value))
  return received.length === expected.length && timingSafeEqual(received, expected)
}
