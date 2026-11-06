export type Appointment = {
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

const storageKey = 'keylin-appointments'

export function readAppointments(): Appointment[] {
  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) as Appointment[] : []
  } catch {
    return []
  }
}

export function saveAppointment(appointment: Appointment) {
  const appointments = [appointment, ...readAppointments()]
  window.localStorage.setItem(storageKey, JSON.stringify(appointments))
}
