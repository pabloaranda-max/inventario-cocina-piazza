import Link from 'next/link'
import { MantenimientoForm } from '../mantenimiento-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, MapaZona, Proveedor, TipoMantenimiento } from '@/lib/types'

const tiposMantenimiento: TipoMantenimiento[] = ['preventivo', 'correctivo', 'limpieza_profunda']

export default async function NuevoMantenimientoPage({
  searchParams
}: {
  searchParams: Promise<{
    equipo?: string
    infraestructura?: string
    activo?: string
    incidencia?: string
    zona?: string
    tipo?: string
  }>
}) {
  const { equipo, infraestructura, activo, incidencia, zona, tipo } = await searchParams
  const supabase = await createServerSupabaseClient()
  const selectedTipo = tiposMantenimiento.includes(tipo as TipoMantenimiento) ? (tipo as TipoMantenimiento) : undefined
  const [{ data: activos }, { data: zonas }, { data: proveedores }, { data: incidencias }] = await Promise.all([
    supabase.from('activos').select('id,nombre,area,clase,tipo').order('nombre', { ascending: true }),
    supabase.from('mapa_zonas').select('id,nombre,area,label').eq('visible', true).order('area', { ascending: true }),
    supabase.from('proveedores').select('id,nombre,especialidad').order('nombre', { ascending: true }),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion,estado,activo_id,equipo_id,infraestructura_id,activo:activos(id,nombre,area,clase,tipo),equipo:equipos(id,nombre,area),infraestructura:infraestructura(id,nombre,area,tipo)')
      .in('estado', ['abierta', 'en_progreso'])
      .order('fecha_reporte', { ascending: false })
      .limit(100)
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/mantenimientos" className="brand-inline-link text-sm">
          Volver a mantenimientos
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Nuevo mantenimiento</h1>
      </div>
      <MantenimientoForm
        activos={(activos as Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'>[]) ?? []}
        zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label'>[]) ?? []}
        proveedores={(proveedores as Pick<Proveedor, 'id' | 'nombre' | 'especialidad'>[]) ?? []}
        incidencias={(incidencias as unknown as Parameters<typeof MantenimientoForm>[0]['incidencias']) ?? []}
        selectedActivoId={activo ?? equipo ?? infraestructura}
        selectedIncidenciaId={incidencia}
        selectedZonaId={zona}
        selectedTipo={selectedTipo}
      />
    </div>
  )
}
