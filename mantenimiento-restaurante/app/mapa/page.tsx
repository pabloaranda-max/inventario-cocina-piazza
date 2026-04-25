import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { MapaNivel, MapaZona, MapaActivo, MapaIncidencia, MapaInfraestructura, MapaLimpieza, MapaPendiente } from '@/lib/types'
import { MapaOperativo } from './mapa-operativo'

export default async function MapaPage() {
  const supabase = await createServerSupabaseClient()
  const [
    { data: activos },
    { data: incidencias },
    { data: niveles },
    { data: zonas },
    { data: infraestructura },
    { data: limpiezas },
    { data: pendientes }
  ] = await Promise.all([
    supabase
      .from('activos')
      .select('id,nombre,tipo,area,clase,estado,criticidad,nivel_id,x,y,zona_id,fecha_proxima_revision,fecha_proxima_limpieza,limpieza_intervalo_dias')
      .order('nombre', { ascending: true })
      .limit(300),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion,prioridad,estado,fecha_reporte,updated_at,activo_id,equipo_id,infraestructura_id,zona_id,zona_nombre')
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
      .order('orden', { ascending: true }),
    supabase
      .from('infraestructura')
      .select('id,nombre,tipo,area,estado,criticidad,nivel_id,x,y,zona_id,fecha_proxima_revision')
      .not('nivel_id', 'is', null)
      .order('nombre', { ascending: true }),
    supabase
      .from('mantenimientos')
      .select('id,descripcion,fecha_realizacion,realizado_por,activo_id,zona_id,zona_nombre,activo:activos(id,nombre,area)')
      .eq('tipo', 'limpieza_profunda')
      .order('fecha_realizacion', { ascending: false })
      .limit(180),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion,prioridad,estado,fecha_reporte,zona_nombre')
      .eq('estado', 'pendiente_asignacion')
      .order('fecha_reporte', { ascending: true })
      .limit(8)
  ])

  return (
    <MapaOperativo
      activos={(activos as MapaActivo[]) ?? []}
      incidencias={(incidencias as unknown as MapaIncidencia[]) ?? []}
      niveles={(niveles as MapaNivel[]) ?? []}
      zonas={(zonas as MapaZona[]) ?? []}
      infraestructura={(infraestructura as MapaInfraestructura[]) ?? []}
      limpiezas={(limpiezas as unknown as MapaLimpieza[]) ?? []}
      pendientes={(pendientes as MapaPendiente[]) ?? []}
    />
  )
}
