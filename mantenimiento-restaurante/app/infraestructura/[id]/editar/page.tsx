import Link from 'next/link'
import { notFound } from 'next/navigation'
import { InfraestructuraForm } from '../../infraestructura-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Infraestructura, MapaNivel, MapaZona, Proveedor } from '@/lib/types'

export default async function EditarInfraestructuraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: infraestructura }, { data: proveedores }, { data: activo }, { data: zonas }, { data: niveles }] = await Promise.all([
    supabase.from('infraestructura').select('*').eq('id', id).single(),
    supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
    supabase.from('activos').select('limpieza_intervalo_dias,limpieza_tipo,limpieza_proveedor_id,fecha_ultima_limpieza,fecha_proxima_limpieza,zona_id').eq('id', id).single(),
    supabase.from('mapa_zonas').select('id,nombre,label,area,nivel_id').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true })
  ])

  if (!infraestructura) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/infraestructura/${id}`} className="brand-inline-link text-sm">
          Volver a infraestructura
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar infraestructura</h1>
      </div>
      <InfraestructuraForm
        infraestructura={infraestructura as Infraestructura}
        proveedores={(proveedores as Proveedor[]) ?? []}
        zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]) ?? []}
        niveles={(niveles as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]) ?? []}
        activo={activo as Pick<Activo, 'limpieza_intervalo_dias' | 'limpieza_tipo' | 'limpieza_proveedor_id' | 'fecha_ultima_limpieza' | 'fecha_proxima_limpieza' | 'zona_id'> ?? undefined}
      />
    </div>
  )
}
