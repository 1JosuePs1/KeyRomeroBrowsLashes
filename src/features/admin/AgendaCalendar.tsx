import { useEffect, useMemo, useState } from 'react'
import { categories, weeklySchedule } from '../../config/business'
import { dateKey } from '../../config/availability'
import type { Appointment } from '../../config/appointments'
import './Agenda.css'

const allServices = categories.flatMap((category) => category.services)
const HOUR_HEIGHT = 56
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

function categoryOf(appointment: Appointment) {
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

type Props = {
  appointments: Appointment[]
  onSelect: (appointment: Appointment) => void
}

export default function AgendaCalendar({ appointments, onSelect }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()))
  const [view, setView] = useState<'week' | 'day'>(() => window.matchMedia('(max-width: 720px)').matches ? 'day' : 'week')
  const [now, setNow] = useState(() => new Date())
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
  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    appointments.forEach((appointment) => map.set(appointment.date, [...(map.get(appointment.date) ?? []), appointment]))
    return map
  }, [appointments])
  const weekBlocks = days.map((day) => layoutDay(byDay.get(dateKey(day)) ?? []))
  const allBlocks = weekBlocks.flat()
  const firstHour = Math.min(7, ...allBlocks.map((block) => Math.floor(block.start / 60)))
  const lastHour = Math.max(19, ...allBlocks.map((block) => Math.ceil(block.end / 60)))
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index)
  const gridHeight = hours.length * HOUR_HEIGHT
  const selectedItems = layoutDay(byDay.get(selectedDay) ?? [])
  const weekEnd = days[6]
  const visibleIndexes = view === 'week' ? [0, 1, 2, 3, 4, 5, 6] : [Math.max(0, days.findIndex((day) => dateKey(day) === selectedDay))]
  const weekCount = weekBlocks.reduce((sum, blocks) => sum + blocks.length, 0)
  const todayCount = byDay.get(todayKey)?.length ?? 0
  const rangeLabel = view === 'week'
    ? `${days[0].toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : new Date(`${selectedDay}T12:00:00`).toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const goTo = (date: Date) => { setWeekStart(startOfWeek(date)); setSelectedDay(dateKey(date)) }
  const shift = (direction: number) => {
    const base = view === 'week' ? new Date(weekStart) : new Date(`${selectedDay}T12:00:00`)
    base.setDate(base.getDate() + direction * (view === 'week' ? 7 : 1))
    if (view === 'week') { setWeekStart(base); setSelectedDay(dateKey(base)) } else goTo(base)
  }
  const selectedDate = new Date(`${selectedDay}T12:00:00`)

  return <div className="agenda">
    <div className="agenda-toolbar">
      <div className="agenda-title"><p className="admin-eyebrow">Mi agenda</p><h2>{rangeLabel}</h2></div>
      <div className="agenda-controls">
        <div className="agenda-switch" role="group" aria-label="Vista">
          <button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Semana</button>
          <button type="button" className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>Día</button>
        </div>
        <div className="agenda-nav">
          <button type="button" onClick={() => shift(-1)} aria-label="Anterior">‹</button>
          <button type="button" className="agenda-today" onClick={() => goTo(new Date())}>Hoy</button>
          <button type="button" onClick={() => shift(1)} aria-label="Siguiente">›</button>
        </div>
      </div>
    </div>
    <div className="agenda-stats">
      <p><b>{todayCount}</b><span>{todayCount === 1 ? 'cita hoy' : 'citas hoy'}</span></p>
      <p><b>{weekCount}</b><span>{weekCount === 1 ? 'cita esta semana' : 'citas esta semana'}</span></p>
      <p className="agenda-legend"><i className="pestanas" />Pestañas<i className="cejas" />Cejas<i className="micropigmentacion" />Micropigmentación</p>
    </div>
    <div className="agenda-scroll">
      <div className="agenda-grid" style={{ gridTemplateColumns: `64px repeat(${visibleIndexes.length}, minmax(${view === 'week' ? 130 : 200}px, 1fr))`, minWidth: view === 'week' ? 960 : 0 }}>
        <div className="agenda-corner" />
        {visibleIndexes.map((index) => {
          const day = days[index]
          const key = dateKey(day)
          const count = byDay.get(key)?.length ?? 0
          return <button type="button" key={key} className={`agenda-day-head${key === todayKey ? ' today' : ''}${key === selectedDay ? ' selected' : ''}`} onClick={() => setSelectedDay(key)}>
            <span>{dayNames[index]}</span><b>{day.getDate()}</b><small>{count > 0 ? `${count} ${count === 1 ? 'cita' : 'citas'}` : '\u00a0'}</small>
          </button>
        })}
        <div className="agenda-hours" style={{ height: gridHeight }}>
          {hours.map((hour) => <span key={hour} style={{ height: HOUR_HEIGHT }}>{formatHour(hour * 60)}</span>)}
        </div>
        {visibleIndexes.map((index) => {
          const day = days[index]
          const key = dateKey(day)
          const showNow = key === todayKey && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60
          return <div key={key} className={`agenda-column${key === todayKey ? ' today' : ''}`} style={{ height: gridHeight, backgroundSize: `100% ${HOUR_HEIGHT}px` }} onClick={() => setSelectedDay(key)}>
            {showNow && <div className="agenda-now" style={{ top: ((nowMinutes - firstHour * 60) / 60) * HOUR_HEIGHT }} />}
            {weekBlocks[index].map((block) => <button
              type="button"
              key={block.appointment.id}
              className={`agenda-event ${categoryOf(block.appointment)}`}
              style={{
                top: ((block.start - firstHour * 60) / 60) * HOUR_HEIGHT,
                height: Math.max(30, ((block.end - block.start) / 60) * HOUR_HEIGHT - 3),
                left: `calc(${(block.lane / block.lanes) * 100}% + 3px)`,
                width: `calc(${100 / block.lanes}% - 6px)`,
              }}
              onClick={(event) => { event.stopPropagation(); setSelectedDay(key); onSelect(block.appointment) }}
            >
              <b>{block.appointment.name}</b>
              <span>{formatHour(block.start)} – {formatHour(block.end)}</span>
              <small>{block.appointment.services.join(', ')}</small>
            </button>)}
          </div>
        })}
      </div>
    </div>
    <div className="agenda-day-list">
      <p className="admin-eyebrow">Citas del día</p>
      <h3>{selectedDate.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
      {selectedItems.length ? selectedItems.map((block) => <button type="button" key={block.appointment.id} className="agenda-day-item" onClick={() => onSelect(block.appointment)}>
        <b>{formatHour(block.start)} – {formatHour(block.end)}</b>
        <span>{block.appointment.name}</span>
        <small>{block.appointment.services.join(', ')}</small>
      </button>) : <p className="admin-muted">No hay citas pendientes este día.</p>}
    </div>
  </div>
}
