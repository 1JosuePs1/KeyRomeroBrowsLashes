import { useMemo, useState } from 'react'
import { business, categories, formatColones, formatDuration, weeklySchedule, type Service } from '../../config/business'
import { formatTimeLabel, getBlockedTimes, getScheduleForDate, readDayOverrides } from '../../config/availability'
import { saveAppointment } from '../../config/appointments'
import styles from './BookingPage.module.css'

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
const allServices = categories.flatMap((category) => category.services)

function getMonthDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const leadingDays = Array.from({ length: firstDay.getDay() }, () => null)
  const days = Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))
  return [...leadingDays, ...days]
}

function getAvailableTimes(date: Date, durationMin: number) {
  const overrides = readDayOverrides()
  const schedule = getScheduleForDate(date, overrides)
  if (!schedule) return []
  const blockedTimes = getBlockedTimes(date, overrides)
  const appointmentInterval = weeklySchedule.appointmentIntervalMin
  const maxAppointments = date.getDay() === 6 ? weeklySchedule.saturdayMaxAppointments : weeklySchedule.maxAppointments
  const { start, end } = schedule
  const slots: string[] = []
  for (let minutes = start; minutes + Math.max(durationMin, appointmentInterval) <= end && slots.length < maxAppointments; minutes += appointmentInterval) {
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    const slot = formatTimeLabel(hour, minute)
    if (!blockedTimes.includes(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)) slots.push(slot)
  }
  return slots
}

export default function BookingPage() {
  const [selected, setSelected] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState(categories[0].id)
  const [date, setDate] = useState<Date | null>(null)
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptName, setReceiptName] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const services = allServices.filter((service) => selected.includes(service.id))
  const visibleCategory = categories.find((category) => category.id === activeCategory) ?? categories[0]
  const total = services.reduce((sum, service) => sum + service.price, 0)
  const duration = services.reduce((sum, service) => sum + service.durationMin, 0)
  const deposit = services.reduce((max, service) => Math.max(max, categories.find((category) => category.services.some((item) => item.id === service.id))?.deposit ?? 0), 0)
  const today = useMemo(() => new Date(), [])
  const days = useMemo(() => getMonthDays(calendarMonth), [calendarMonth])
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear() + 1, 11, 1)
  const canGoPrevious = calendarMonth > currentMonth
  const canGoNext = calendarMonth < lastMonth
  const toggle = (service: Service) => setSelected((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])
  const send = async () => {
    if (!name || !phone || !date || !time || !services.length) return
    const serviceText = services.map((service) => service.name).join(', ')
    const receiptDataUrl = receipt
      ? await new Promise<string | undefined>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
          reader.onerror = () => resolve(undefined)
          reader.readAsDataURL(receipt)
        })
      : undefined
    saveAppointment({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name,
      phone,
      services: services.map((service) => service.name),
      date: date.toISOString().slice(0, 10),
      time,
      total,
      deposit,
      receiptName,
      receiptDataUrl,
    })
    const message = `Hola Keylin, deseo solicitar una cita.%0ANombre: ${name}%0ATeléfono: ${phone}%0AServicios: ${serviceText}%0AFecha: ${date.toLocaleDateString('es-CR')}%0AHora: ${time}%0ATotal: ${formatColones(total)}%0AAdelanto: ${formatColones(deposit)}%0AComprobante: ${receiptName || 'Lo enviaré por WhatsApp'}`
    window.open(`https://wa.me/${business.whatsappNumber}?text=${message}`, '_blank', 'noopener,noreferrer')
  }
  return <main className={styles.page}><header className={styles.header}><a href="/" className={styles.back}>← Volver al estudio</a><span className={styles.logo}>KR</span></header><section className={styles.content}><p className={styles.eyebrow}>Agendar una cita</p><h1>Reserve su espacio.</h1><p className={styles.intro}>Un momento para usted, con atención personalizada en cada detalle.</p>
    <div className={styles.steps}>        <section><h2><span>01</span> Elija sus servicios</h2><div className={styles.tabs}>{categories.map((category) => { const count = category.services.filter((service) => selected.includes(service.id)).length; return <button type="button" key={category.id} className={`${styles.tab} ${activeCategory === category.id ? styles.activeTab : ''}`} onClick={() => setActiveCategory(category.id)}>{category.name}{count > 0 && <small>{count}</small>}</button> })}</div><p className={styles.categoryNote}>{visibleCategory.note ?? `Servicios de ${visibleCategory.name.toLowerCase()} con atención personalizada.`}</p><div className={styles.serviceList}>{visibleCategory.services.map((service) => <label key={service.id} className={selected.includes(service.id) ? styles.selected : ''}><input type="checkbox" checked={selected.includes(service.id)} onChange={() => toggle(service)} /><span><b>{service.name}</b><small>{formatDuration(service.durationMin)} · {formatColones(service.price)} · adelanto {formatColones(visibleCategory.deposit)}</small></span></label>)}</div></section>
      <section><h2><span>02</span> Elija el día</h2><div className={styles.calendar}><div className={styles.calendarHeader}><button type="button" disabled={!canGoPrevious} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} aria-label="Mes anterior"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4-6 6 6 6" /></svg></button><p>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</p><button type="button" disabled={!canGoNext} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} aria-label="Mes siguiente"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" /></svg></button></div><div className={styles.weekdays}>{['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((day) => <span key={day}>{day}</span>)}</div><div className={styles.calendarDays}>{days.map((day, index) => { if (!day) return <span key={`empty-${index}`} />; const isPast = day < new Date(today.getFullYear(), today.getMonth(), today.getDate()); const available = !isPast && getAvailableTimes(day, duration || 90).length > 0; return <button type="button" disabled={!available} key={day.toISOString()} className={date?.toDateString() === day.toDateString() ? styles.daySelected : ''} onClick={() => { setDate(day); setTime('') }}><b>{day.getDate()}</b><small>{available ? `${getAvailableTimes(day, duration || 90).length} libres` : 'Cerrado'}</small></button> })}</div></div></section>
      <section><h2><span>03</span> Elija la hora</h2><div className={styles.times}>{(date ? getAvailableTimes(date, duration || 90) : []).map((slot) => <button type="button" key={slot} className={time === slot ? styles.timeSelected : ''} onClick={() => setTime(slot)}>{slot}</button>)}</div>{!date && <p className={styles.hint}>Elija un día para ver las horas disponibles.</p>}{date?.getDay() === 0 && <p className={styles.hint}>Los domingos el estudio permanece cerrado.</p>}</section>
      <section><h2><span>04</span> Sus datos</h2><input placeholder="Su nombre" value={name} onChange={(event) => setName(event.target.value)} /><input placeholder="Teléfono (8888-8888)" value={phone} onChange={(event) => setPhone(event.target.value)} /><label className={styles.check}><input type="checkbox" /> Agendaré para otra persona</label></section>
      <section><h2><span>05</span> Resumen de su cita</h2><div className={styles.summary}>{services.length ? <>{services.map((service) => <p key={service.id}>{service.name} <b>{formatColones(service.price)}</b></p>)}<hr /><p>Duración <b>{formatDuration(duration)}</b></p><p>Total <b>{formatColones(total)}</b></p><p>Adelanto <b>{formatColones(deposit)}</b></p></> : 'Aún no ha elegido servicios.'}</div></section>
      <section><h2><span>06</span> Adelanto por SINPE Móvil</h2><div className={styles.payment}>Para asegurar su cupo, deposite <b>{formatColones(deposit || 5000)}</b> por SINPE Móvil al <b>{business.sinpe}</b> a nombre de <b>{business.sinpeName}</b>. El adelanto no es reembolsable si no asiste.</div><label className={styles.upload}><span>Adjunte su comprobante</span><small>{receiptName || 'PNG, JPG o PDF · máximo 10 MB'}</small><input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={(event) => { const file = event.target.files?.[0] ?? null; setReceipt(file); setReceiptName(file?.name ?? '') }} /></label><p className={styles.notice}>ⓘ Su solicitud quedará guardada para que Keylin la revise y confirme por WhatsApp.</p><button className={styles.submit} disabled={!services.length} onClick={send}>Enviar solicitud por WhatsApp →</button></section>
    </div></section></main>
}
