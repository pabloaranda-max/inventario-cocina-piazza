import Link from 'next/link'
import { MantenimientoForm } from '../mantenimiento-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'

export default async function NuevoMantenimientoPage({
  searchParams
}: {
  searchParams: Promise<{ equipo?: string; incidencia?: string }>
}) {
  const { equipo, incidencia } = await searchParams
  const supabase = await createServerSupabaseClient()
  const [{ data: equipos }, { data: incidencias }] = await Promise.all([
    supabase.from('equipos').select('id,nombre,area').order('nombre', { ascending: true }),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion,estado,equipo_id,equipo:equipos(id,nombre,area)')
      .in('estado', ['abierta', 'en_progreso'])
      .order('fecha_reporte', { ascending: false })
      .limit(100)
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/mantenimientos" className="text-sm text-slate-600 hover:text-slate-950">
          Volver a mantenimientos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Nuevo mantenimiento</h1>
      </div>
      <MantenimientoForm
        equipos={(equipos as Pick<Equipo, 'id' | 'nombre' | 'area'>[]) ?? []}
        incidencias={(incidencias as unknown as Parameters<typeof MantenimientoForm>[0]['incidencias']) ?? []}
        selectedEquipoId={equipo}
        selectedIncidenciaId={incidencia}
      />
    </div>
  )
}
