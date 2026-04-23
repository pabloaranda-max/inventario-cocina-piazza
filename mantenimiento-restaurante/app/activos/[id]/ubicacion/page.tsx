import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, MapaNivel, MapaZona } from '@/lib/types'
import { UbicacionActivoForm } from './ubicacion-activo-form'

type UbicacionActivo = Pick<Activo, 'id' | 'nombre' | 'tipo' | 'area' | 'clase' | 'nivel_id' | 'x' | 'y' | 'zona_id'>

export default async function UbicacionActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: activo }, { data: niveles }, { data: zonas }] = await Promise.all([
    supabase
      .from('activos')
      .select('id,nombre,tipo,area,clase,nivel_id,x,y,zona_id')
      .eq('id', id)
      .single(),
    supabase
      .from('mapa_niveles')
      .select('*')
      .eq('visible', true)
      .order('orden', { ascending: true }),
    supabase
      .from('mapa_zonas')
      .select('*')
      .eq('visible', true)
      .order('orden', { ascending: true })
  ])

  if (!activo) notFound()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/activos/${id}`} className="brand-inline-link text-sm">
          Volver al activo
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Ubicar en mapa</h1>
        <p className="text-sm text-[color:var(--brand-muted)]">
          Selecciona el nivel y marca el punto exacto en el plano.
        </p>
      </div>

      <UbicacionActivoForm
        activo={activo as UbicacionActivo}
        niveles={(niveles as MapaNivel[]) ?? []}
        zonas={(zonas as MapaZona[]) ?? []}
      />
    </div>
  )
}
