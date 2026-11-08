import { neon } from '@neondatabase/serverless'
import { isAdminRequest } from './auth'
import { renderAppointmentEmail } from './appointment-email'

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

export default async function handler(request: Request) {
  try {
    const sql = getDatabase()

    if (request.method === 'GET') {
      if (!isAdminRequest(request)) return Response.json({ error: 'No autorizado' }, { status: 401 })
      const rows = await sql`SELECT id, created_at, name, phone, email, services, date::text, time, total, deposit, receipt_name, receipt_data_url, status FROM appointments ORDER BY created_at DESC`
      return Response.json({
        appointments: rows.filter((row) => row.status !== 'archived').map(toAppointment),
        archivedAppointments: rows.filter((row) => row.status === 'archived').map(toAppointment),
      })
    }

    if (request.method === 'POST') {
      const body = await request.json() as Partial<AppointmentBody>
      if (!body.id || !body.name || !body.phone || !body.email || !body.date || !body.time || !body.services?.length || !body.receiptName) {
        return Response.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
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
          return Response.json({ error: 'Ese horario ya está reservado' }, { status: 409 })
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
      return Response.json(appointment, { status: 201 })
    }

    if (request.method === 'PATCH') {
      if (!isAdminRequest(request)) return Response.json({ error: 'No autorizado' }, { status: 401 })
      const body = await request.json() as { id?: string; status?: string }
      if (!body.id || !['pending', 'archived'].includes(body.status ?? '')) return Response.json({ error: 'Solicitud inválida' }, { status: 400 })
      await sql`UPDATE appointments SET status = ${body.status} WHERE id = ${body.id}`
      return Response.json({ updated: true })
    }

    return new Response('Method not allowed', { status: 405 })
  } catch (error) {
    console.error('Appointments API error', error)
    return Response.json({ error: 'No se pudo procesar la solicitud' }, { status: 500 })
  }
}
