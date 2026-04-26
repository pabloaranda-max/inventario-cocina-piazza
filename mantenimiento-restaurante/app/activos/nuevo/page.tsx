import Link from 'next/link'
import { EquipoForm } from '@/app/equipos/equipo-form'
import { InfraestructuraForm } from '@/app/infraestructura/infraestructura-form'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { MapaNivel, MapaZona, Proveedor } from '@/lib/types'

type ClaseNuevoActivo = 'equipo' | 'infraestructura'

const clases: Array<{
  clase: ClaseNuevoActivo
  title: string
  description: string
}> = [
  {
    clase: 'equipo',
    title: 'Equipo',
    description: 'Máquinas, equipos de cocina, refrigeración, extracción, lavado o bebidas.'
  },
  {
    clase: 'infraestructura',
    title: 'Infraestructura',
    description: 'Registros, tableros, válvulas, llaves de paso, techos, muros y puntos técnicos.'
  }
]

export default async function NuevoActivoPage({
  searchParams
}: {
  searchParams: Promise<{ clase?: ClaseNuevoActivo }>
}) {
  const { clase } = await searchParams
  const selectedClase = clase === 'equipo' || clase === 'infraestructura' ? clase : null
  const supabase = await createServerSupabaseClient()
  const [{ data: proveedores }, { data: zonas }, { data: niveles }] = await Promise.all([
    supabase.from('proveedores').select('*').order('nombre', { ascending: true }),
    supabase.from('mapa_zonas').select('id,nombre,label,area,nivel_id').eq('visible', true).order('orden', { ascending: true }),
    supabase.from('mapa_niveles').select('id,nombre,orden').eq('visible', true).order('orden', { ascending: true })
  ])

  return (
    <div className="space-y-5">
      <div>
        <Link href="/activos" className="brand-inline-link text-sm">
          Volver a activos
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Nuevo activo</h1>
        <p className="brand-hint">Primero clasifica el activo; después captura sus datos técnicos.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        {clases.map((item) => (
          <Link
            key={item.clase}
            href={`/activos/nuevo?clase=${item.clase}`}
            className={`rounded-lg border p-4 shadow-sm transition ${
              selectedClase === item.clase
                ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                : 'border-[color:color-mix(in_srgb,var(--brand-olive)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_72%,white)] text-[color:var(--brand-ink)] hover:border-[color:var(--brand-wine)]'
            }`}
          >
            <h2 className="font-semibold">{item.title}</h2>
            <p className={`mt-1 text-sm ${selectedClase === item.clase ? 'text-[color:color-mix(in_srgb,var(--brand-bone)_86%,white)]' : 'text-[color:var(--brand-muted)]'}`}>
              {item.description}
            </p>
          </Link>
        ))}
      </section>

      {selectedClase === 'equipo' ? (
        <EquipoForm
          proveedores={(proveedores as Proveedor[]) ?? []}
          zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]) ?? []}
          niveles={(niveles as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]) ?? []}
        />
      ) : null}

      {selectedClase === 'infraestructura' ? (
        <InfraestructuraForm
          proveedores={(proveedores as Proveedor[]) ?? []}
          zonas={(zonas as Pick<MapaZona, 'id' | 'nombre' | 'label' | 'area' | 'nivel_id'>[]) ?? []}
          niveles={(niveles as Pick<MapaNivel, 'id' | 'nombre' | 'orden'>[]) ?? []}
        />
      ) : null}

      {!selectedClase ? (
        <div className="brand-card p-6 text-sm text-[color:var(--brand-muted)]">
          Selecciona una clasificación para mostrar el formulario correspondiente.
        </div>
      ) : null}
    </div>
  )
}
