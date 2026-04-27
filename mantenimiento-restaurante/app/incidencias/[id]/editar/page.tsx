import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IncidenciaForm } from '../../incidencia-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, Incidencia, MapaNivel, MapaZona } from '@/lib/types'

export default async function EditarIncidenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: incidencia }, { data: activos }, { data: zonas }, { data: niveles }] = await Promise.all([
    supabase.from('incidencias').select('*').eq('id', id).single(),
    supabase.from('activos').select('id,nombre,area,clase,tipo,zona_id').order('nombre', { ascending: true }),
    supabase.from('mapa_zonas').select('id,nombre,area,label,nivel_id').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true })
  ])

  if (!incidencia) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/incidencias/${id}`} className="brand-inline-link text-sm">
          Volver a incidencia
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar incidencia</h1>
      </div>
      <IncidenciaForm
        activos={(activos as Pick<Activo, 'id' | 'nombre' | 'area' | 'clase' | 'tipo' | 'zona_id'>[]) ?? []}
        zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'area' | 'label' | 'nivel_id'>[]) ?? []}
        niveles={(niveles as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]) ?? []}
        incidencia={incidencia as Incidencia}
      />
    </div>
  )
}
