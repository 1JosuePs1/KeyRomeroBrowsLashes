import { clearAdminCookie, createAdminCookie, isAdminRequest, verifyPassword } from './auth.js'
import { neon } from '@neondatabase/serverless'
import type { IncomingMessage, ServerResponse } from 'node:http'

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

function readBody(request: IncomingMessage) {
  return new Promise<{ password?: unknown } | null>((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body) as { password?: unknown })
      } catch {
        resolve(null)
      }
    })
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method === 'GET') {
    let authenticated: boolean
    try { authenticated = isAdminRequest(request) } catch { authenticated = false }
    sendJson(response, authenticated ? 200 : 401, { authenticated }, { 'Cache-Control': 'no-store' })
    return
  }
  if (request.method === 'DELETE') {
    sendJson(response, 200, { authenticated: false }, { 'Set-Cookie': clearAdminCookie() })
    return
  }
  if (request.method !== 'POST') {
    response.writeHead(405)
    response.end('Method not allowed')
    return
  }

  let configuredPasswordHash: string | undefined
  try {
    configuredPasswordHash = await getConfiguredPasswordHash()
  } catch (error) {
    console.error('Admin credentials lookup error', error)
    sendJson(response, 500, { error: 'No se pudo validar el acceso' })
    return
  }
  if (!configuredPasswordHash) {
    response.writeHead(503)
    response.end('Admin access is not configured')
    return
  }

  const body = await readBody(request)
  const password = typeof body?.password === 'string' ? body.password : ''
  const valid = await verifyPassword(password, configuredPasswordHash)

  sendJson(
    response,
    valid ? 200 : 401,
    { authenticated: valid },
    { 'Set-Cookie': valid ? createAdminCookie() : clearAdminCookie() },
  )
}
