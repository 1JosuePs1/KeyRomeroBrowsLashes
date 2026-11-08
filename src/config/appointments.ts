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
