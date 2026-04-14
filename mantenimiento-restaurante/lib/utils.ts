export function formatDate(date: string | null | undefined) {
  if (!date) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
    new Date(`${date}T00:00:00`)
  )
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
