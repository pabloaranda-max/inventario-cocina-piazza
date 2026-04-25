const TZ = 'America/Mexico_City'

function dateMX(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
}

function formatUtcDateInput(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayMX(): string {
  return dateMX(new Date())
}

export function daysFromNowMX(days: number): string {
  return dateMX(new Date(Date.now() + days * 86400_000))
}

export function toDateInputMX(date: Date | string): string {
  return dateMX(typeof date === 'string' ? new Date(date) : date)
}

export function addDaysToDateInput(dateInput: string, days: number): string {
  const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''

  const [, rawYear, rawMonth, rawDay] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)

  if ([year, month, day].some(Number.isNaN)) return ''

  return formatUtcDateInput(new Date(Date.UTC(year, month - 1, day + days)))
}

export function formatDate(date: string | null | undefined) {
  if (!date) return 'Sin fecha'
  const d = date.includes('T') || date.includes('Z') ? new Date(date) : new Date(`${date}T00:00:00`)
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: TZ }).format(d)
}

export function formatDateTime(date: string | null | undefined) {
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(date))
}

export function formatCurrency(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount)
}

export function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

export function getAdminEmails() {
  return String(process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false
  return getAdminEmails().includes(email.trim().toLowerCase())
}
