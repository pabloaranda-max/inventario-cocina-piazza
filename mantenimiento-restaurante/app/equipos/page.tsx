import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Equipo } from '@/lib/types'
import { formatDate, todayMX, daysFromNowMX } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

type MantenimientoFilter = 'vencido' | 'proximo'

export default async function EquiposPage({
  searchParams
}: {
  searchParams: Promise<{ mantenimiento?: MantenimientoFilter }>
}) {
  const { mantenimiento } = await searchParams
  const supabase = await createServerSupabaseClient()
  const today = todayMX()
  const nextLimitDate = daysFromNowMX(14)

  let query = supabase
    .from('equipos')
    .select('*, proveedor:proveedores(*)')
    .order('nombre', { ascending: true })
    .limit(200)

  if (mantenimiento === 'vencido') {
    query = query.lt('fecha_proximo_mantenimiento', today)
  } else if (mantenimiento === 'proximo') {
    query = query.gte('fecha_proximo_mantenimiento', today).lte('fecha_proximo_mantenimiento', nextLimitDate)
  }

  const { data: equipos } = await query

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Equipos</h1>
          <p className="brand-hint">Maquinas e instalaciones del restaurante.</p>
        </div>
        <Link href="/equipos/nuevo" className="brand-button">
          Nuevo equipo
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink href="/equipos" active={!mantenimiento} label="Todos" />
        <FilterLink href="/equipos?mantenimiento=vencido" active={mantenimiento === 'vencido'} label="Vencidos" />
        <FilterLink href="/equipos?mantenimiento=proximo" active={mantenimiento === 'proximo'} label="Próximos 14 días" />
      </div>

      {equipos?.length ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(equipos as Equipo[]).map((equipo) => (
            <article key={equipo.id} className="brand-card space-y-4 p-5">
              <Link href={`/equipos/${equipo.id}`} className="block">
                <h2 className="font-semibold text-[color:var(--brand-ink)] hover:underline">{equipo.nombre}</h2>
              </Link>
              <p className="brand-hint">
                {equipo.area ?? 'Sin area'} · {equipo.categoria ?? 'Sin categoria'}
              </p>
              <div>
                <StatusBadge type="equipo" value={equipo.estado} />
              </div>
              <p className="text-sm text-[color:var(--brand-olive)]">
                Proximo: {formatDate(equipo.fecha_proximo_mantenimiento)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/incidencias/nueva?equipo=${equipo.id}`}
                  className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-wine)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-wine)_22%,transparent)]"
                >
                  Reportar
                </Link>
                <Link
                  href={`/mantenimientos/nuevo?equipo=${equipo.id}`}
                  className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)]"
                >
                  Mantto.
                </Link>
                <Link href={`/equipos/${equipo.id}/editar`} className="brand-button-muted">
                  Editar
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-card p-6 text-sm text-[color:var(--brand-muted)]">
          No hay equipos registrados.
        </div>
      )}
    </div>
  )
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
          : 'border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(31,43,23,0.9)] dark:text-[rgba(232,239,210,0.96)] dark:hover:bg-[rgba(39,54,28,0.96)]'
      }`}
    >
      {label}
    </Link>
  )
}
