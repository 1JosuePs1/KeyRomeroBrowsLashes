import { useEffect, useState } from 'react'
import { formatTimeLabel, getScheduleForDate, type DayOverride } from '../../config/availability'
import type { Appointment } from '../../config/appointments'
import { formatColones, weeklySchedule } from '../../config/business'
import '../../styles/admin.css'
import { normalizePhone } from '../../config/phone'
import AgendaCalendar from './AgendaCalendar'

type AdminTab = 'resumen' | 'agenda' | 'citas' | 'horarios'

const timeValue = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`

const isPdf = (dataUrl: string) => dataUrl.startsWith('data:application/pdf')

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [tab, setTab] = useState<AdminTab>('resumen')
  const [selectedDate, setSelectedDate] = useState('')
  const [start, setStart] = useState('07:00')
  const [end, setEnd] = useState('18:00')
  const [enabled, setEnabled] = useState(true)
  const [slotTime, setSlotTime] = useState('07:00')
  const [slotDuration, setSlotDuration] = useState('90')
  const [overrides, setOverrides] = useState<DayOverride[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [archivedAppointments, setArchivedAppointments] = useState<Appointment[]>([])
  const [appointmentTab, setAppointmentTab] = useState<'pending' | 'archived'>('pending')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [period, setPeriod] = useState('all')
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [detailAppointment, setDetailAppointment] = useState<Appointment | null>(null)
  const [receiptView, setReceiptView] = useState<Appointment | null>(null)

  useEffect(() => {
    if (!detailAppointment && !receiptView) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (receiptView) setReceiptView(null)
      else setDetailAppointment(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailAppointment, receiptView])

  useEffect(() => {
    if (!authenticated) return
    Promise.all([
      fetch('/api/appointments').then(async (response) => {
        if (!response.ok) throw new Error('No se pudieron cargar las citas')
        return await response.json() as { appointments: Appointment[]; archivedAppointments: Appointment[] }
      }),
      fetch('/api/availability').then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar la disponibilidad')
        return await response.json() as DayOverride[]
      }),
    ]).then(([appointmentData, availability]) => {
      setAppointments(appointmentData.appointments)
      setArchivedAppointments(appointmentData.archivedAppointments)
      setOverrides(availability)
    }).catch(() => setNotice('No se pudieron cargar todos los datos.'))
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
    } finally {
      setLoginBusy(false)
    }
  }

  const selectedOverride = overrides.find((item) => item.date === selectedDate)
  const selectedSchedule = selectedDate ? getScheduleForDate(new Date(`${selectedDate}T12:00:00`), overrides) : null
  const selectedCustomSlots = selectedOverride?.availableTimes ?? []
  const selectDate = (date: string) => {
    setSelectedDate(date)
    const override = overrides.find((item) => item.date === date)
    const regular = getScheduleForDate(new Date(`${date}T12:00:00`), [])
    setEnabled(override?.enabled ?? Boolean(regular))
    if (override?.start !== undefined) setStart(timeValue(override.start))
    else if (regular) setStart(timeValue(regular.start))
    if (override?.end !== undefined) setEnd(timeValue(override.end))
    else if (regular) setEnd(timeValue(regular.end))
  }
  const activeAppointments = [...appointments, ...archivedAppointments]
  const filteredActiveAppointments = activeAppointments.filter((item) => {
    if (period === 'all') return true
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth() - Number(period) + 1, 1)
    return new Date(`${item.date}T12:00:00`) >= monthStart
  })
  const totalSales = filteredActiveAppointments.reduce((sum, item) => sum + item.total, 0)
  const totalDeposits = filteredActiveAppointments.reduce((sum, item) => sum + item.deposit, 0)
  const averageTicket = filteredActiveAppointments.length ? Math.round(totalSales / filteredActiveAppointments.length) : 0
  const serviceCounts = filteredActiveAppointments.flatMap((item) => item.services).reduce<Record<string, number>>((counts, service) => {
    counts[service] = (counts[service] ?? 0) + 1
    return counts
  }, {})
  const topServices = Object.entries(serviceCounts).sort(([, a], [, b]) => b - a).slice(0, 5)
  const recentDays = (() => {
    const counts = new Map<string, number>()
    filteredActiveAppointments.forEach((item) => counts.set(item.date, (counts.get(item.date) ?? 0) + 1))
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7)
  })()
  const sourceAppointments = appointmentTab === 'pending' ? appointments : archivedAppointments
  const visibleAppointments = sourceAppointments.filter((item) => {
    const matchesSearch = `${item.name} ${item.phone} ${item.date} ${item.services.join(' ')}`.toLowerCase().includes(search.toLowerCase())
    if (period === 'all') return matchesSearch
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth() - Number(period) + 1, 1)
    return matchesSearch && new Date(`${item.date}T12:00:00`) >= monthStart
  })

  const saveAvailability = async (nextOverride: DayOverride) => {
    const response = await fetch('/api/availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextOverride),
    })
    if (!response.ok) throw new Error('No se pudo guardar')
    setOverrides((current) => [...current.filter((item) => item.date !== nextOverride.date), nextOverride])
    setNotice('Disponibilidad guardada.')
    window.setTimeout(() => setNotice(''), 3500)
  }

  const saveException = async () => {
    if (!selectedDate) return
    const current: DayOverride = {
      date: selectedDate,
      enabled,
      start: enabled ? Number(start.split(':')[0]) * 60 + Number(start.split(':')[1]) : selectedOverride?.start,
      end: enabled ? Number(end.split(':')[0]) * 60 + Number(end.split(':')[1]) : selectedOverride?.end,
      blockedTimes: selectedOverride?.blockedTimes ?? [],
      availableTimes: selectedCustomSlots,
      slotDurations: selectedOverride?.slotDurations ?? {},
    }
    try {
      await saveAvailability(current)
      setNotice(enabled
        ? `Cita editada: ${selectedDate}, de ${start} a ${end}.`
        : `Citas cerradas para el ${selectedDate}.`)
      window.setTimeout(() => setNotice(''), 3500)
    } catch { setNotice('No se pudo guardar el horario.') }
  }

  const addCustomSlot = async () => {
    if (!selectedDate || !slotTime) return
    const next: DayOverride = {
      date: selectedDate,
      enabled: true,
      start: selectedOverride?.start,
      end: selectedOverride?.end,
      blockedTimes: selectedOverride?.blockedTimes ?? [],
      availableTimes: [...new Set([...selectedCustomSlots, slotTime])].sort(),
      slotDurations: { ...(selectedOverride?.slotDurations ?? {}), [slotTime]: Number(slotDuration) },
    }
    try {
      await saveAvailability(next)
      setNotice(`Cita habilitada: ${selectedDate} a las ${slotTime}.`)
      window.setTimeout(() => setNotice(''), 3500)
    } catch { setNotice('No se pudo agregar la hora.') }
  }

  const removeCustomSlot = async (time: string) => {
    if (!selectedDate || !selectedOverride) return
    try {
      const slotDurations = { ...(selectedOverride.slotDurations ?? {}) }
      delete slotDurations[time]
      await saveAvailability({ ...selectedOverride, availableTimes: selectedCustomSlots.filter((item) => item !== time), slotDurations })
      setNotice(`Cita cerrada: ${selectedDate} a las ${time}.`)
      window.setTimeout(() => setNotice(''), 3500)
    } catch { setNotice('No se pudo eliminar la hora.') }
  }

  const toggleBlocked = async (time: string) => {
    if (!selectedDate) return
    const current = selectedOverride ?? { date: selectedDate, enabled: true, blockedTimes: [] }
    const blockedTimes = current.blockedTimes?.includes(time)
      ? current.blockedTimes.filter((item) => item !== time)
      : [...(current.blockedTimes ?? []), time]
    try {
      await saveAvailability({ ...current, blockedTimes })
      setNotice(`${blockedTimes.includes(time) ? 'Cita cerrada' : 'Cita habilitada'}: ${selectedDate} a las ${time}.`)
      window.setTimeout(() => setNotice(''), 3500)
    } catch { setNotice('No se pudo actualizar la hora.') }
  }

  const archiveAppointment = async (appointment: Appointment, status: 'archived' | 'pending') => {
    const response = await fetch('/api/appointments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appointment.id, status }),
    })
    if (!response.ok) return
    if (status === 'archived') {
      setAppointments((items) => items.filter((item) => item.id !== appointment.id))
      setArchivedAppointments((items) => [appointment, ...items])
    } else {
      setArchivedAppointments((items) => items.filter((item) => item.id !== appointment.id))
      setAppointments((items) => [appointment, ...items])
    }
  }

  const editAppointment = async () => {
    if (!editingAppointment || !editDate || !editTime) return
    const response = await fetch('/api/appointments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingAppointment.id, date: editDate, time: editTime }),
    })
    if (!response.ok) { setNotice(response.status === 409 ? 'Esa hora ya está ocupada.' : 'No se pudo editar la cita.'); return }
    const updated = await response.json() as Appointment
    setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item))
    setArchivedAppointments((items) => items.map((item) => item.id === updated.id ? updated : item))
    setEditingAppointment(null)
    setNotice(`Cita actualizada: ${editDate} a las ${editTime}.`)
  }

  const deleteAppointment = async (appointment: Appointment) => {
    if (!window.confirm(`¿Eliminar la cita de ${appointment.name}? Esta acción no se puede deshacer.`)) return
    const response = await fetch('/api/appointments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appointment.id }),
    })
    if (!response.ok) { setNotice('No se pudo eliminar la cita.'); return }
    setAppointments((items) => items.filter((item) => item.id !== appointment.id))
    setArchivedAppointments((items) => items.filter((item) => item.id !== appointment.id))
    setNotice(`Cita eliminada: ${appointment.date} a las ${appointment.time}.`)
  }

  const whatsappUrl = (appointment: Appointment) => {
  const phone = normalizePhone(appointment.phone) ?? appointment.phone.replace(/\D/g, '')
  const fecha = new Date(`${appointment.date}T12:00:00`).toLocaleDateString('es-CR')
  const message =
      `Hola ${appointment.name}, soy Keylin. Confirmo tu cita para el ${fecha}, a las ${appointment.time}. ` +
      `Servicio: ${appointment.services.join(', ')}. ` +
      `Total: ${formatColones(appointment.total)}. ` +
      `Adelanto: ${formatColones(appointment.deposit)}. ¡Te esperamos!`

    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
  }

  if (!authenticated) {
    return <main className="admin-page"><section className="admin-login"><span className="admin-logo">KR</span><p className="admin-eyebrow">Acceso privado</p><h1>Panel de Keylin</h1><p className="admin-muted">Ingresa para administrar disponibilidad y solicitudes.</p><input type="password" placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void login() }} /><button disabled={loginBusy || !password} onClick={() => void login()}>{loginBusy ? 'Verificando…' : 'Entrar'}</button>{loginError && <p className="admin-error">{loginError}</p>}<small>Acceso protegido</small></section></main>
  }

  return <main className="admin-page">
    <header className="admin-header"><a href="/">← Volver al sitio</a><div className="admin-brand"><span>KR</span><small>Panel admin</small></div><button onClick={() => setAuthenticated(false)}>Salir</button></header>
    <section className="admin-shell">
      <div className="admin-heading"><div><p className="admin-eyebrow">Panel de Keylin</p><h1>¿Qué deseas hacer?</h1><p className="admin-muted">Aquí puedes revisar tus citas y abrir o cerrar horarios para tus clientas.</p></div><div className="admin-date-pill">{new Intl.DateTimeFormat('es-CR', { dateStyle: 'full' }).format(new Date())}</div></div>
      <nav className="admin-nav" aria-label="Secciones del panel">{([['resumen', 'Inicio'], ['agenda', 'Mi agenda'], ['citas', `Mis citas (${appointments.length})`], ['horarios', 'Abrir o cerrar horas']] as const).map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav>
      {notice && <p className="admin-notice">{notice}</p>}

      {tab === 'resumen' && <div className="admin-dashboard">
        <div className="admin-metrics"><article><span>Ventas</span><strong>{formatColones(totalSales)}</strong><small>{activeAppointments.length} citas registradas</small></article><article><span>Adelantos</span><strong>{formatColones(totalDeposits)}</strong><small>Ingresos confirmados</small></article><article><span>Ticket promedio</span><strong>{formatColones(averageTicket)}</strong><small>Por solicitud</small></article><article><span>Pendientes</span><strong>{appointments.length}</strong><small>Por confirmar</small></article></div>
        <div className="admin-chart-grid"><div className="admin-card"><div className="card-heading"><div><p className="admin-eyebrow">Actividad</p><h2>Citas por día</h2></div><label className="chart-caption">Período<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">Todo</option><option value="1">Este mes</option><option value="3">3 meses</option><option value="12">Este año</option></select></label></div>{recentDays.length ? <div className="bar-chart">{recentDays.map(([date, count]) => <div className="bar-column" key={date}><strong style={{ height: `${Math.max(12, count * 30)}px` }}>{count}</strong><span>{new Date(`${date}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'short' })}</span></div>)}</div> : <p className="admin-muted">Aún no hay citas para mostrar.</p>}</div><div className="admin-card"><div className="card-heading"><div><p className="admin-eyebrow">Preferencias</p><h2>Servicios solicitados</h2></div></div>{topServices.length ? <div className="service-bars">{topServices.map(([service, count]) => <div key={service}><div><span>{service}</span><b>{count}</b></div><i><em style={{ width: `${(count / topServices[0][1]) * 100}%` }} /></i></div>)}</div> : <p className="admin-muted">Aún no hay datos para mostrar.</p>}</div></div>
        <div className="admin-card operational"><div className="card-heading"><div><p className="admin-eyebrow">Estado</p><h2>Resumen operativo</h2></div></div><div className="operational-grid"><p><span>Solicitudes activas</span><b>{appointments.length}</b></p><p><span>Archivadas</span><b>{archivedAppointments.length}</b></p><p><span>Días personalizados</span><b>{overrides.length}</b></p><p><span>Horas bloqueadas</span><b>{overrides.reduce((sum, item) => sum + (item.blockedTimes?.length ?? 0), 0)}</b></p></div></div>
      </div>}

      {tab === 'agenda' && <div className="admin-card"><p className="admin-eyebrow">Calendario</p><AgendaCalendar appointments={appointments} onSelect={setDetailAppointment} /></div>}

      {tab === 'horarios' && <div className="admin-schedule-layout"><div className="admin-card"><p className="admin-eyebrow">Paso 1</p><h2>Elige el día</h2><p className="admin-muted">Selecciona el día que quieres modificar. Luego decide si recibes citas y en qué horario.</p><label>Día<input type="date" value={selectedDate} onChange={(event) => selectDate(event.target.value)} /></label><label className="admin-switch"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Aceptar citas este día</label>{enabled && <div className="admin-time-row"><label>Primera hora<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label><label>Última hora<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>}<button className="admin-primary" disabled={!selectedDate} onClick={() => void saveException()}>Guardar cambios del día</button></div><div className="admin-card"><p className="admin-eyebrow">Paso 2 · Opcional</p><h2>Agregar una hora especial</h2><p className="admin-muted">Úsalo si quieres abrir una cita fuera del horario normal o con otra duración.</p><div className="admin-time-row"><label>Hora de la cita<input type="time" value={slotTime} onChange={(event) => setSlotTime(event.target.value)} /></label><label>Duración<select value={slotDuration} onChange={(event) => setSlotDuration(event.target.value)}><option value="20">20 minutos</option><option value="30">30 minutos</option><option value="60">1 hora</option><option value="90">90 minutos</option><option value="120">2 horas</option></select></label></div><button className="admin-primary" disabled={!selectedDate} onClick={() => void addCustomSlot()}>Agregar esta hora</button><div className="slot-list">{selectedCustomSlots.map((time) => <div key={time}><span>{formatTimeLabel(Number(time.slice(0, 2)), Number(time.slice(3)))} <small>{selectedOverride?.slotDurations?.[time] ?? 90} min</small></span><button onClick={() => void removeCustomSlot(time)}>Cerrar esta hora</button></div>)}{!selectedCustomSlots.length && <p className="admin-muted">Todavía no hay horas especiales.</p>}</div></div><div className="admin-card"><p className="admin-eyebrow">Paso 3 · Opcional</p><h2>Cerrar o reabrir una hora</h2><p className="admin-muted">Toca una hora para cambiar su disponibilidad. Rojo significa que está cerrada.</p><div className="slot-grid">{[...(selectedSchedule ? Array.from({ length: Math.ceil((selectedSchedule.end - selectedSchedule.start) / weeklySchedule.appointmentIntervalMin) }, (_, index) => timeValue(selectedSchedule.start + index * weeklySchedule.appointmentIntervalMin)) : []), ...selectedCustomSlots].filter((time, index, list) => list.indexOf(time) === index).map((time) => <button key={time} className={selectedOverride?.blockedTimes?.includes(time) ? 'blocked' : ''} onClick={() => void toggleBlocked(time)}>{selectedOverride?.blockedTimes?.includes(time) ? `Reabrir ${time}` : `Cerrar ${time}`}</button>)}</div>{!selectedDate && <p className="admin-muted">Primero selecciona un día arriba.</p>}</div></div>}

      {tab === 'citas' && <div className="admin-card"><div className="card-heading"><div><p className="admin-eyebrow">Agenda</p><h2>{appointmentTab === 'pending' ? 'Citas pendientes' : 'Citas archivadas'}</h2></div><div className="admin-filters"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">Todo el historial</option><option value="1">Este mes</option><option value="3">Últimos 3 meses</option><option value="12">Último año</option></select><input className="admin-search" placeholder="Buscar clienta o servicio" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div><div className="admin-tabs"><button className={appointmentTab === 'pending' ? 'active' : ''} onClick={() => setAppointmentTab('pending')}>Pendientes</button><button className={appointmentTab === 'archived' ? 'active' : ''} onClick={() => setAppointmentTab('archived')}>Archivadas</button></div>{visibleAppointments.length ? visibleAppointments.map((appointment) => <article className="admin-appointment" key={appointment.id}><div><h3>{appointment.name}</h3><p>{new Date(`${appointment.date}T12:00:00`).toLocaleDateString('es-CR')} · {appointment.time}</p><p>{appointment.services.join(', ')}</p><p>{formatColones(appointment.total)} · Adelanto {formatColones(appointment.deposit)}</p><a className="admin-whatsapp" href={whatsappUrl(appointment)} target="_blank" rel="noreferrer">Confirmar por WhatsApp</a><button className="admin-secondary" onClick={() => { setEditingAppointment(appointment); setEditDate(appointment.date); setEditTime(appointment.time) }}>Editar fecha y hora</button><button className="admin-secondary danger" onClick={() => void deleteAppointment(appointment)}>Eliminar</button><button className="admin-secondary" onClick={() => void archiveAppointment(appointment, appointmentTab === 'pending' ? 'archived' : 'pending')}>{appointmentTab === 'pending' ? 'Archivar' : 'Restaurar'}</button></div>{appointment.receiptDataUrl && (isPdf(appointment.receiptDataUrl)
        ? <button className="admin-secondary" onClick={() => setReceiptView(appointment)}>Ver comprobante (PDF)</button>
        : <img className="admin-receipt" src={appointment.receiptDataUrl} alt="Comprobante de adelanto" onClick={() => setReceiptView(appointment)} />)}</article>) : <p className="admin-muted">No hay citas que coincidan.</p>}{editingAppointment && <div className="admin-edit-box"><h3>Editar cita de {editingAppointment.name}</h3><div className="admin-time-row"><label>Fecha<input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label><label>Hora<input type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} /></label></div><button className="admin-primary" onClick={() => void editAppointment()}>Guardar nueva fecha y hora</button><button className="admin-secondary" onClick={() => setEditingAppointment(null)}>Cancelar</button></div>}</div>}
    </section>
    {detailAppointment && <div className="admin-modal-backdrop" onClick={() => setDetailAppointment(null)}><div className="admin-modal" role="dialog" aria-modal="true" aria-label="Detalle de la cita" onClick={(event) => event.stopPropagation()}>
      <button className="admin-modal-close" aria-label="Cerrar" onClick={() => setDetailAppointment(null)}>×</button>
      <p className="admin-eyebrow">Cita</p>
      <h3>{detailAppointment.name}</h3>
      <p>{new Date(`${detailAppointment.date}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {detailAppointment.time}</p>
      <p>{detailAppointment.services.join(', ')}</p>
      <p>{formatColones(detailAppointment.total)} · Adelanto {formatColones(detailAppointment.deposit)}</p>
      <p>{detailAppointment.phone} · {detailAppointment.email}</p>
      {detailAppointment.receiptDataUrl && (isPdf(detailAppointment.receiptDataUrl)
        ? <div className="admin-modal-actions"><button onClick={() => setReceiptView(detailAppointment)}>Ver comprobante (PDF)</button></div>
        : <img className="admin-modal-receipt" src={detailAppointment.receiptDataUrl} alt="Comprobante de adelanto" onClick={() => setReceiptView(detailAppointment)} />)}
      <div className="admin-modal-actions">
        <a className="admin-whatsapp" href={whatsappUrl(detailAppointment)} target="_blank" rel="noreferrer">Confirmar por WhatsApp</a>
        <button onClick={() => { setEditingAppointment(detailAppointment); setEditDate(detailAppointment.date); setEditTime(detailAppointment.time); setDetailAppointment(null); setTab('citas'); setAppointmentTab('pending') }}>Editar fecha y hora</button>
        <button onClick={() => { void archiveAppointment(detailAppointment, 'archived'); setDetailAppointment(null) }}>Archivar</button>
      </div>
    </div></div>}
    {receiptView?.receiptDataUrl && <div className="admin-modal-backdrop" onClick={() => setReceiptView(null)}><div className="admin-modal wide" role="dialog" aria-modal="true" aria-label="Comprobante" onClick={(event) => event.stopPropagation()}>
      <button className="admin-modal-close" aria-label="Cerrar" onClick={() => setReceiptView(null)}>×</button>
      <h3>Comprobante de {receiptView.name}</h3>
      {isPdf(receiptView.receiptDataUrl)
        ? <iframe src={receiptView.receiptDataUrl} title="Comprobante" />
        : <img className="admin-modal-receipt-full" src={receiptView.receiptDataUrl} alt="Comprobante de adelanto" />}
    </div></div>}
  </main>
}
