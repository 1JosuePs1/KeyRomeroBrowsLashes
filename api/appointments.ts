import { neon } from '@neondatabase/serverless'
import { isAdminRequest } from './auth.js'
import { renderAppointmentEmail } from './appointment-email.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = { runtime: 'nodejs' }

const MAX_RECEIPT_BYTES = 3 * 1024 * 1024
const MAX_REQUEST_BYTES = 4.5 * 1024 * 1024

class RequestBodyTooLargeError extends Error {}

type AppointmentBody = {
  id: string
  createdAt: string
  name: string
  phone: string
  email: string
  services: string[]
  date: string
  time: string
  total: number
  deposit: number
  receiptName: string
  receiptDataUrl?: string
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

async function ensureAvailabilityTable(sql: ReturnType<typeof getDatabase>) {
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
}

async function setSlotBlocked(sql: ReturnType<typeof getDatabase>, date: string, time: string, blocked: boolean) {
  await ensureAvailabilityTable(sql)
  const key = timeKey(time)
  const rows = await sql`SELECT blocked_times FROM availability_overrides WHERE date = ${date}` as Array<{ blocked_times?: string[] }>
  const current = rows[0]?.blocked_times ?? []
  const blockedTimes = blocked
    ? [...new Set([...current, key])]
    : current.filter((item) => item !== key)
  if (rows.length) {
    await sql`UPDATE availability_overrides SET blocked_times = ${blockedTimes} WHERE date = ${date}`
  } else {
    await sql`
      INSERT INTO availability_overrides (date, enabled, blocked_times)
      VALUES (${date}, true, ${blockedTimes})
    `
  }
}

function getDatabase() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not configured')
  return neon(connectionString)
}

function toAppointment(row: Record<string, unknown>) {
  return {
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    phone: row.phone,
    email: row.email,
    services: row.services,
    date: row.date,
    time: row.time,
    total: row.total,
    deposit: row.deposit,
    receiptName: row.receipt_name,
    receiptDataUrl: row.receipt_data_url,
    status: row.status ?? 'pending',
  }
}

async function sendEmail(apiKey: string, to: string, subject: string, html: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Keylin Romero <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  })
  if (!response.ok) console.error('Resend email error', response.status, await response.text())
}

function readBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown> | null>((resolve, reject) => {
    let body = ''
    let size = 0
    let tooLarge = false
    request.on('data', (chunk: Buffer) => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_REQUEST_BYTES) {
        tooLarge = true
        reject(new RequestBodyTooLargeError())
        request.resume()
        return
      }
      body += chunk.toString('utf8')
    })
    request.on('end', () => {
      if (tooLarge) return
      try { resolve(JSON.parse(body) as Record<string, unknown>) } catch { resolve(null) }
    })
    request.on('error', reject)
  })
}

function getReceiptSize(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match || match[2].length % 4 !== 0) return null
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0
  return Math.floor(match[2].length * 3 / 4) - padding
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const sql = getDatabase()

    if (request.method === 'GET') {
      if (!isAdminRequest(request)) { sendJson(response, 401, { error: 'No autorizado' }); return }
      const rows = await sql`SELECT id, created_at, name, phone, email, services, date::text, time, total, deposit, receipt_name, receipt_data_url, status FROM appointments ORDER BY created_at DESC`
      sendJson(response, 200, {
        appointments: rows.filter((row) => row.status !== 'archived').map(toAppointment),
        archivedAppointments: rows.filter((row) => row.status === 'archived').map(toAppointment),
      })
      return
    }

    if (request.method === 'POST') {
      const body = await readBody(request) as (Partial<AppointmentBody> & { manual?: boolean }) | null
      const manual = body?.manual === true && isAdminRequest(request)
      if (!body?.id || !body.name || !body.date || !body.time || !body.services?.length || (!manual && (!body.phone || !body.email || !body.receiptName))) {
        sendJson(response, 400, { error: 'Faltan datos obligatorios' })
        return
      }
      const receiptDataUrl = body.receiptDataUrl
      if (!manual || receiptDataUrl !== undefined) {
        if (typeof receiptDataUrl !== 'string') {
          sendJson(response, 400, { error: 'El comprobante es obligatorio' })
          return
        }
        const receiptSize = getReceiptSize(receiptDataUrl)
        if (receiptSize === null) {
          sendJson(response, 400, { error: 'El comprobante debe ser JPG, PNG o PDF' })
          return
        }
        if (receiptSize > MAX_RECEIPT_BYTES) {
          sendJson(response, 413, { error: 'El comprobante debe pesar máximo 3 MB' })
          return
        }
      }
      const phone = body.phone ?? ''
      const email = body.email ?? ''
      const receiptName = body.receiptName ?? 'Cita manual'

      const sameDay = await sql`SELECT time FROM appointments WHERE date = ${body.date} AND status IS DISTINCT FROM 'archived'`
      if (sameDay.some((row) => timeKey(String(row.time)) === timeKey(body.time as string))) {
        sendJson(response, 409, { error: 'Ese horario ya está reservado' })
        return
      }

      let rows
      try {
        rows = await sql`
          INSERT INTO appointments (id, created_at, name, phone, email, services, date, time, total, deposit, receipt_name, receipt_data_url)
          VALUES (${body.id}, ${body.createdAt ?? new Date().toISOString()}, ${body.name}, ${phone}, ${email}, ${body.services}, ${body.date}, ${body.time}, ${body.total ?? 0}, ${body.deposit ?? 0}, ${receiptName}, ${receiptDataUrl ?? null})
          RETURNING id, created_at, name, phone, email, services, date::text, time, total, deposit, receipt_name, receipt_data_url, status
        `
      } catch (error) {
        if (error instanceof Error && (error.message.includes('appointments_date_time_key') || error.message.includes('date_time_key'))) {
          sendJson(response, 409, { error: 'Ese horario ya está reservado' })
          return
        }
        throw error
      }

      const appointment = toAppointment(rows[0] as Record<string, unknown>)
      try {
        await setSlotBlocked(sql, body.date, body.time, true)
      } catch (error) {
        console.error('Could not block booked slot', error)
      }
      const resendKey = process.env.RESEND_API_KEY
      if (manual) {
        sendJson(response, 201, appointment)
        return
      }
      if (resendKey) {
        const emailData = {
          name: body.name,
          email,
          services: body.services,
          date: body.date,
          time: body.time,
          total: body.total ?? 0,
          deposit: body.deposit ?? 0,
        }
        await Promise.allSettled([
          sendEmail(resendKey, process.env.ADMIN_EMAIL || 'keyromero50@gmail.com', `Nueva solicitud de cita - ${body.name}`, renderAppointmentEmail(emailData, true)),
          sendEmail(resendKey, email, 'Recibimos tu solicitud de cita | Keylin Romero', renderAppointmentEmail(emailData, false)),
        ])
      } else {
        console.error('RESEND_API_KEY is not configured; appointment email notifications were skipped')
      }
      sendJson(response, 201, appointment)
      return
    }

    if (request.method === 'PATCH') {
      if (!isAdminRequest(request)) { sendJson(response, 401, { error: 'No autorizado' }); return }
      const body = await readBody(request) as { id?: string; status?: string } | null
      if (!body?.id || !['pending', 'archived'].includes(body.status ?? '')) { sendJson(response, 400, { error: 'Solicitud inválida' }); return }
      const currentRows = await sql`SELECT date::text, time FROM appointments WHERE id = ${body.id} LIMIT 1`
      if (!currentRows.length) { sendJson(response, 404, { error: 'Cita no encontrada' }); return }
      const current = currentRows[0] as { date: string; time: string }
      if (body.status !== 'archived') {
        const sameDay = await sql`SELECT time FROM appointments WHERE date = ${current.date} AND id <> ${body.id} AND status IS DISTINCT FROM 'archived'`
        if (sameDay.some((row) => timeKey(String(row.time)) === timeKey(current.time))) {
          sendJson(response, 409, { error: 'La hora ya está ocupada' })
          return
        }
      }
      await sql`UPDATE appointments SET status = ${body.status} WHERE id = ${body.id}`
      await setSlotBlocked(sql, current.date, current.time, body.status !== 'archived')
      sendJson(response, 200, { updated: true })
      return
    }

    if (request.method === 'PUT') {
      if (!isAdminRequest(request)) { sendJson(response, 401, { error: 'No autorizado' }); return }
      const body = await readBody(request) as { id?: string; date?: string; time?: string } | null
      if (!body?.id || !body.date || !body.time) { sendJson(response, 400, { error: 'Fecha y hora son obligatorias' }); return }
      const currentRows = await sql`SELECT date::text, time FROM appointments WHERE id = ${body.id} LIMIT 1`
      if (!currentRows.length) { sendJson(response, 404, { error: 'Cita no encontrada' }); return }
      const sameDay = await sql`
        SELECT time FROM appointments
        WHERE date = ${body.date} AND id <> ${body.id} AND status IS DISTINCT FROM 'archived'
      `
      const conflicts = sameDay.filter((row) => timeKey(String(row.time)) === timeKey(body.time as string))
      if (conflicts.length) { sendJson(response, 409, { error: 'La hora ya está ocupada' }); return }
      const rows = await sql`
        UPDATE appointments SET date = ${body.date}, time = ${body.time}
        WHERE id = ${body.id}
        RETURNING id, created_at, name, phone, email, services, date::text, time, total, deposit, receipt_name, receipt_data_url, status
      `
      if (!rows.length) { sendJson(response, 404, { error: 'Cita no encontrada' }); return }
      const current = currentRows[0] as { date: string; time: string }
      await setSlotBlocked(sql, current.date, current.time, false)
      await setSlotBlocked(sql, body.date, body.time, true)
      sendJson(response, 200, toAppointment(rows[0] as Record<string, unknown>))
      return
    }

    if (request.method === 'DELETE') {
      if (!isAdminRequest(request)) { sendJson(response, 401, { error: 'No autorizado' }); return }
      const body = await readBody(request) as { id?: string } | null
      if (!body?.id) { sendJson(response, 400, { error: 'La cita es obligatoria' }); return }
      const currentRows = await sql`SELECT date::text, time FROM appointments WHERE id = ${body.id} LIMIT 1`
      const deleted = await sql`DELETE FROM appointments WHERE id = ${body.id} RETURNING id`
      if (deleted.length && currentRows.length) {
        const current = currentRows[0] as { date: string; time: string }
        await setSlotBlocked(sql, current.date, current.time, false)
      }
      sendJson(response, 200, { deleted: deleted.length > 0 })
      return
    }

    response.writeHead(405)
    response.end('Method not allowed')
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendJson(response, 413, { error: 'La solicitud supera el tamaño permitido' })
      return
    }
    console.error('Appointments API error', error)
    sendJson(response, 500, { error: 'No se pudo procesar la solicitud' })
  }
}
