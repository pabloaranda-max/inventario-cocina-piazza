import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IncidenciaForm } from '../../incidencia-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, Incidencia } from '@/lib/types'

export default async function EditarIncidenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: incidencia }, { data: equipos }] = await Promise.all([
    supabase.from('incidencias').select('*').eq('id', id).single(),
    supabase.from('equipos').select('id,nombre,area').order('nombre', { ascending: true })
  ])

  if (!incidencia) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/incidencias/${id}`} className="text-sm text-slate-600 hover:text-slate-950">
          Volver a incidencia
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Editar incidencia</h1>
      </div>
      <IncidenciaForm
        equipos={(equipos as Pick<Equipo, 'id' | 'nombre' | 'area'>[]) ?? []}
        incidencia={incidencia as Incidencia}
      />
    </div>
  )
}
