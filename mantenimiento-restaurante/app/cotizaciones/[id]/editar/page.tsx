import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CotizacionForm } from '../../cotizacion-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Cotizacion, Incidencia, Mantenimiento, Proveedor } from '@/lib/types'

export default async function EditarCotizacionPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const [{ data }, { data: proveedores }, { data: activos }, { data: incidencias }, { data: mantenimientos }] = await Promise.all([
    supabase.from('cotizaciones').select('*').eq('id', id).single(),
    supabase.from('proveedores').select('id,nombre').order('nombre'),
    supabase
      .from('activos')
      .select('id,nombre,area,clase,tipo')
      .order('nombre', { ascending: true })
      .limit(300),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion')
      .order('fecha_reporte', { ascending: false })
      .limit(100),
    supabase
      .from('mantenimientos')
      .select('id,tipo,fecha_realizacion')
      .order('fecha_realizacion', { ascending: false })
      .limit(50),
  ])

  if (!data) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/cotizaciones/${id}`} className="brand-inline-link text-sm">
          Volver a cotización
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar cotización</h1>
      </div>
      <CotizacionForm
        cotizacion={data as Cotizacion}
        proveedores={(proveedores as Pick<Proveedor, 'id' | 'nombre'>[]) ?? []}
        activos={(activos as Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'>[]) ?? []}
        incidencias={(incidencias as Pick<Incidencia, 'id' | 'ticket_numero' | 'descripcion'>[]) ?? []}
        mantenimientos={(mantenimientos as Pick<Mantenimiento, 'id' | 'tipo' | 'fecha_realizacion'>[]) ?? []}
      />
    </div>
  )
}
