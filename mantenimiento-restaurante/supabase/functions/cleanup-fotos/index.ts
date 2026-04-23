import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const token = req.headers.get('x-cleanup-token')
  if (token !== Deno.env.get('CLEANUP_TOKEN')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

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
