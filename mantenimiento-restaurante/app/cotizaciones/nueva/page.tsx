import Link from 'next/link'
import { CotizacionForm } from '../cotizacion-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Incidencia, Mantenimiento, Proveedor } from '@/lib/types'

export default async function NuevaCotizacionPage({
  searchParams
}: {
  searchParams: Promise<{ activo?: string; incidencia?: string; mantenimiento?: string; proveedor?: string }>
}) {
  const { activo, incidencia, mantenimiento, proveedor } = await searchParams
  const supabase = await createServerSupabaseClient()

  const [{ data: proveedores }, { data: activos }, { data: incidencias }, { data: mantenimientos }] = await Promise.all([
    supabase.from('proveedores').select('id,nombre').order('nombre'),
    supabase
      .from('activos')
      .select('id,nombre,area,clase,tipo')
      .order('nombre', { ascending: true })
      .limit(300),
    supabase
      .from('incidencias')
      .select('id,ticket_numero,descripcion')
      .in('estado', ['abierta', 'en_progreso'])
      .order('fecha_reporte', { ascending: false }),
    supabase
      .from('mantenimientos')
      .select('id,tipo,fecha_realizacion')
      .order('fecha_realizacion', { ascending: false })
      .limit(50),
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/cotizaciones" className="brand-inline-link text-sm">
          Volver a cotizaciones
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Nueva cotización</h1>
      </div>
      <CotizacionForm
        proveedores={(proveedores as Pick<Proveedor, 'id' | 'nombre'>[]) ?? []}
        activos={(activos as Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'>[]) ?? []}
        incidencias={(incidencias as Pick<Incidencia, 'id' | 'ticket_numero' | 'descripcion'>[]) ?? []}
        mantenimientos={(mantenimientos as Pick<Mantenimiento, 'id' | 'tipo' | 'fecha_realizacion'>[]) ?? []}
        defaultActivoId={activo}
        defaultIncidenciaId={incidencia}
        defaultMantenimientoId={mantenimiento}
        defaultProveedorId={proveedor}
      />
    </div>
  )
}
