export function formatDate(date: string | null | undefined) {
  if (!date) return 'Sin fecha'
  const d = date.includes('T') || date.includes('Z') ? new Date(date) : new Date(`${date}T00:00:00`)
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(d)
}

export function formatDateTime(date: string | null | undefined) {
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
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
