import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, MapaNivel, MapaZona } from '@/lib/types'
import { MapaOperativo, type MapaIncidencia } from './mapa-operativo'

export default async function MapaPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: equipos }, { data: incidencias }, { data: niveles }, { data: zonas }] = await Promise.all([
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
      .limit(200),
    supabase
      .from('mapa_niveles')
      .select('*')
      .eq('visible', true)
      .order('orden', { ascending: true }),
    supabase
      .from('mapa_zonas')
      .select('*')
      .eq('visible', true)
      .order('orden', { ascending: true })
  ])

  return (
    <MapaOperativo
      equipos={(equipos as Equipo[]) ?? []}
      incidencias={(incidencias as unknown as MapaIncidencia[]) ?? []}
      niveles={(niveles as MapaNivel[]) ?? []}
      zonas={(zonas as MapaZona[]) ?? []}
    />
  )
}
