import { clearAdminCookie, createAdminCookie, verifyPassword } from './auth'

export default async function handler(request: Request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const configuredPassword = process.env.ADMIN_PASSWORD
  if (!configuredPassword) return new Response('Admin access is not configured', { status: 503 })

  const body = await request.json().catch(() => null) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  const valid = await verifyPassword(password, configuredPassword)

  return valid
    ? new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': await createAdminCookie() } })
    : new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearAdminCookie() } })
}
