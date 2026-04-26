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
    supabase.from('activos').select('id,clase,nombre,tipo,estado,criticidad,proveedor_id,zona_id,sistema,notas,fecha_ultima_revision,fecha_proxima_revision,foto_url,equipo:equipos(id),infraestructura:infraestructura(id)').eq('id', id).single(),
    supabase.from('mapa_zonas').select('id,nombre,label,area,nivel_id').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('proveedores').select('id,nombre').order('nombre', { ascending: true })
  ])

  if (!activo) notFound()
  const typedActivo = activo as Pick<Activo, 'id' | 'clase' | 'nombre' | 'tipo' | 'estado' | 'criticidad' | 'proveedor_id' | 'zona_id' | 'sistema' | 'notas' | 'fecha_ultima_revision' | 'fecha_proxima_revision' | 'foto_url'> & {
    equipo?: { id: string }[] | { id: string } | null
    infraestructura?: { id: string }[] | { id: string } | null
  }
  const hasEquipo = Array.isArray(typedActivo.equipo) ? typedActivo.equipo.length > 0 : Boolean(typedActivo.equipo)
  const hasInfraestructura = Array.isArray(typedActivo.infraestructura) ? typedActivo.infraestructura.length > 0 : Boolean(typedActivo.infraestructura)
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
