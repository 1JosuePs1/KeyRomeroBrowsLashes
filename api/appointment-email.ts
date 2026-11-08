import { categories, formatColones, formatDuration, weeklySchedule } from '../src/config/business'

type AppointmentEmailData = {
  name: string
  email: string
  services: string[]
  date: string
  time: string
  total: number
  deposit: number
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

function getDuration(services: string[]) {
  const allServices = categories.flatMap((category) => category.services)
  return services.reduce((total, serviceName) => total + (allServices.find((service) => service.name === serviceName)?.durationMin ?? 0), 0)
}

function getBusinessHours(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay()
  if (day === 0) return weeklySchedule.sunday
  if (day === 6) return `Sábado · ${weeklySchedule.saturday}`
  if (day === 2 || day === 4) return weeklySchedule.weekdaysMorning
  return weeklySchedule.weekdays
}

export function renderAppointmentEmail(data: AppointmentEmailData, isAdmin: boolean) {
  const safeName = escapeHtml(data.name)
  const safeServices = data.services.map(escapeHtml).join(', ')
  const dateLabel = new Date(`${data.date}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const duration = getDuration(data.services)
  const intro = isAdmin
    ? 'Se recibió una nueva solicitud de cita desde el sitio web.'
    : 'Guardamos tu solicitud y Keylin la revisará para confirmar tu espacio por WhatsApp.'
  const title = isAdmin ? 'Nueva solicitud de cita' : '¡Cita reservada!'

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f7f1e9;color:#2b1d16;font-family:Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="text-align:center;padding:18px 0 28px;">
        <div style="color:#b78952;font-family:Georgia,serif;font-size:34px;">KR</div>
        <div style="color:#b07e47;font-size:11px;letter-spacing:4px;text-transform:uppercase;">KEYLIN ROMERO</div>
        <div style="color:#806d5d;font-size:12px;margin-top:6px;">Brows &amp; Lashes Studio</div>
      </div>
      <div style="background:#fffaf4;border:1px solid #eadbca;border-radius:24px;padding:34px 26px;text-align:center;">
        <div style="display:inline-block;background:#f1dfc5;border-radius:50%;color:#b07e47;font-size:28px;line-height:64px;width:64px;">✦</div>
        <div style="color:#b07e47;font-size:11px;letter-spacing:4px;margin-top:20px;text-transform:uppercase;">${isAdmin ? 'Administración' : 'Solicitud recibida'}</div>
        <h1 style="font-family:Georgia,serif;font-size:38px;font-weight:400;line-height:1.05;margin:16px 0;">${title}</h1>
        <p style="color:#806d5d;font-size:15px;line-height:1.6;margin:0;">${isAdmin ? `La cliente <b>${safeName}</b> solicitó una cita.` : `Felicidades, ${safeName}. ${intro}`}</p>
        <div style="background:#2b1d16;border-radius:18px;color:#fffaf4;margin:28px 0 0;padding:24px;text-align:left;">
          <div style="color:#e5c28e;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Tu cita</div>
          <div style="font-family:Georgia,serif;font-size:25px;margin-top:10px;text-transform:capitalize;">${escapeHtml(dateLabel)}</div>
          <div style="color:#e5c28e;font-family:Georgia,serif;font-size:23px;margin:10px 0 20px;">${escapeHtml(data.time)}</div>
          <div style="border-top:1px solid #ffffff22;padding-top:8px;">
            <p style="border-bottom:1px solid #ffffff12;margin:0;padding:11px 0;"><span style="color:#d1bca6;">Servicios</span><br><b>${safeServices}</b></p>
            <p style="border-bottom:1px solid #ffffff12;margin:0;padding:11px 0;"><span style="color:#d1bca6;">Duración</span><br><b>${formatDuration(duration)}</b></p>
            <p style="border-bottom:1px solid #ffffff12;margin:0;padding:11px 0;"><span style="color:#d1bca6;">Total</span><br><b>${formatColones(data.total)}</b></p>
            <p style="border-bottom:1px solid #ffffff12;margin:0;padding:11px 0;"><span style="color:#d1bca6;">Adelanto</span><br><b>${formatColones(data.deposit)}</b></p>
            <p style="margin:0;padding:11px 0;"><span style="color:#d1bca6;">Horario del estudio</span><br><b>${escapeHtml(getBusinessHours(data.date))}</b></p>
          </div>
        </div>
        <p style="color:#806d5d;font-size:13px;line-height:1.6;margin:22px 0 0;">${intro}</p>
      </div>
      <p style="color:#9a8069;font-size:12px;line-height:1.5;text-align:center;">Cartago centro · Keylin Romero Brows &amp; Lashes Studio</p>
    </div>
  </body>
</html>`
}
