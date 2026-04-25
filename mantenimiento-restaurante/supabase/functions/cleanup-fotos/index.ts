import { createClient } from 'jsr:@supabase/supabase-js@2'

const TZ = 'America/Mexico_City'
const mxDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const mxOffsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  timeZoneName: 'shortOffset',
  hour: '2-digit',
})

function getMxDateParts(date: Date) {
  const parts = mxDateFormatter.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)

  if (Number.isNaN(year) || Number.isNaN(month)) {
    throw new Error('No se pudo resolver la fecha de America/Mexico_City.')
  }

  return { year, month }
}

function getMxOffsetMinutes(date: Date) {
  const value = mxOffsetFormatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')
    ?.value

  const match = value?.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
  if (!match) {
    throw new Error(`Offset inválido para ${TZ}: ${value ?? 'desconocido'}`)
  }

  const [, signToken, rawHours, rawMinutes] = match
  const hours = Number(rawHours)
  const minutes = Number(rawMinutes ?? '0')
  const sign = signToken === '+' ? 1 : -1

  return sign * (hours * 60 + minutes)
}

function startOfCurrentMonthMXUtcIso(now = new Date()) {
  const { year, month } = getMxDateParts(now)
  const localMidnightUtcMs = Date.UTC(year, month - 1, 1, 0, 0, 0)
  const offsetMinutes = getMxOffsetMinutes(new Date(localMidnightUtcMs))
  return new Date(localMidnightUtcMs - offsetMinutes * 60_000).toISOString()
}

Deno.serve(async (req) => {
  const token = req.headers.get('x-cleanup-token')
  if (token !== Deno.env.get('CLEANUP_TOKEN')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const startOfMonth = startOfCurrentMonthMXUtcIso()

  const { data: incidencias, error } = await supabase
    .from('incidencias')
    .select('id, foto_url')
    .in('estado', ['resuelta', 'cerrada'])
    .lt('fecha_reporte', startOfMonth)
    .not('foto_url', 'is', null)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!incidencias?.length) return Response.json({ deleted: 0 })

  const paths = incidencias.map((i) => i.foto_url as string)

  const { error: storageError } = await supabase.storage
    .from('mantenimiento')
    .remove(paths)

  if (storageError) return Response.json({ error: storageError.message }, { status: 500 })

  await supabase
    .from('incidencias')
    .update({ foto_url: null })
    .in('id', incidencias.map((i) => i.id))

  return Response.json({ deleted: paths.length })
})
