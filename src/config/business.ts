export type CategoryId = 'pestanas' | 'cejas' | 'micropigmentacion'

export type Service = {
  id: string
  name: string
  price: number
  durationMin: number
}

export type Category = {
  id: CategoryId
  name: string
  deposit: number
  services: Service[]
  note?: string
}

export const business = {
  name: 'Keylin Romero Brows & Lashes Studio',
  shortName: 'Keylin Romero',
  city: 'Cartago centro',
  address: '50 metros sur de la esquina suroeste de tribunales, frente a Defensa Pública.',
  wazeUrl: 'https://waze.com/ul/hd1u247ku5',
  whatsappNumber: '50664787271',
  whatsappDisplay: '6478-7271',
  instagram: 'https://www.instagram.com/key_lashes_brows/',
  instagramHandle: '@key_lashes_brows',
  tiktok: 'https://www.tiktok.com/@keylin.romero.stu',
  email: 'keyromero50@gmail.com',
  sinpe: '6478-7271',
  sinpeName: 'Keylin Torres Romero',
  googleMapsReviewUrl: 'https://www.google.com/maps/search/?api=1&query=Keylin+Romero+Brows+Lashes+Studio',
}

export const categories: Category[] = [
  {
    id: 'pestanas',
    name: 'Pestañas',
    deposit: 5000,
    services: [
      { id: '2d', name: '2D', price: 17000, durationMin: 90 },
      { id: 'retoque-2d', name: 'Retoque 2D', price: 15000, durationMin: 90 },
      { id: 'hibridas', name: 'Híbridas', price: 19000, durationMin: 90 },
      { id: 'retoque-hibridas', name: 'Retoque híbridas', price: 17000, durationMin: 90 },
      { id: 'volumen', name: 'Volumen / mega volumen', price: 22000, durationMin: 90 },
      { id: 'retoque-volumen', name: 'Retoque volumen', price: 20000, durationMin: 90 },
      { id: 'retiro', name: 'Retiro', price: 1000, durationMin: 30 },
      { id: 'retiro-otros', name: 'Retiro de otros lugares', price: 2000, durationMin: 30 },
    ],
  },
  {
    id: 'cejas',
    name: 'Cejas',
    deposit: 5000,
    services: [
      { id: 'laminado', name: 'Laminado', price: 9000, durationMin: 60 },
      { id: 'henna', name: 'Henna + diseño', price: 12000, durationMin: 60 },
      { id: 'laminado-diseno', name: 'Laminado + diseño', price: 11000, durationMin: 60 },
      { id: 'hilo-pinzas', name: 'Diseño con hilo o pinzas', price: 5000, durationMin: 60 },
      { id: 'labio', name: 'Depilación de labio superior', price: 3000, durationMin: 30 },
      { id: 'diseno-laminado-henna', name: 'Diseño + laminado + henna', price: 19000, durationMin: 60 },
    ],
  },
  {
    id: 'micropigmentacion',
    name: 'Micropigmentación',
    deposit: 10000,
    note: 'Incluye kit de cuidado posterior.',
    services: [
      { id: 'micro-procedimiento', name: 'Procedimiento', price: 55000, durationMin: 150 },
      { id: 'micro-retoque-mes', name: 'Retoque al mes', price: 25000, durationMin: 120 },
      { id: 'micro-retoque-anual', name: 'Retoque anual', price: 30000, durationMin: 120 },
    ],
  },
]

export const reviews = [
  { name: 'María José', text: 'Me encantaron mis pestañas híbridas, súper naturales y duraron un montón.' },
  { name: 'Daniela', text: 'Keylin es muy detallista y el lugar es muy cómodo. Mis cejas quedaron perfectas.' },
  { name: 'Valeria', text: 'La micropigmentación me cambió la rutina. ¡100% recomendada!' },
]

export const weeklySchedule = {
  weekdays: 'Lunes, miércoles y viernes · 12:30 p. m. – 6:30 p. m.',
  weekdaysMorning: 'Martes · 7:00 a. m. – 12:30 p. m.',
  thursday: 'Jueves · 12:30 p. m. – 6:30 p. m.',
  saturday: '7:00 a. m. – 12:30 p. m.',
  sunday: 'Cerrado',
  maxAppointments: 4,
  saturdayMaxAppointments: 4,
  appointmentIntervalMin: 90,
  weekdayStart: 12 * 60 + 30,
  weekdayEnd: 18 * 60 + 30,
  weekdayMorningStart: 7 * 60,
  weekdayMorningEnd: 12 * 60 + 30,
  thursdayStart: 12 * 60 + 30,
  thursdayEnd: 18 * 60 + 30,
  saturdayStart: 7 * 60,
  saturdayEnd: 12 * 60 + 30,
}

export function formatColones(value: number) {
  return `₡${value.toLocaleString('es-CR').replace(/,/g, ' ')}`
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}
