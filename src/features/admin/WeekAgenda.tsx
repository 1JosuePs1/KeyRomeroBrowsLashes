import { useEffect, useMemo, useRef, useState } from 'react'
import { categories, weeklySchedule, type CategoryId } from '../../config/business'
import { dateKey, getScheduleForDate, type DayOverride } from '../../config/availability'
import type { Appointment } from '../../config/appointments'
import './Agenda.css'

const allServices = categories.flatMap((category) => category.services)
const HOUR_HEIGHT = 56
const SNAP_MIN = 30
const dayNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function parseTimeMinutes(value: string) {
  const direct = /^(\d{1,2}):([0-5]\d)$/.exec(value)
  if (direct) return Number(direct[1]) * 60 + Number(direct[2])
  const label = /^(\d{1,2}):([0-5]\d)\s*([ap])\.?\s*m\.?$/i.exec(value.trim())
  if (!label) return null
  let hour = Number(label[1])
  const isPm = label[3].toLowerCase() === 'p'
  if (isPm && hour < 12) hour += 12
  if (!isPm && hour === 12) hour = 0
  return hour * 60 + Number(label[2])
}

function appointmentDuration(appointment: Appointment) {
  const total = appointment.services.reduce((sum, name) => sum + (allServices.find((service) => service.name === name)?.durationMin ?? 0), 0)
  return total || weeklySchedule.appointmentIntervalMin
}

function categoryOf(appointment: Appointment): CategoryId {
  const name = appointment.services[0]
  return categories.find((category) => category.services.some((service) => service.name === name))?.id ?? 'pestanas'
}

function startOfWeek(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

function formatHour(minutes: number) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${minute.toString().padStart(2, '0')} ${hour >= 12 ? 'p. m.' : 'a. m.'}`
}

const toTimeValue = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))

type Block = { appointment: Appointment; start: number; end: number; lane: number; lanes: number }

function layoutDay(items: Appointment[]) {
  const blocks = items
    .map((appointment) => ({ appointment, start: parseTimeMinutes(appointment.time) ?? -1, end: 0, lane: 0, lanes: 1 }))
    .filter((block) => block.start >= 0)
    .map((block) => ({ ...block, end: block.start + appointmentDuration(block.appointment) }))
    .sort((a, b) => a.start - b.start)
  let cluster: Block[] = []
  let clusterEnd = 0
  const closeCluster = () => {
    const lanes = cluster.reduce((max, block) => Math.max(max, block.lane + 1), 1)
    cluster.forEach((block) => { block.lanes = lanes })
    cluster = []
  }
  blocks.forEach((block) => {
    if (cluster.length && block.start >= clusterEnd) closeCluster()
    const used = new Set(cluster.filter((other) => other.end > block.start).map((other) => other.lane))
    while (used.has(block.lane)) block.lane += 1
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.end)
  })
  closeCluster()
  return blocks
}

function printDay(title: string, blocks: Block[]) {
  const printWindow = window.open('', '_blank', 'width=820,height=900')
  if (!printWindow) return
  const rows = blocks.map((block) => `<tr><td>${escapeHtml(formatHour(block.start))} – ${escapeHtml(formatHour(block.end))}</td><td><b>${escapeHtml(block.appointment.name)}</b><br>${escapeHtml(block.appointment.phone)}</td><td>${escapeHtml(block.appointment.services.join(', '))}</td></tr>`).join('')
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Agenda</title><style>body{color:#241812;font-family:Georgia,serif;padding:32px}h1{font-weight:400;margin:0 0 4px;text-transform:capitalize}p{color:#7d6b5c;margin:0 0 24px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #eadfce;font-family:system-ui,sans-serif;font-size:14px;padding:12px 8px;vertical-align:top}</style></head><body><h1>${escapeHtml(title)}</h1><p>Keylin Romero Brows &amp; Lashes · ${blocks.length} ${blocks.length === 1 ? 'cita' : 'citas'}</p><table>${rows || '<tr><td>No hay citas este día.</td></tr>'}</table></body></html>`)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
}

type Props = {
  appointments: Appointment[]
  overrides: DayOverride[]
  onSelect: (appointment: Appointment) => void
  onCreate: (date: string, time: string) => void
  onMove: (appointment: Appointment, date: string, time: string) => void
  whatsappUrl: (appointment: Appointment) => string
}

type Hover = { key: string; minutes: number }

export default function WeekAgenda({ appointments, overrides, onSelect, onCreate, onMove, whatsappUrl }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [filter, setFilter] = useState<'all' | CategoryId>('all')
  const [showArchived, setShowArchived] = useState(true)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<Hover | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const todayKey = dateKey(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + index)
    return day
  }), [weekStart])

  const visible = useMemo(() => appointments.filter((item) =>
    (showArchived || item.status !== 'archived') && (filter === 'all' || categoryOf(item) === filter)), [appointments, showArchived, filter])
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    visible.forEach((item) => map.set(item.date, [...(map.get(item.date) ?? []), item]))
    return map
  }, [visible])
  const allByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    appointments.forEach((item) => map.set(item.date, [...(map.get(item.date) ?? []), item]))
    return map
  }, [appointments])

  const weekBlocks = days.map((day) => layoutDay(byDay.get(dateKey(day)) ?? []))
  const allBlocks = weekBlocks.flat()
  const firstHour = Math.min(7, ...allBlocks.map((block) => Math.floor(block.start / 60)))
  const lastHour = Math.max(19, ...allBlocks.map((block) => Math.ceil(block.end / 60)))
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index)
  const gridHeight = hours.length * HOUR_HEIGHT
  const yOf = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_HEIGHT

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const today = new Date()
    const isThisWeek = dateKey(startOfWeek(today)) === dateKey(weekStart)
    const minutes = isThisWeek ? today.getHours() * 60 + today.getMinutes() : firstHour * 60
    element.scrollTop = Math.max(0, ((minutes - firstHour * 60 - 60) / 60) * HOUR_HEIGHT)
  }, [weekStart, firstHour])

  const activeToday = layoutDay((allByDay.get(todayKey) ?? []).filter((item) => item.status !== 'archived'))
  const live = activeToday.find((block) => block.start <= nowMinutes && nowMinutes < block.end)
  const upcoming = appointments
    .filter((item) => item.status !== 'archived')
    .map((item) => ({ item, at: new Date(`${item.date}T00:00:00`).getTime() + (parseTimeMinutes(item.time) ?? 0) * 60000 }))
    .filter((entry) => entry.at > now.getTime())
    .sort((a, b) => a.at - b.at)[0]?.item
  const nextId = live ? null : upcoming?.id
  const nextLabel = upcoming
    ? `${upcoming.date === todayKey ? 'Hoy' : new Date(`${upcoming.date}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatHour(parseTimeMinutes(upcoming.time) ?? 0)}`
    : ''

  const weekCount = weekBlocks.reduce((sum, blocks) => sum + blocks.filter((block) => block.appointment.status !== 'archived').length, 0)
  const todayCount = activeToday.length
  const rangeLabel = `${days[0].toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}`
  const goTo = (date: Date) => { setWeekStart(startOfWeek(date)); setSelectedDay(dateKey(date)) }
  const shift = (direction: number) => {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + direction * 7)
    goTo(next)
  }
  const selectedDate = new Date(`${selectedDay}T12:00:00`)
  const selectedItems = layoutDay(byDay.get(selectedDay) ?? [])
  const selectedClosed = !getScheduleForDate(selectedDate, overrides)
  const selectedTitle = selectedDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const slotFrom = (event: { clientY: number; currentTarget: HTMLElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const raw = firstHour * 60 + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60
    return Math.min(lastHour * 60 - SNAP_MIN, Math.max(firstHour * 60, Math.floor(raw / SNAP_MIN) * SNAP_MIN))
  }

  const results = query.trim()
    ? appointments.filter((item) => `${item.name} ${item.phone} ${item.services.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
    : []
  const jumpTo = (item: Appointment) => {
    goTo(new Date(`${item.date}T12:00:00`))
    setFlashId(item.id)
    setQuery('')
    window.setTimeout(() => setFlashId(null), 3500)
  }

  const filters: Array<{ id: 'all' | CategoryId; label: string }> = [{ id: 'all', label: 'Todas' }, ...categories.map((category) => ({ id: category.id, label: category.name }))]

  return <div className="agenda">
    <div className="agenda-toolbar">
      <div className="agenda-title"><p className="admin-eyebrow">Mi agenda</p><h2>{rangeLabel}</h2></div>
      <div className="agenda-controls">
        <label className="agenda-jump" aria-label="Ir a una fecha"><input type="date" value={selectedDay} onChange={(event) => { if (event.target.value) goTo(new Date(`${event.target.value}T12:00:00`)) }} /></label>
        <div className="agenda-nav">
          <button type="button" onClick={() => shift(-1)} aria-label="Semana anterior">‹</button>
          <button type="button" className="agenda-today" onClick={() => goTo(new Date())}>Hoy</button>
          <button type="button" onClick={() => shift(1)} aria-label="Semana siguiente">›</button>
        </div>
        <button type="button" className="agenda-new" onClick={() => onCreate(selectedDay, '09:00')}>+ Nueva cita</button>
      </div>
    </div>

    <div className="agenda-stats">
      <p><b>{todayCount}</b><span>{todayCount === 1 ? 'cita hoy' : 'citas hoy'}</span></p>
      <p><b>{weekCount}</b><span>{weekCount === 1 ? 'cita esta semana' : 'citas esta semana'}</span></p>
      <button type="button" className={`agenda-next${live ? ' live' : ''}`} disabled={!live && !upcoming} onClick={() => { const target = live?.appointment ?? upcoming; if (target) onSelect(target) }}>
        <small>{live ? '● En curso ahora' : 'Próxima cita'}</small>
        <b>{live ? live.appointment.name : upcoming ? upcoming.name : 'Sin citas próximas'}</b>
        {(live || upcoming) && <span>{live ? `Hasta ${formatHour(live.end)}` : nextLabel}</span>}
      </button>
    </div>

    <div className="agenda-filters">
      <div className="agenda-chips" role="group" aria-label="Filtrar por servicio">
        {filters.map((item) => <button type="button" key={item.id} className={`${filter === item.id ? 'active ' : ''}${item.id}`} onClick={() => setFilter(item.id)}>{item.id !== 'all' && <i />}{item.label}</button>)}
        <button type="button" className={`archived-toggle${showArchived ? ' active' : ''}`} onClick={() => setShowArchived((value) => !value)}>{showArchived ? 'Archivadas visibles' : 'Archivadas ocultas'}</button>
      </div>
      <div className="agenda-search">
        <input placeholder="Buscar clienta" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar clienta en la agenda" />
        {query.trim() && <div className="agenda-results">
          {results.length ? results.map((item) => <button type="button" key={item.id} onClick={() => jumpTo(item)}><b>{item.name}</b><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {item.time}</span></button>) : <p>Sin resultados</p>}
        </div>}
      </div>
    </div>

    <div className="agenda-scroll" ref={scrollRef}>
      <div className="agenda-grid" style={{ gridTemplateColumns: 'var(--agenda-hours-width) repeat(7, minmax(130px, 1fr))', minWidth: 960 }}>
        <div className="agenda-corner" />
        {days.map((day, index) => {
          const key = dateKey(day)
          const count = (byDay.get(key) ?? []).filter((item) => item.status !== 'archived').length
          return <button type="button" key={key} className={`agenda-day-head${key === todayKey ? ' today' : ''}${key === selectedDay ? ' selected' : ''}`} onClick={() => setSelectedDay(key)}>
            <span>{dayNames[index]}</span><b>{day.getDate()}</b><small>{count > 0 ? `${count} ${count === 1 ? 'cita' : 'citas'}` : '\u00a0'}</small>
          </button>
        })}
        <div className="agenda-hours" style={{ height: gridHeight }}>
          {hours.map((hour) => <span key={hour} style={{ height: HOUR_HEIGHT }}>{formatHour(hour * 60)}</span>)}
        </div>
        {days.map((day, index) => {
          const key = dateKey(day)
          const schedule = getScheduleForDate(day, overrides)
          const bookedStarts = new Set((allByDay.get(key) ?? []).map((item) => parseTimeMinutes(item.time)))
          const override = overrides.find((item) => item.date === key)
          const closedSlots = (override?.blockedTimes ?? [])
            .map((time) => ({ time, minutes: parseTimeMinutes(time) }))
            .filter((slot): slot is { time: string; minutes: number } => slot.minutes !== null && !bookedStarts.has(slot.minutes) && slot.minutes >= firstHour * 60 && slot.minutes < lastHour * 60)
          const showNow = key === todayKey && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60
          const ghost = hover?.key === key ? hover.minutes : null
          return <div
            key={key}
            className={`agenda-column${key === todayKey ? ' today' : ''}${dragId ? ' dragging' : ''}`}
            style={{ height: gridHeight, backgroundSize: `100% ${HOUR_HEIGHT}px` }}
            onMouseMove={(event) => setHover(event.target === event.currentTarget ? { key, minutes: slotFrom(event) } : null)}
            onMouseLeave={() => setHover(null)}
            onClick={(event) => { if (event.target !== event.currentTarget) return; setSelectedDay(key); onCreate(key, toTimeValue(slotFrom(event))) }}
            onDragOver={(event) => { if (!dragId) return; event.preventDefault(); setHover({ key, minutes: slotFrom(event) }) }}
            onDrop={(event) => {
              event.preventDefault()
              const item = appointments.find((entry) => entry.id === dragId)
              const minutes = slotFrom(event)
              setDragId(null)
              setHover(null)
              if (item && !(item.date === key && parseTimeMinutes(item.time) === minutes)) onMove(item, key, toTimeValue(minutes))
            }}
          >
            {!schedule && <div className="agenda-closed full"><span>Cerrado</span></div>}
            {schedule && <>
              {schedule.start > firstHour * 60 && <div className="agenda-closed" style={{ top: 0, height: yOf(schedule.start) }} />}
              {schedule.end < lastHour * 60 && <div className="agenda-closed" style={{ top: yOf(schedule.end), height: gridHeight - yOf(schedule.end) }} />}
            </>}
            {closedSlots.map((slot) => <div key={slot.time} className="agenda-closed slot" style={{ top: yOf(slot.minutes), height: Math.max(24, (((override?.slotDurations?.[slot.time]) ?? weeklySchedule.appointmentIntervalMin) / 60) * HOUR_HEIGHT - 2) }}><span>Hora cerrada</span></div>)}
            {showNow && <div className="agenda-now" style={{ top: yOf(nowMinutes) }} />}
            {ghost !== null && <div className={`agenda-ghost${dragId ? ' moving' : ''}`} style={{ top: yOf(ghost), height: HOUR_HEIGHT / 2 }}><span>{dragId ? 'Mover a' : '+ Agendar'} {formatHour(ghost)}</span></div>}
            {weekBlocks[index].map((block) => {
              const archived = block.appointment.status === 'archived'
              const isLive = live?.appointment.id === block.appointment.id
              return <button
                type="button"
                key={block.appointment.id}
                draggable={!archived}
                className={`agenda-event ${categoryOf(block.appointment)}${archived ? ' archived' : ' pending'}${isLive ? ' live' : ''}${nextId === block.appointment.id ? ' next' : ''}${flashId === block.appointment.id ? ' flash' : ''}${dragId === block.appointment.id ? ' lifted' : ''}`}
                style={{
                  top: yOf(block.start),
                  height: Math.max(30, ((block.end - block.start) / 60) * HOUR_HEIGHT - 3),
                  left: `calc(${(block.lane / block.lanes) * 100}% + 3px)`,
                  width: `calc(${100 / block.lanes}% - 6px)`,
                }}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', block.appointment.id); setDragId(block.appointment.id) }}
                onDragEnd={() => { setDragId(null); setHover(null) }}
                onClick={(event) => { event.stopPropagation(); setSelectedDay(key); onSelect(block.appointment) }}
              >
                {(isLive || nextId === block.appointment.id) && <em>{isLive ? 'En curso' : 'Próxima'}</em>}
                <b>{block.appointment.name}</b>
                <span>{formatHour(block.start)} – {formatHour(block.end)}</span>
                <small>{block.appointment.services.join(', ')}</small>
              </button>
            })}
          </div>
        })}
      </div>
    </div>
    <p className="agenda-hint">Haz clic en un espacio vacío para agendar una cita · Arrastra una cita pendiente para moverla de hora o de día</p>

    <div className="agenda-day-list">
      <div className="agenda-day-head-row">
        <div><p className="admin-eyebrow">Citas del día</p><h3>{selectedTitle}</h3></div>
        <button type="button" className="agenda-print" onClick={() => printDay(selectedTitle, selectedItems)}>Imprimir día</button>
      </div>
      {selectedClosed && <p className="agenda-closed-note">Este día está cerrado para nuevas reservas.</p>}
      {selectedItems.length ? selectedItems.map((block) => <div key={block.appointment.id} className={`agenda-day-item ${categoryOf(block.appointment)}${block.appointment.status === 'archived' ? ' archived' : ''}`}>
        <button type="button" className="agenda-day-main" onClick={() => onSelect(block.appointment)}>
          <b>{formatHour(block.start)} – {formatHour(block.end)}</b>
          <span>{block.appointment.name}{block.appointment.status === 'archived' && <em>Archivada</em>}</span>
          <small>{block.appointment.services.join(', ')}</small>
        </button>
        <div className="agenda-day-actions">
          <a href={whatsappUrl(block.appointment)} target="_blank" rel="noreferrer">WhatsApp</a>
          <a href={`tel:${block.appointment.phone}`}>Llamar</a>
        </div>
      </div>) : <p className="admin-muted">No hay citas este día.</p>}
    </div>
  </div>
}
