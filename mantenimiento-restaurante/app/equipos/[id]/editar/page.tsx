import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EquipoForm } from '../../equipo-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo, Proveedor } from '@/lib/types'

export default async function EditarEquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: equipo }, { data: proveedores }] = await Promise.all([
    supabase.from('equipos').select('*').eq('id', id).single(),
    supabase.from('proveedores').select('*').order('nombre', { ascending: true })
  ])

  if (!equipo) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/equipos/${id}`} className="text-sm text-slate-600 hover:text-slate-950">
          Volver al equipo
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Editar equipo</h1>
      </div>
      <EquipoForm equipo={equipo as Equipo} proveedores={(proveedores as Proveedor[]) ?? []} />
    </div>
  )
}
