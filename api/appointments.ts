import { neon } from '@neondatabase/serverless'
import { isAdminRequest } from './auth.js'
import { renderAppointmentEmail } from './appointment-email.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const config = { runtime: 'nodejs' }

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
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try { resolve(JSON.parse(body) as Record<string, unknown>) } catch { resolve(null) }
    })
    request.on('error', reject)
  })
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
      const body = await readBody(request) as Partial<AppointmentBody> | null
      if (!body?.id || !body.name || !body.phone || !body.email || !body.date || !body.time || !body.services?.length || !body.receiptName) {
        sendJson(response, 400, { error: 'Faltan datos obligatorios' })
        return
      }

      let rows
      try {
        rows = await sql`
          INSERT INTO appointments (id, created_at, name, phone, email, services, date, time, total, deposit, receipt_name, receipt_data_url)
          VALUES (${body.id}, ${body.createdAt ?? new Date().toISOString()}, ${body.name}, ${body.phone}, ${body.email}, ${body.services}, ${body.date}, ${body.time}, ${body.total ?? 0}, ${body.deposit ?? 0}, ${body.receiptName}, ${body.receiptDataUrl ?? null})
          RETURNING id, created_at, name, phone, email, services, date::text, time, total, deposit, receipt_name, receipt_data_url
        `
      } catch (error) {
        if (error instanceof Error && (error.message.includes('appointments_date_time_key') || error.message.includes('date_time_key'))) {
          sendJson(response, 409, { error: 'Ese horario ya está reservado' })
          return
        }
        throw error
      }

      const appointment = toAppointment(rows[0] as Record<string, unknown>)
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        const emailData = {
          name: body.name,
          email: body.email,
          services: body.services,
          date: body.date,
          time: body.time,
          total: body.total ?? 0,
          deposit: body.deposit ?? 0,
        }
        await Promise.all([
          sendEmail(resendKey, process.env.ADMIN_EMAIL || 'keyromero50@gmail.com', `Nueva solicitud de cita - ${body.name}`, renderAppointmentEmail(emailData, true)),
          sendEmail(resendKey, body.email, 'Recibimos tu solicitud de cita | Keylin Romero', renderAppointmentEmail(emailData, false)),
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
      await sql`UPDATE appointments SET status = ${body.status} WHERE id = ${body.id}`
      sendJson(response, 200, { updated: true })
      return
    }

    response.writeHead(405)
    response.end('Method not allowed')
  } catch (error) {
    console.error('Appointments API error', error)
    sendJson(response, 500, { error: 'No se pudo procesar la solicitud' })
  }
}
