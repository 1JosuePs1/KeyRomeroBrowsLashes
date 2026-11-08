import { clearAdminCookie, createAdminCookie, verifyPassword } from './auth.js'
import { neon } from '@neondatabase/serverless'

export const config = { runtime: 'nodejs' }

function getDatabase() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not configured')
  return neon(connectionString)
}

async function getConfiguredPasswordHash() {
  const sql = getDatabase()
  await sql`CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY,
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  const rows = await sql`
    SELECT password_hash
    FROM admin_credentials
    WHERE active = TRUE
    ORDER BY id
    LIMIT 1
  `
  return rows[0]?.password_hash as string | undefined
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let configuredPasswordHash: string | undefined
  try {
    configuredPasswordHash = await getConfiguredPasswordHash()
  } catch (error) {
    console.error('Admin credentials lookup error', error)
    return Response.json({ error: 'No se pudo validar el acceso' }, { status: 500 })
  }
  if (!configuredPasswordHash) return new Response('Admin access is not configured', { status: 503 })

  const body = await request.json().catch(() => null) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  const valid = await verifyPassword(password, configuredPasswordHash)

  return valid
    ? new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': createAdminCookie() } })
    : new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: { 'Content-Type': 'application/json', 'Set-Cookie': clearAdminCookie() } })
}
