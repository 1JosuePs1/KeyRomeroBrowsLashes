export const normalizePhone = (raw: string): string | null => {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')

  // Internacional: con + o con 00 al inicio
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null
  }
  if (digits.startsWith('00')) {
    const intl = digits.slice(2)
    return intl.length >= 8 && intl.length <= 15 ? intl : null
  }

  // Costa Rica: 8 dígitos, o ya trae 506
  if (digits.length === 8) return `506${digits}`
  if (digits.length === 11 && digits.startsWith('506')) return digits

  return null
}