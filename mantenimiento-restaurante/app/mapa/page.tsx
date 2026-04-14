import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'
import { MapaOperativo, type MapaIncidencia } from './mapa-operativo'

export default async function MapaPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: equipos }, { data: incidencias }] = await Promise.all([
    supabase
      .from('equipos')
      .select('id,nombre,area,categoria,estado,fecha_proximo_mantenimiento')
      .order('nombre', { ascending: true })
      .limit(300),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion,prioridad,estado,equipo_id,equipo:equipos(id,nombre,area)')
      .in('estado', ['abierta', 'en_progreso'])
      .order('fecha_reporte', { ascending: false })
      .limit(200)
  ])

  return (
    <MapaOperativo
      equipos={(equipos as Equipo[]) ?? []}
      incidencias={(incidencias as unknown as MapaIncidencia[]) ?? []}
    />
  )
}
