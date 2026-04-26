import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActivoBaseForm } from './activo-base-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, MapaNivel, MapaZona } from '@/lib/types'

export default async function EditarActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: activo }, { data: zonas }, { data: niveles }] = await Promise.all([
    supabase.from('activos').select('id,clase,nombre,tipo,estado,zona_id,notas').eq('id', id).single(),
    supabase.from('mapa_zonas').select('id,nombre,label,area,nivel_id').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true })
  ])

  if (!activo) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/activos/${id}`} className="brand-inline-link text-sm">
          Volver al activo
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar activo</h1>
        <p className="brand-hint">Edición base para cualquier activo del inventario operativo.</p>
      </div>

      <ActivoBaseForm
        activo={activo as Pick<Activo, 'id' | 'clase' | 'nombre' | 'tipo' | 'estado' | 'zona_id' | 'notas'>}
        zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]) ?? []}
        niveles={(niveles as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]) ?? []}
      />
    </div>
  )
}
