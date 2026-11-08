import { useEffect, useState } from 'react'
import { formatTimeLabel, getScheduleForDate, type DayOverride } from '../../config/availability'
import type { Appointment } from '../../config/appointments'
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
  error: 'admin-error',
  appointmentHeader: 'admin-appointment-header',
  search: 'admin-search',
  tabs: 'admin-tabs',
  activeTab: 'admin-active-tab',
  metrics: 'admin-metrics',
  analyticsGrid: 'admin-analytics-grid',
  serviceMetrics: 'admin-service-metrics',
  operationalList: 'admin-operational-list',
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [start, setStart] = useState('07:00')
  const [end, setEnd] = useState('18:00')
  const [enabled, setEnabled] = useState(true)
  const [blockedTime, setBlockedTime] = useState('12:30')
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [archivedAppointments, setArchivedAppointments] = useState<Appointment[]>([])
  const [appointmentTab, setAppointmentTab] = useState<'pending' | 'archived'>('pending')
  const [search, setSearch] = useState('')
  const selectedSchedule = selectedDate
    ? getScheduleForDate(new Date(`${selectedDate}T12:00:00`), overrides)
    : null
  const selectableTimes = selectedSchedule
    ? Array.from(
        { length: Math.ceil((selectedSchedule.end - selectedSchedule.start) / weeklySchedule.appointmentIntervalMin) },
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

  useEffect(() => {
    if (!authenticated) return
    fetch('/api/appointments')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las citas')
        return await response.json() as { appointments: Appointment[]; archivedAppointments: Appointment[] }
      })
      .then((data) => {
        setAppointments(data.appointments)
        setArchivedAppointments(data.archivedAppointments)
      })
      .catch(() => undefined)
    fetch('/api/availability')
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la disponibilidad')
        return await response.json() as DayOverride[]
      })
      .then(setOverrides)
      .catch(() => undefined)
  }, [authenticated])

  const login = async () => {
    setLoginBusy(true)
    setLoginError('')
    try {
      const response = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (response.ok) setAuthenticated(true)
      else setLoginError(response.status === 401 ? 'La contraseña no es correcta.' : 'No se pudo validar el acceso.')
    } catch {
      setLoginError('No se pudo conectar con el servidor.')
    }
    setLoginBusy(false)
  }

  if (!authenticated) {
    return <main className={styles.page}><section className={styles.login}><span className={styles.logo}>KR</span><p className={styles.eyebrow}>Acceso privado</p><h1>Panel de Keylin</h1><p className={styles.muted}>Ingresa para administrar disponibilidad y solicitudes.</p><input type="password" placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void login() }} /><button disabled={loginBusy || !password} onClick={() => void login()}>{loginBusy ? 'Verificando…' : 'Entrar'}</button>{loginError && <p className={styles.error}>{loginError}</p>}<small>Acceso protegido</small></section></main>
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

    fetch('/api/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next[next.length - 1]) })
      .then((response) => { if (response.ok) setOverrides(next) })
      .catch(() => undefined)
  }

  const closeTime = () => {
    if (!selectedDate || !blockedTime) return
    const current = overrides.find((item) => item.date === selectedDate)
    const next = overrides.filter((item) => item.date !== selectedDate)
    const day = new Date(`${selectedDate}T12:00:00`)
    const schedule = current?.enabled ? { start: current.start ?? 0, end: current.end ?? 0 } : getScheduleForDate(day, overrides)
    if (!schedule) return
    next.push({ ...current, date: selectedDate, enabled: current?.enabled ?? true, blockedTimes: [...new Set([...(current?.blockedTimes ?? []), blockedTime])] })
    fetch('/api/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next[next.length - 1]) })
      .then((response) => { if (response.ok) setOverrides(next) })
      .catch(() => undefined)
  }

  const reopenTime = (date: string, time: string) => {
    const next = overrides.map((item) => item.date === date ? { ...item, blockedTimes: item.blockedTimes?.filter((itemTime) => itemTime !== time) } : item)
    const updated = next.find((item) => item.date === date)
    if (!updated) return
    fetch('/api/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      .then((response) => { if (response.ok) setOverrides(next) })
      .catch(() => undefined)
  }

  const archiveAppointment = (id: string) => {
    const appointment = appointments.find((item) => item.id === id)
    if (!appointment) return
    fetch('/api/appointments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'archived' }) })
      .then((response) => {
        if (!response.ok) return
        setAppointments(appointments.filter((item) => item.id !== id))
        setArchivedAppointments([appointment, ...archivedAppointments])
      })
      .catch(() => undefined)
  }

  const restoreAppointment = (id: string) => {
    const appointment = archivedAppointments.find((item) => item.id === id)
    if (!appointment) return
    fetch('/api/appointments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'pending' }) })
      .then((response) => {
        if (!response.ok) return
        setArchivedAppointments(archivedAppointments.filter((item) => item.id !== id))
        setAppointments([appointment, ...appointments])
      })
      .catch(() => undefined)
  }

  const whatsappUrl = (appointment: Appointment) => {
    const message = `Hola ${appointment.name}, soy Keylin. Recibí tu solicitud para el ${new Date(`${appointment.date}T12:00:00`).toLocaleDateString('es-CR')} a las ${appointment.time}. Servicio: ${appointment.services.join(', ')}. Total: ${formatColones(appointment.total)}. Adelanto: ${formatColones(appointment.deposit)}. Te confirmo por este medio.`
    return `https://wa.me/${appointment.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
  }
  const sourceAppointments = appointmentTab === 'pending' ? appointments : archivedAppointments
  const visibleAppointments = sourceAppointments.filter((appointment) => `${appointment.name} ${appointment.phone} ${appointment.date} ${appointment.services.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  const metricAppointments = [...appointments, ...archivedAppointments]
  const totalSales = metricAppointments.reduce((sum, appointment) => sum + appointment.total, 0)
  const totalDeposits = metricAppointments.reduce((sum, appointment) => sum + appointment.deposit, 0)
  const averageTicket = metricAppointments.length ? Math.round(totalSales / metricAppointments.length) : 0
  const serviceCounts = metricAppointments.flatMap((appointment) => appointment.services).reduce<Record<string, number>>((counts, service) => {
    counts[service] = (counts[service] ?? 0) + 1
    return counts
  }, {})
  const topServices = Object.entries(serviceCounts).sort(([, countA], [, countB]) => countB - countA).slice(0, 5)

  return <main className={styles.page}><header><a href="/">← Volver al sitio</a><span>KR · Panel admin</span><button onClick={() => setAuthenticated(false)}>Salir</button></header><section><p className={styles.eyebrow}>Administración</p><h1>Control de citas</h1><p className={styles.muted}>Administra horarios, solicitudes y comprobantes desde un solo lugar.</p><div className={styles.metrics}><article><span>Ventas registradas</span><strong>{formatColones(totalSales)}</strong><small>{metricAppointments.length} citas</small></article><article><span>Adelantos recibidos</span><strong>{formatColones(totalDeposits)}</strong><small>Según solicitudes</small></article><article><span>Ticket promedio</span><strong>{formatColones(averageTicket)}</strong><small>Por cita</small></article><article><span>Pendientes</span><strong>{appointments.length}</strong><small>Por confirmar</small></article></div><div className={styles.analyticsGrid}><div className={styles.card}><h2>Servicios más solicitados</h2>{topServices.length ? <div className={styles.serviceMetrics}>{topServices.map(([service, count]) => <div key={service}><span>{service}</span><b>{count} {count === 1 ? 'cita' : 'citas'}</b><i><em style={{ width: `${(count / (topServices[0]?.[1] ?? 1)) * 100}%` }} /></i></div>)}</div> : <p className={styles.muted}>Aún no hay datos para mostrar.</p>}</div><div className={styles.card}><h2>Resumen operativo</h2><div className={styles.operationalList}><p><span>Solicitudes activas</span><b>{appointments.length}</b></p><p><span>Solicitudes archivadas</span><b>{archivedAppointments.length}</b></p><p><span>Horarios especiales</span><b>{overrides.length}</b></p><p><span>Horas cerradas</span><b>{overrides.reduce((sum, item) => sum + (item.blockedTimes?.length ?? 0), 0)}</b></p></div></div></div><div className={styles.grid}><div className={styles.card}><h2>Horario especial por fecha</h2><label>Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><label className={styles.switch}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Habilitar citas este día</label>{enabled && <div className={styles.timeRow}><label>Desde<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Hasta<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>}<button onClick={saveException}>Guardar cambio</button><p className={styles.muted}>Al guardar, esas horas se agregan automáticamente al selector del día.</p></div><div className={styles.card}><h2>Cerrar una hora</h2><label>Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><label>Hora que no estará disponible<select value={blockedTime} onChange={(event) => setBlockedTime(event.target.value)} disabled={!selectedDate || !selectableTimes.length}><option value="">Seleccione una hora</option>{defaultTimes.length > 0 && <optgroup label="Horario por defecto">{defaultTimes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>}{addedTimes.length > 0 && <optgroup label="Horario agregado por ella">{addedTimes.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>}</select></label><button onClick={closeTime} disabled={!selectedDate || !blockedTime}>Cerrar esta hora</button><p className={styles.muted}>Solo aparecen horas válidas del horario configurado.</p></div></div><div className={styles.card}><h2>Excepciones guardadas</h2>{overrides.length ? overrides.map((item) => <div className={styles.exception} key={item.date}><b>{item.date}</b><span>{item.enabled ? 'Horario especial' : 'Bloqueado'}{item.blockedTimes?.length ? ` · ${item.blockedTimes.join(', ')}` : ''}</span>{item.blockedTimes?.map((time) => <button key={time} onClick={() => reopenTime(item.date, time)}>Abrir {time}</button>)}</div>) : <p className={styles.muted}>Aún no hay cambios especiales.</p>}</div><div className={styles.card}><div className={styles.appointmentHeader}><div><h2>{appointmentTab === 'pending' ? 'Solicitudes pendientes' : 'Solicitudes archivadas'}</h2><p className={styles.muted}>{visibleAppointments.length} solicitud(es) visibles</p></div><input className={styles.search} placeholder="Buscar por nombre, teléfono o fecha" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className={styles.tabs}><button className={appointmentTab === 'pending' ? styles.activeTab : ''} onClick={() => setAppointmentTab('pending')}>Pendientes ({appointments.length})</button><button className={appointmentTab === 'archived' ? styles.activeTab : ''} onClick={() => setAppointmentTab('archived')}>Archivadas ({archivedAppointments.length})</button></div>{visibleAppointments.length ? visibleAppointments.map((appointment) => <article className={styles.appointment} key={appointment.id}><div><h3>{appointment.name}</h3><p>{appointment.phone} · {appointment.date} · {appointment.time}</p><p>{appointment.services.join(', ')}</p><p>Total {formatColones(appointment.total)} · Adelanto {formatColones(appointment.deposit)}</p>{appointmentTab === 'pending' && <><a className={styles.whatsapp} href={whatsappUrl(appointment)} target="_blank" rel="noreferrer">Confirmar por WhatsApp</a><button onClick={() => archiveAppointment(appointment.id)}>Archivar solicitud</button></>}{appointmentTab === 'archived' && <button onClick={() => restoreAppointment(appointment.id)}>Restaurar solicitud</button>}</div>{appointment.receiptDataUrl ? <a href={appointment.receiptDataUrl} target="_blank" rel="noreferrer"><img className={styles.receipt} src={appointment.receiptDataUrl} alt={`Comprobante de ${appointment.name}`} /></a> : <span className={styles.muted}>{appointment.receiptName || 'Sin comprobante'}</span>}</article>) : <p className={styles.muted}>{appointmentTab === 'pending' ? 'No hay solicitudes pendientes.' : 'No hay solicitudes archivadas.'}</p>}</div></section></main>
}
