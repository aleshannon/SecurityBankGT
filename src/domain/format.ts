export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function formatMoney(value: number): string {
  const negative = value < 0
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}Q${grouped}.${fraction}`
}

export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

export function formatDateTime(value: string | Date): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(date)} ${hours}:${minutes}`
}

export function maskDpi(dpi: string): string {
  const digits = dpi.replace(/\D/g, '')
  const last4 = digits.slice(-4).padStart(4, '0')
  return `****-*****-${last4}`
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `****${digits.slice(-4)}`
}

export function dayKey(value: string | Date, timeZone = 'America/Guatemala'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function isoDate(offsetDays = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function ageFromIso(isoDateValue: string): number {
  const born = new Date(`${isoDateValue}T12:00:00`)
  const today = new Date()
  let age = today.getFullYear() - born.getFullYear()
  const month = today.getMonth() - born.getMonth()
  if (month < 0 || (month === 0 && today.getDate() < born.getDate())) age -= 1
  return age
}

export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Navegador de demostración'
  const agent = navigator.userAgent
  if (/iPhone|iPad/.test(agent)) return 'Safari / iPhone'
  if (/Android/.test(agent)) return 'Navegador / Android'
  if (/Mac OS/.test(agent)) return 'Navegador / macOS'
  if (/Windows/.test(agent)) return 'Navegador / Windows'
  return 'Navegador web'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0
  if (password.length >= 12) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  if (password.length >= 16 && score === 4) return 4
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4
}

export function paginate<T>(items: T[], page: number, pageSize = 8) {
  const size = Math.min(Math.max(pageSize, 1), 20)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(Math.max(page, 1), pages)
  const start = (current - 1) * size
  return {
    items: items.slice(start, start + size),
    total: items.length,
    page: current,
    pages,
    pageSize: size,
  }
}
