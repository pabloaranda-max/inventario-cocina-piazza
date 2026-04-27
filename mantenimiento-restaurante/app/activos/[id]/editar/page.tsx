import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActivoBaseForm } from './activo-base-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Activo, MapaNivel, MapaZona, Proveedor } from '@/lib/types'

export default async function EditarActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const [{ data: activo }, { data: zonas }, { data: niveles }, { data: proveedores }] = await Promise.all([
    supabase.from('activos').select('id,clase,nombre,tipo,estado,criticidad,proveedor_id,zona_id,notas,fecha_ultima_revision,fecha_proxima_revision,foto_url').eq('id', id).single(),
    supabase.from('mapa_zonas').select('id,nombre,label,area,nivel_id').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('proveedores').select('id,nombre').order('nombre', { ascending: true })
  ])

  if (!activo) notFound()
  const typedActivo = activo as Pick<Activo, 'id' | 'clase' | 'nombre' | 'tipo' | 'estado' | 'criticidad' | 'proveedor_id' | 'zona_id' | 'notas' | 'fecha_ultima_revision' | 'fecha_proxima_revision' | 'foto_url'>
  const [{ data: equipo }, { data: infraestructura }] = await Promise.all([
    typedActivo.clase === 'equipo'
      ? supabase.from('equipos').select('id').eq('id', id).single()
      : Promise.resolve({ data: null }),
    typedActivo.clase === 'infraestructura'
      ? supabase.from('infraestructura').select('id').eq('id', id).single()
      : Promise.resolve({ data: null })
  ])
  const hasEquipo = Boolean(equipo)
  const hasInfraestructura = Boolean(infraestructura)
  const provisional =
    (typedActivo.clase === 'equipo' && !hasEquipo) ||
    (typedActivo.clase === 'infraestructura' && !hasInfraestructura)
  const fotoUrl = await createSignedUrl(supabase, typedActivo.foto_url)

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/activos/${id}`} className="brand-inline-link text-sm">
          Volver al activo
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Editar activo</h1>
        <p className="brand-hint">Completa la ficha base operativa del activo.</p>
      </div>

      <ActivoBaseForm
        activo={typedActivo}
        zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]) ?? []}
        niveles={(niveles as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]) ?? []}
        proveedores={(proveedores as Pick<Proveedor, 'id' | 'nombre'>[]) ?? []}
        provisional={provisional}
        fotoUrl={fotoUrl}
      />
    </div>
  )
}
