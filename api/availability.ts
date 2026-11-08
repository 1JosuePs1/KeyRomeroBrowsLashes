import { neon } from '@neondatabase/serverless'
import { isAdminRequest } from './auth.js'

export const config = { runtime: 'nodejs' }

function getDatabase() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not configured')
  return neon(connectionString)
}

async function ensureTable() {
  const sql = getDatabase()
  await sql`CREATE TABLE IF NOT EXISTS availability_overrides (
    date TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL,
    start_minutes INTEGER,
    end_minutes INTEGER,
    blocked_times TEXT[] NOT NULL DEFAULT '{}'
  )`
  return sql
}

export default async function handler(request: Request) {
  try {
    const sql = await ensureTable()
    if (request.method === 'GET') {
      const rows = await sql`SELECT date, enabled, start_minutes, end_minutes, blocked_times FROM availability_overrides ORDER BY date`
      return Response.json(rows.map((row) => ({
        date: row.date,
        enabled: row.enabled,
        start: row.start_minutes ?? undefined,
        end: row.end_minutes ?? undefined,
        blockedTimes: row.blocked_times ?? [],
      })))
    }

    if (!isAdminRequest(request)) return Response.json({ error: 'No autorizado' }, { status: 401 })
    if (request.method !== 'PUT') return new Response('Method not allowed', { status: 405 })
    const body = await request.json() as { date?: string; enabled?: boolean; start?: number; end?: number; blockedTimes?: string[] }
    if (!body.date || typeof body.enabled !== 'boolean') return Response.json({ error: 'Solicitud inválida' }, { status: 400 })
    await sql`
      INSERT INTO availability_overrides (date, enabled, start_minutes, end_minutes, blocked_times)
      VALUES (${body.date}, ${body.enabled}, ${body.start ?? null}, ${body.end ?? null}, ${body.blockedTimes ?? []})
      ON CONFLICT (date) DO UPDATE SET enabled = EXCLUDED.enabled, start_minutes = EXCLUDED.start_minutes, end_minutes = EXCLUDED.end_minutes, blocked_times = EXCLUDED.blocked_times
    `
    return Response.json({ updated: true })
  } catch (error) {
    console.error('Availability API error', error)
    return Response.json({ error: 'No se pudo procesar la disponibilidad' }, { status: 500 })
  }
}
