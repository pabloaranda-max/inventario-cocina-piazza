import Link from 'next/link'
import { EquipoForm } from '../equipo-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Proveedor } from '@/lib/types'

export default async function NuevoEquipoPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: proveedores }, { data: areas }] = await Promise.all([
    supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
    supabase.from('areas').select('nombre').order('nombre', { ascending: true })
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/equipos" className="brand-inline-link text-sm">
          Volver a equipos
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Nuevo equipo</h1>
      </div>
      <EquipoForm
        proveedores={(proveedores as Proveedor[]) ?? []}
        areas={(areas ?? []).map((a) => a.nombre)}
      />
    </div>
  )
}
