import Link from 'next/link'
import { EquipoForm } from '../equipo-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Proveedor } from '@/lib/types'

export default async function NuevoEquipoPage() {
  const supabase = await createServerSupabaseClient()
  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre', { ascending: true })

  return (
    <div className="space-y-5">
      <div>
        <Link href="/equipos" className="text-sm text-slate-600 hover:text-slate-950">
          Volver a equipos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Nuevo equipo</h1>
      </div>
      <EquipoForm proveedores={(proveedores as Proveedor[]) ?? []} />
    </div>
  )
}
