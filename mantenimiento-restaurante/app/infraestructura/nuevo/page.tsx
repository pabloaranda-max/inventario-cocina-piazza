import Link from 'next/link'
import { InfraestructuraForm } from '../infraestructura-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { MapaNivel, Proveedor } from '@/lib/types'

export default async function NuevaInfraestructuraPage() {
  const supabase = await createServerSupabaseClient()
  const [{ data: proveedores }, { data: niveles }, { data: areas }] = await Promise.all([
    supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
    supabase.from('mapa_niveles').select('*').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('areas').select('nombre').order('nombre', { ascending: true })
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/infraestructura" className="brand-inline-link text-sm">
          Volver a infraestructura
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Nueva infraestructura</h1>
      </div>
      <InfraestructuraForm
        proveedores={(proveedores as Proveedor[]) ?? []}
        niveles={(niveles as MapaNivel[]) ?? []}
        areas={(areas ?? []).map((a) => a.nombre)}
      />
    </div>
  )
}
