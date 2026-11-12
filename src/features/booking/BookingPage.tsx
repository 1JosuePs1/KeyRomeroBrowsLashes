import { useEffect, useMemo, useRef, useState } from 'react'
import { business, categories, formatColones, formatDuration, weeklySchedule, type Service } from '../../config/business'
import { dateKey, formatTimeLabel, getBlockedTimes, getScheduleForDate, readDayOverrides } from '../../config/availability'
import type { Appointment } from '../../config/appointments'
import styles from './BookingPage.module.css'

const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
const allServices = categories.flatMap((category) => category.services)
const MAX_RECEIPT_BYTES = 3 * 1024 * 1024
const MAX_RECEIPT_DIMENSION = 720

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer el comprobante.'))
    reader.onerror = () => reject(new Error('No se pudo leer el comprobante.'))
    reader.readAsDataURL(file)
  })
}

async function prepareReceipt(file: File) {
  if (file.size > MAX_RECEIPT_BYTES) throw new Error('El comprobante debe pesar máximo 3 MB.')
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return readAsDataUrl(file)
  }
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    throw new Error('Adjunte una imagen JPG o PNG, o un archivo PDF.')
  }

  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_RECEIPT_DIMENSION / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo procesar la imagen del comprobante.')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.82, 0.68, 0.52, 0.4]) {
      const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (compressed && compressed.size <= MAX_RECEIPT_BYTES) return readAsDataUrl(compressed)
    }
    throw new Error('No se pudo comprimir la imagen a menos de 3 MB.')
  } finally {
    image.close()
  }
}

function getMonthDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const leadingDays = Array.from({ length: firstDay.getDay() }, () => null)
  const days = Array.from({ length: daysInMonth }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))
  return [...leadingDays, ...days]
}

function getAvailableTimes(date: Date, overrides: ReturnType<typeof readDayOverrides>) {
  const schedule = getScheduleForDate(date, overrides)
  if (!schedule) return []
  const blockedTimes = getBlockedTimes(date, overrides)
  const customTimes = overrides.find((item) => item.date === dateKey(date))?.availableTimes ?? []
  const appointmentInterval = weeklySchedule.appointmentIntervalMin
  const maxAppointments = date.getDay() === 6 ? weeklySchedule.saturdayMaxAppointments : weeklySchedule.maxAppointments
  const { start, end } = schedule
  const slots: string[] = []
  for (let minutes = start; minutes < end && slots.length < maxAppointments; minutes += appointmentInterval) {
    const hour = Math.floor(minutes / 60)
    const minute = minutes % 60
    const slot = formatTimeLabel(hour, minute)
    if (!blockedTimes.includes(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)) slots.push(slot)
  }
  const customLabels = customTimes
    .filter((time) => !blockedTimes.includes(time))
    .sort()
    .map((time) => formatTimeLabel(Number(time.slice(0, 2)), Number(time.slice(3))))
  return [...new Set([...slots, ...customLabels])]
}

function getHoursForDate(date: Date) {
  if (date.getDay() === 0) return weeklySchedule.sunday
  if (date.getDay() === 6) return weeklySchedule.saturday
  if (date.getDay() === 2) return weeklySchedule.weekdaysMorning
  if (date.getDay() === 4) return weeklySchedule.thursday
  return weeklySchedule.weekdays
}

export default function BookingPage() {
  const [selected, setSelected] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState(categories[0].id)
  const [date, setDate] = useState<Date | null>(null)
  const [time, setTime] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [receiptDataUrl, setReceiptDataUrl] = useState('')
  const [receiptName, setReceiptName] = useState('')
  const [receiptBusy, setReceiptBusy] = useState(false)
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [overrides, setOverrides] = useState<ReturnType<typeof readDayOverrides>>([])
  const receiptRequestId = useRef(0)
  const services = allServices.filter((service) => selected.includes(service.id))
  const visibleCategory = categories.find((category) => category.id === activeCategory) ?? categories[0]
  const total = services.reduce((sum, service) => sum + service.price, 0)
  const duration = services.reduce((sum, service) => sum + service.durationMin, 0)
  const deposit = services.reduce((max, service) => {
    const categoryDeposit = categories.find((category) => category.services.some((item) => item.id === service.id))?.deposit ?? 0
    return Math.max(max, service.deposit ?? categoryDeposit)
  }, 0)
  const today = useMemo(() => new Date(), [])
  const days = useMemo(() => getMonthDays(calendarMonth), [calendarMonth])
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear() + 1, 11, 1)
  const canGoPrevious = calendarMonth > currentMonth
  const canGoNext = calendarMonth < lastMonth
  const toggle = (service: Service) => setSelected((current) => current.includes(service.id) ? current.filter((id) => id !== service.id) : [...current, service.id])
  const handleReceiptChange = async (file: File | null) => {
    const requestId = ++receiptRequestId.current
    setReceiptName(file?.name ?? '')
    setReceiptDataUrl('')
    setSubmitError('')
    if (!file) {
      setReceiptBusy(false)
      return
    }

    setReceiptBusy(true)
    try {
      const preparedReceipt = await prepareReceipt(file)
      if (requestId === receiptRequestId.current) setReceiptDataUrl(preparedReceipt)
    } catch (error) {
      if (requestId === receiptRequestId.current) {
        setSubmitError(error instanceof Error ? error.message : 'No se pudo procesar el comprobante.')
      }
    } finally {
      if (requestId === receiptRequestId.current) setReceiptBusy(false)
    }
  }
  useEffect(() => {
    fetch('/api/availability')
      .then(async (response) => response.ok ? await response.json() as ReturnType<typeof readDayOverrides> : [])
      .then(setOverrides)
      .catch(() => undefined)
  }, [])
  const send = async () => {
    if (!name || !phone || !email || !date || !time || !services.length || !receiptDataUrl || receiptBusy) return
    const appointment: Appointment = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name,
      phone,
      email,
      services: services.map((service) => service.name),
      date: dateKey(date),
      time,
      total,
      deposit,
      receiptName,
      receiptDataUrl,
    }
    setSubmitError('')
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointment),
    })
    if (!response.ok) {
      setSubmitError(response.status === 409
        ? 'Ese horario acaba de ser reservado. Elige otra hora.'
        : response.status === 413
          ? 'El comprobante debe pesar máximo 3 MB.'
          : 'No pudimos guardar tu solicitud. Intenta de nuevo.')
      return
    }
    setConfirmedAppointment(await response.json() as Appointment)
  }
  const appointmentDate = confirmedAppointment ? new Date(`${confirmedAppointment.date}T12:00:00`) : null
  const dateLabel = appointmentDate?.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const serviceLabel = confirmedAppointment?.services.join(', ') ?? ''
  if (confirmedAppointment && appointmentDate && dateLabel) {
    return <main className={styles.page}><header className={styles.header}><a href="/" className={styles.back}>← Volver al estudio</a><span className={styles.logo}>KR</span></header><section className={`${styles.content} ${styles.confirmation}`}><p className={styles.confirmationIcon}>✦</p><p className={styles.eyebrow}>Solicitud recibida</p><h1>¡Cita reservada!</h1><p className={styles.intro}>Felicidades, {confirmedAppointment.name}. Guardamos tu solicitud y Keylin la revisará para confirmar tu espacio por WhatsApp.</p><div className={styles.confirmationCard}><p className={styles.confirmationLabel}>Tu cita</p><h2>{dateLabel}</h2><p className={styles.confirmationTime}>{confirmedAppointment.time}</p><div className={styles.confirmationDetails}><p><span>Servicios</span><b>{serviceLabel}</b></p><p><span>Duración</span><b>{formatDuration(duration)}</b></p><p><span>Total</span><b>{formatColones(confirmedAppointment.total)}</b></p><p><span>Adelanto</span><b>{formatColones(confirmedAppointment.deposit)}</b></p><p><span>Horario del estudio</span><b>{getHoursForDate(appointmentDate)}</b></p></div></div><button className={styles.newBooking} onClick={() => window.location.reload()}>Hacer otra reserva</button></section></main>
  }
  return <main className={styles.page}><header className={styles.header}><a href="/" className={styles.back}>← Volver al estudio</a><span className={styles.logo}>KR</span></header><section className={styles.content}><p className={styles.eyebrow}>Agendar una cita</p><h1>Reserve su espacio.</h1><p className={styles.intro}>Un momento para usted, con atención personalizada en cada detalle.</p>
    <div className={styles.steps}>        <section><h2><span>01</span> Elija sus servicios</h2><div className={styles.tabs}>{categories.map((category) => { const count = category.services.filter((service) => selected.includes(service.id)).length; return <button type="button" key={category.id} className={`${styles.tab} ${activeCategory === category.id ? styles.activeTab : ''}`} onClick={() => setActiveCategory(category.id)}>{category.name}{count > 0 && <small>{count}</small>}</button> })}</div><p className={styles.categoryNote}>{visibleCategory.note ?? `Servicios de ${visibleCategory.name.toLowerCase()} con atención personalizada.`}</p><div className={styles.serviceList}>{visibleCategory.services.map((service) => <label key={service.id} className={selected.includes(service.id) ? styles.selected : ''}><input type="checkbox" checked={selected.includes(service.id)} onChange={() => toggle(service)} /><span><b>{service.name}</b><small>{formatDuration(service.durationMin)} · {formatColones(service.price)} · adelanto {formatColones(service.deposit ?? visibleCategory.deposit)}</small></span></label>)}</div></section>
      <section><h2><span>02</span> Elija el día</h2><div className={styles.calendar}><div className={styles.calendarHeader}><button type="button" disabled={!canGoPrevious} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))} aria-label="Mes anterior"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4-6 6 6 6" /></svg></button><p>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</p><button type="button" disabled={!canGoNext} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))} aria-label="Mes siguiente"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" /></svg></button></div><div className={styles.weekdays}>{['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((day) => <span key={day}>{day}</span>)}</div><div className={styles.calendarDays}>{days.map((day, index) => { if (!day) return <span key={`empty-${index}`} />; const isSunday = day.getDay() === 0; const isPast = day < new Date(today.getFullYear(), today.getMonth(), today.getDate()); const availableTimes = getAvailableTimes(day, overrides); const available = !isPast && availableTimes.length > 0; const status = isSunday ? weeklySchedule.sunday : available ? `${availableTimes.length} libres` : 'Reservado'; return <button type="button" disabled={!available} key={day.toISOString()} className={date?.toDateString() === day.toDateString() ? styles.daySelected : ''} onClick={() => { setDate(day); setTime('') }}><b>{day.getDate()}</b><small>{status}</small></button> })}</div></div></section>
      <section><h2><span>03</span> Elija la hora</h2><div className={styles.times}>{(date ? getAvailableTimes(date, overrides) : []).map((slot) => <button type="button" key={slot} className={time === slot ? styles.timeSelected : ''} onClick={() => setTime(slot)}>{slot}</button>)}</div>{!date && <p className={styles.hint}>Elija un día para ver las horas disponibles.</p>}{date?.getDay() === 0 && <p className={styles.hint}>Los domingos el estudio permanece cerrado.</p>}</section>
      <section><h2><span>04</span> Sus datos</h2><input required aria-label="Su nombre obligatorio" placeholder="Su nombre *" value={name} onChange={(event) => setName(event.target.value)} /><input required type="tel" inputMode="numeric" aria-label="Teléfono obligatorio" placeholder="Teléfono (88888888) *" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} /><input required type="email" aria-label="Correo electrónico obligatorio" placeholder="Correo electrónico *" value={email} onChange={(event) => setEmail(event.target.value)} /><label className={styles.check}><input type="checkbox" /> Agendaré para otra persona</label></section>
      <section><h2><span>05</span> Resumen de su cita</h2><div className={styles.summary}>{services.length ? <>{services.map((service) => <p key={service.id}>{service.name} <b>{formatColones(service.price)}</b></p>)}<hr /><p>Duración <b>{formatDuration(duration)}</b></p><p>Total <b>{formatColones(total)}</b></p><p>Adelanto <b>{formatColones(deposit)}</b></p></> : 'Aún no ha elegido servicios.'}</div></section>
      <section><h2><span>06</span> Adelanto por SINPE Móvil</h2><div className={styles.payment}>Para asegurar su cupo, deposite <b>{formatColones(deposit || 5000)}</b> por SINPE Móvil al <b>{business.sinpe}</b> a nombre de <b>{business.sinpeName}</b>. El adelanto no es reembolsable si no asiste.</div><label className={styles.upload}><span>Adjunte su comprobante *</span><small>{receiptBusy ? 'Procesando comprobante…' : receiptName || 'JPG, PNG o PDF · máximo 3 MB; imágenes a 720 px'}</small><input required type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0] ?? null; input.value = ''; void handleReceiptChange(file) }} /></label>{submitError && <p className={styles.error}>{submitError}</p>}<p className={styles.notice}>ⓘ Su solicitud quedará guardada para que Keylin la revise y confirme por WhatsApp.</p><button className={styles.submit} disabled={!services.length || !name || !phone || !email || !date || !time || !receiptDataUrl || receiptBusy} onClick={send}>Reservar cita →</button></section>
    </div></section></main>
}
