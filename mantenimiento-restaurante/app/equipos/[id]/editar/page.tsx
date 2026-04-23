import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EquipoForm } from '../../equipo-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Equipo, Proveedor } from '@/lib/types'

export default async function EditarEquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: equipo }, { data: proveedores }, { data: areas }, { data: activo }] = await Promise.all([
    supabase.from('equipos').select('*').eq('id', id).single(),
    supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
    supabase.from('areas').select('nombre').order('nombre', { ascending: true }),
    supabase.from('activos').select('limpieza_intervalo_dias,limpieza_tipo,limpieza_proveedor_id,fecha_ultima_limpieza,fecha_proxima_limpieza').eq('id', id).single()
  ])

  if (!equipo) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/equipos/${id}`} className="brand-inline-link text-sm">
          Volver al equipo
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar equipo</h1>
      </div>
      <EquipoForm
        equipo={equipo as Equipo}
        proveedores={(proveedores as Proveedor[]) ?? []}
        areas={(areas ?? []).map((a) => a.nombre)}
        activo={activo as Pick<Activo, 'limpieza_intervalo_dias' | 'limpieza_tipo' | 'limpieza_proveedor_id' | 'fecha_ultima_limpieza' | 'fecha_proxima_limpieza'> ?? undefined}
      />
    </div>
  )
}
