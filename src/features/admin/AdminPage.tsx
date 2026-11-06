import { useState } from 'react'
import { formatTimeLabel, getScheduleForDate, readDayOverrides, saveDayOverrides, type DayOverride } from '../../config/availability'
import { readAppointments, type Appointment } from '../../config/appointments'
import { formatColones } from '../../config/business'
import { weeklySchedule } from '../../config/business'
import '../../styles/admin.css'

const styles = {
  page: 'admin-page',
  login: 'admin-login',
  logo: 'admin-logo',
  eyebrow: 'admin-eyebrow',
  muted: 'admin-muted',
  grid: 'admin-grid',
  card: 'admin-card',
  switch: 'admin-switch',
  timeRow: 'admin-time-row',
  exception: 'admin-exception',
  row: 'admin-row',
  status: 'admin-status',
  appointment: 'admin-appointment',
  whatsapp: 'admin-whatsapp',
  receipt: 'admin-receipt',
}

const demoAppointment: Appointment = {
  id: 'demo-appointment',
  createdAt: new Date().toISOString(),
  name: 'María José Pérez',
  phone: '50688887777',
  email: 'mariajose@example.com',
  services: ['Pestañas híbridas'],
  date: '2026-11-12',
  time: '12:30 p. m.',
  total: 19000,
  deposit: 5000,
  receiptName: 'comprobante-sinpe-demo.png',
  receiptDataUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="100%" height="100%" fill="#f7efe5"/><text x="50%" y="42%" text-anchor="middle" font-family="Arial" font-size="28" fill="#6f4a2d">COMPROBANTE SINPE</text><text x="50%" y="51%" text-anchor="middle" font-family="Arial" font-size="22" fill="#9a6d3c">₡5 000</text><text x="50%" y="60%" text-anchor="middle" font-family="Arial" font-size="18" fill="#6f4a2d">Vista de ejemplo</text></svg>'),
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [start, setStart] = useState('07:00')
  const [end, setEnd] = useState('18:00')
  const [enabled, setEnabled] = useState(true)
  const [blockedTime, setBlockedTime] = useState('12:30')
  const [overrides, setOverrides] = useState<DayOverride[]>(readDayOverrides)
  const [appointments, setAppointments] = useState<Appointment[]>(readAppointments)
  const [showDemo, setShowDemo] = useState(true)
  const selectedSchedule = selectedDate
    ? getScheduleForDate(new Date(`${selectedDate}T12:00:00`), overrides)
    : null
  const selectableTimes = selectedSchedule
    ? Array.from(
        { length: Math.floor((selectedSchedule.end - selectedSchedule.start) / weeklySchedule.appointmentIntervalMin) },
        (_, index) => {
          const minutes = selectedSchedule.start + index * weeklySchedule.appointmentIntervalMin
          const hour = Math.floor(minutes / 60)
          const minute = minutes % 60
          return {
            value: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
            label: formatTimeLabel(hour, minute),
          }
        },
      )
    : []
  const selectedOverride = overrides.find((item) => item.date === selectedDate)
  const regularSchedule = selectedDate
    ? getScheduleForDate(new Date(`${selectedDate}T12:00:00`), [])
    : null
  const defaultTimes = regularSchedule
    ? selectableTimes.filter((option) => option.value >= `${Math.floor(regularSchedule.start / 60).toString().padStart(2, '0')}:${(regularSchedule.start % 60).toString().padStart(2, '0')}` && option.value <= `${Math.floor(regularSchedule.end / 60).toString().padStart(2, '0')}:${(regularSchedule.end % 60).toString().padStart(2, '0')}`)
    : []
  const addedTimes = selectedOverride?.enabled
    ? selectableTimes.filter((option) => !defaultTimes.some((defaultOption) => defaultOption.value === option.value))
    : selectableTimes

  if (!authenticated) {
    return <main className={styles.page}><section className={styles.login}><span className={styles.logo}>KR</span><p className={styles.eyebrow}>Acceso privado</p><h1>Panel de Keylin</h1><p className={styles.muted}>Ingresa para administrar disponibilidad y solicitudes.</p><input type="password" placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} /><button onClick={() => password === 'admin123' && setAuthenticated(true)}>Entrar</button><small>Demo local: admin123</small></section></main>
  }

  const saveException = () => {
    if (!selectedDate) return
    const next = overrides.filter((item) => item.date !== selectedDate)
    const current = overrides.find((item) => item.date === selectedDate)
    if (enabled) {
      const [startHour, startMinute] = start.split(':').map(Number)
      const [endHour, endMinute] = end.split(':').map(Number)
      next.push({ date: selectedDate, enabled: true, start: startHour * 60 + startMinute, end: endHour * 60 + endMinute, blockedTimes: current?.blockedTimes })
    } else {
      next.push({ date: selectedDate, enabled: false, blockedTimes: current?.blockedTimes })
    }

    saveDayOverrides(next)
    setOverrides(next)
  }

  const closeTime = () => {
    if (!selectedDate || !blockedTime) return
    const current = overrides.find((item) => item.date === selectedDate)
    const next = overrides.filter((item) => item.date !== selectedDate)
    const day = new Date(`${selectedDate}T12:00:00`)
    const schedule = current?.enabled ? { start: current.start ?? 0, end: current.end ?? 0 } : getScheduleForDate(day, overrides)
    if (!schedule) return
    next.push({ ...current, date: selectedDate, enabled: current?.enabled ?? true, blockedTimes: [...new Set([...(current?.blockedTimes ?? []), blockedTime])] })
    saveDayOverrides(next)
    setOverrides(next)
  }

  const reopenTime = (date: string, time: string) => {
    const next = overrides.map((item) => item.date === date ? { ...item, blockedTimes: item.blockedTimes?.filter((itemTime) => itemTime !== time) } : item)
    saveDayOverrides(next)
    setOverrides(next)
  }

  const removeAppointment = (id: string) => {
    if (id === demoAppointment.id) {
      setShowDemo(false)
      return
    }
    const next = appointments.filter((appointment) => appointment.id !== id)
    window.localStorage.setItem('keylin-appointments', JSON.stringify(next))
    setAppointments(next)
  }

  const whatsappUrl = (appointment: Appointment) => {
    const message = `Hola ${appointment.name}, soy Keylin. Recibí tu solicitud para el ${new Date(`${appointment.date}T12:00:00`).toLocaleDateString('es-CR')} a las ${appointment.time}. Servicio: ${appointment.services.join(', ')}. Total: ${formatColones(appointment.total)}. Adelanto: ${formatColones(appointment.deposit)}. Te confirmo por este medio.`
    return `https://wa.me/${appointment.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
  }
  const visibleAppointments = showDemo ? [demoAppointment, ...appointments] : appointments

  return <main className={styles.page}><header><a href="/">← Volver al sitio</a><span>KR · Panel admin</span><button onClick={() => setAuthenticated(false)}>Salir</button></header><section><p className={styles.eyebrow}>Administración</p><h1>Control de citas</h1><p className={styles.muted}>Los días pasados se bloquean automáticamente. Puedes abrir horarios especiales y cerrar horas puntuales.</p><div className={styles.grid}><div className={styles.card}><h2>Horario especial por fecha</h2><label>Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><label className={styles.switch}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Habilitar citas este día</label>{enabled && <div className={styles.timeRow}><label>Desde<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Hasta<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>}<button onClick={saveException}>Guardar cambio</button><p className={styles.muted}>Al guardar, esas horas se agregan automáticamente al selector del día.</p></div><div className={styles.card}><h2>Cerrar una hora</h2><label>Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><label>Hora que no estará disponible<select value={blockedTime} onChange={(event) => setBlockedTime(event.target.value)} disabled={!selectedDate || !selectableTimes.length}><option value="">Seleccione una hora</option>{defaultTimes.length > 0 && <optgroup label="Horario por defecto">{defaultTimes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>}{addedTimes.length > 0 && <optgroup label="Horario agregado por ella">{addedTimes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>}</select></label><button onClick={closeTime} disabled={!selectedDate || !blockedTime}>Cerrar esta hora</button><p className={styles.muted}>Solo aparecen horas válidas del horario configurado.</p></div></div><div className={styles.card}><h2>Excepciones guardadas</h2>{overrides.length ? overrides.map((item) => <div className={styles.exception} key={item.date}><b>{item.date}</b><span>{item.enabled ? 'Horario especial' : 'Bloqueado'}{item.blockedTimes?.length ? ` · ${item.blockedTimes.join(', ')}` : ''}</span>{item.blockedTimes?.map((time) => <button key={time} onClick={() => reopenTime(item.date, time)}>Abrir {time}</button>)}</div>) : <p className={styles.muted}>Aún no hay cambios especiales.</p>}</div><div className={styles.card}><h2>Solicitudes recibidas ({visibleAppointments.length})</h2>{visibleAppointments.length ? visibleAppointments.map((appointment) => <article className={styles.appointment} key={appointment.id}><div><h3>{appointment.name} {appointment.id === demoAppointment.id && <span className={styles.status}>DEMO</span>}</h3><p>{appointment.phone} · {appointment.date} · {appointment.time}</p><p>{appointment.services.join(', ')}</p><p>Total {formatColones(appointment.total)} · Adelanto {formatColones(appointment.deposit)}</p><a className={styles.whatsapp} href={whatsappUrl(appointment)} target="_blank" rel="noreferrer">Confirmar por WhatsApp</a><button onClick={() => removeAppointment(appointment.id)}>Archivar solicitud</button></div>{appointment.receiptDataUrl ? <a href={appointment.receiptDataUrl} target="_blank" rel="noreferrer"><img className={styles.receipt} src={appointment.receiptDataUrl} alt={`Comprobante de ${appointment.name}`} /></a> : <span className={styles.muted}>{appointment.receiptName || 'Sin comprobante'}</span>}</article>) : <p className={styles.muted}>Aún no hay solicitudes recibidas.</p>}</div></section></main>
}
