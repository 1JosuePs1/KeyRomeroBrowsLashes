import { neon } from '@neondatabase/serverless'
import { isAdminRequest } from './auth.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

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
    blocked_times TEXT[] NOT NULL DEFAULT '{}',
    available_times TEXT[] NOT NULL DEFAULT '{}',
    slot_durations JSONB NOT NULL DEFAULT '{}'::jsonb
  )`
  await sql`ALTER TABLE availability_overrides ADD COLUMN IF NOT EXISTS available_times TEXT[] NOT NULL DEFAULT '{}'`
  await sql`ALTER TABLE availability_overrides ADD COLUMN IF NOT EXISTS slot_durations JSONB NOT NULL DEFAULT '{}'::jsonb`
  return sql
}

function readBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown> | null>((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try { resolve(JSON.parse(body) as Record<string, unknown>) } catch { resolve(null) }
    })
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

function timeKey(value: string) {
  const direct = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (direct) return value
  const label = /^(\d{1,2}):([0-5]\d)\s*([ap])\.\s*m\.$/i.exec(value)
  if (!label) return value
  let hour = Number(label[1])
  if (label[3].toLowerCase() === 'p' && hour < 12) hour += 12
  if (label[3].toLowerCase() === 'a' && hour === 12) hour = 0
  return `${hour.toString().padStart(2, '0')}:${label[2]}`
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const sql = await ensureTable()
    if (request.method === 'GET') {
      const rows = await sql`SELECT date, enabled, start_minutes, end_minutes, blocked_times, available_times, slot_durations FROM availability_overrides ORDER BY date`
      const appointments = await sql`SELECT date::text, time FROM appointments`
      const bookedByDate = new Map<string, string[]>()
      appointments.forEach((appointment) => {
        const date = String(appointment.date)
        const times = bookedByDate.get(date) ?? []
        bookedByDate.set(date, [...times, timeKey(String(appointment.time))])
      })
      const dates = new Set([...rows.map((row) => String(row.date)), ...bookedByDate.keys()])
      sendJson(response, 200, [...dates].map((date) => {
        const row = rows.find((item) => String(item.date) === date)
        return {
          date,
          enabled: row?.enabled ?? true,
          start: row?.start_minutes ?? undefined,
          end: row?.end_minutes ?? undefined,
          blockedTimes: [...new Set([...(row?.blocked_times ?? []), ...(bookedByDate.get(date) ?? [])])],
          availableTimes: row?.available_times ?? [],
          slotDurations: row?.slot_durations ?? {},
        }
      }))
      return
    }

    if (!isAdminRequest(request)) {
      sendJson(response, 401, { error: 'No autorizado' })
      return
    }
    if (request.method !== 'PUT') {
      response.writeHead(405)
      response.end('Method not allowed')
      return
    }
    const body = await readBody(request) as { date?: string; enabled?: boolean; start?: number; end?: number; blockedTimes?: string[]; availableTimes?: string[]; slotDurations?: Record<string, number> } | null
    if (!body?.date || typeof body.enabled !== 'boolean') {
      sendJson(response, 400, { error: 'Solicitud inválida' })
      return
    }
    await sql`
      INSERT INTO availability_overrides (date, enabled, start_minutes, end_minutes, blocked_times, available_times, slot_durations)
      VALUES (${body.date}, ${body.enabled}, ${body.start ?? null}, ${body.end ?? null}, ${body.blockedTimes ?? []}, ${body.availableTimes ?? []}, ${JSON.stringify(body.slotDurations ?? {})}::jsonb)
      ON CONFLICT (date) DO UPDATE SET enabled = EXCLUDED.enabled, start_minutes = EXCLUDED.start_minutes, end_minutes = EXCLUDED.end_minutes, blocked_times = EXCLUDED.blocked_times, available_times = EXCLUDED.available_times, slot_durations = EXCLUDED.slot_durations
    `
    sendJson(response, 200, { updated: true })
  } catch (error) {
    console.error('Availability API error', error)
    sendJson(response, 500, { error: 'No se pudo procesar la disponibilidad' })
  }
}
