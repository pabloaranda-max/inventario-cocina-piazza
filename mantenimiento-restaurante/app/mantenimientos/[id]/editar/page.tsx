import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MantenimientoForm } from '../../mantenimiento-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Mantenimiento, MapaZona, Proveedor } from '@/lib/types'

export default async function EditarMantenimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: mantenimiento }, { data: activos }, { data: zonas }, { data: proveedores }, { data: incidencias }] =
    await Promise.all([
      supabase.from('mantenimientos').select('*').eq('id', id).single(),
      supabase.from('activos').select('id,nombre,area,clase,tipo').order('nombre', { ascending: true }),
      supabase.from('mapa_zonas').select('id,nombre,area,label').eq('visible', true).order('area', { ascending: true }),
      supabase.from('proveedores').select('id,nombre,especialidad').order('nombre', { ascending: true }),
      supabase
        .from('incidencias')
        .select('id,ticket_numero,descripcion,estado,activo_id,equipo_id,infraestructura_id,activo:activos(id,nombre,area,clase,tipo),equipo:equipos(id,nombre,area),infraestructura:infraestructura(id,nombre,area,tipo)')
        .order('fecha_reporte', { ascending: false })
        .limit(200)
    ])

  if (!mantenimiento) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/mantenimientos/${id}`} className="brand-inline-link text-sm">
          Volver a mantenimiento
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar mantenimiento</h1>
      </div>
      <MantenimientoForm
        mantenimiento={mantenimiento as Mantenimiento}
        activos={(activos as Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo'>[]) ?? []}
        zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label'>[]) ?? []}
        proveedores={(proveedores as Pick<Proveedor, 'id' | 'nombre' | 'especialidad'>[]) ?? []}
        incidencias={(incidencias as unknown as Parameters<typeof MantenimientoForm>[0]['incidencias']) ?? []}
      />
    </div>
  )
}
