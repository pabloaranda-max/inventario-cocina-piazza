import Link from 'next/link'
import { IncidenciaForm } from '../incidencia-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'

export default async function NuevaIncidenciaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: equipos } = await supabase
    .from('equipos')
    .select('id,nombre,area')
    .order('nombre', { ascending: true })

  return (
    <div className="space-y-5">
      <div>
        <Link href="/incidencias" className="text-sm text-slate-600 hover:text-slate-950">
          Volver a incidencias
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Nueva incidencia</h1>
      </div>
      <IncidenciaForm equipos={(equipos as Pick<Equipo, 'id' | 'nombre' | 'area'>[]) ?? []} />
    </div>
  )
}
