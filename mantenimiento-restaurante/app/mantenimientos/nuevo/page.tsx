import Link from 'next/link'
import { MantenimientoForm } from '../mantenimiento-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'

export default async function NuevoMantenimientoPage({
  searchParams
}: {
  searchParams: Promise<{ equipo?: string }>
}) {
  const { equipo } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: equipos } = await supabase
    .from('equipos')
    .select('id,nombre,area')
    .order('nombre', { ascending: true })

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
        selectedEquipoId={equipo}
      />
    </div>
  )
}
