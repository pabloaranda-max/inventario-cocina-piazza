import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Activo, ClaseActivo } from '@/lib/types'
import { formatDate, todayMX, daysFromNowMX } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/status-badge'

const filtros: Array<{ label: string; clase?: ClaseActivo }> = [
  { label: 'Todos' },
  { label: 'Equipos', clase: 'equipo' },
  { label: 'Infraestructura', clase: 'infraestructura' },
  { label: 'Mobiliario', clase: 'mobiliario' },
  { label: 'Edificación', clase: 'edificacion' },
  { label: 'Sistemas', clase: 'sistema' }
]

type LimpiezaFilter = 'atrasadas' | 'proximas'

export default async function ActivosPage({
  searchParams
}: {
  searchParams: Promise<{ clase?: ClaseActivo; limpieza?: LimpiezaFilter }>
}) {
  const { clase, limpieza } = await searchParams
  const supabase = await createServerSupabaseClient()
  const today = todayMX()
  const nextLimitDate = daysFromNowMX(14)

  let query = supabase
    .from('activos')
    .select('*, proveedor:proveedores!proveedor_id(*)')
    .order('nombre', { ascending: true })
    .limit(300)

  if (clase) query = query.eq('clase', clase)
  if (limpieza === 'atrasadas') {
    query = query.not('limpieza_intervalo_dias', 'is', null).lt('fecha_proxima_limpieza', today)
  } else if (limpieza === 'proximas') {
    query = query
      .not('limpieza_intervalo_dias', 'is', null)
      .gte('fecha_proxima_limpieza', today)
      .lte('fecha_proxima_limpieza', nextLimitDate)
  }

  const { data } = await query
  const activos = (data as Activo[]) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Activos</h1>
          <p className="brand-hint">Vista unificada de equipos, infraestructura y elementos mantenibles.</p>
        </div>
        <Link href="/activos/nuevo" className="brand-button">
          Nuevo activo
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtros.map((filtro) => {
          const href = filtro.clase ? `/activos?clase=${filtro.clase}` : '/activos'
          const active = filtro.clase ? clase === filtro.clase && !limpieza : !clase && !limpieza

          return (
            <Link
              key={filtro.label}
              href={href}
              className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium ${
                active
                  ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
                  : 'border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(31,43,23,0.9)] dark:text-[rgba(232,239,210,0.96)] dark:hover:bg-[rgba(39,54,28,0.96)]'
              }`}
            >
              {filtro.label}
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink href="/activos?limpieza=atrasadas" active={limpieza === 'atrasadas'} label="Limpiezas atrasadas" />
        <FilterLink href="/activos?limpieza=proximas" active={limpieza === 'proximas'} label="Próximas limpiezas" />
      </div>

      <div className="brand-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-[color:var(--brand-muted)]">
        <span>{activos.length} activo{activos.length === 1 ? '' : 's'} en esta bandeja</span>
        <span>{limpieza ? 'Filtrado por seguimiento de limpieza' : 'Vista operativa compacta'}</span>
      </div>

      {activos.length ? (
        <div className="brand-card overflow-hidden">
          {activos.map((activo) => (
            <article
              key={activo.id}
              className="border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] p-4 last:border-0"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_230px_auto] lg:items-center">
                <div className="min-w-0">
                  <Link href={`/activos/${activo.id}`} className="font-semibold text-[color:var(--brand-ink)] hover:underline">
                    {activo.nombre}
                  </Link>
                  <p className="mt-1 truncate text-sm text-[color:var(--brand-muted)]">
                    {activo.area ?? 'Sin área'} · {activo.tipo} · {activo.clase}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge
                      type={activo.clase === 'equipo' ? 'equipo' : 'infraestructura'}
                      value={activo.estado}
                    />
                    <StatusBadge type="criticidad" value={activo.criticidad} />
                  </div>
                </div>

                <div className="text-sm text-[color:var(--brand-muted)]">
                  <p>Revisión: {formatDate(activo.fecha_proxima_revision)}</p>
                  {activo.limpieza_intervalo_dias ? (
                    <p className="mt-1 text-[color:var(--brand-olive)]">Limpieza: {formatDate(activo.fecha_proxima_limpieza)}</p>
                  ) : (
                    <p className="mt-1 text-[color:var(--brand-muted)]">Sin limpieza programada</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link href={`/activos/${activo.id}`} className="brand-button-muted">
                    Ver
                  </Link>
                  <Link
                    href={`/incidencias/nueva?activo=${activo.id}`}
                    className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-wine)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-wine)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-wine)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-wine)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-wine)_22%,transparent)]"
                  >
                    Reportar
                  </Link>
                  <Link
                    href={`/mantenimientos/nuevo?activo=${activo.id}`}
                    className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-olive)_10%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-olive)_18%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)]"
                  >
                    Mantto.
                  </Link>
                  <Link
                    href={`/activos/${activo.id}/ubicacion`}
                    className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-gold)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-gold)_14%,white)] px-3 py-2 text-sm font-medium text-[color:var(--brand-olive)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,white)] dark:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,transparent)]"
                  >
                    Ubicar
                  </Link>
                  {activo.clase === 'equipo' || activo.clase === 'infraestructura' ? (
                    <Link
                      href={activo.clase === 'equipo' ? `/equipos/${activo.id}/editar` : `/infraestructura/${activo.id}/editar`}
                      className="brand-button-muted"
                    >
                      Editar
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-card p-6 text-sm text-[color:var(--brand-muted)]">
          No hay activos registrados.
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
          ? 'border-[color:var(--brand-olive)] bg-[color:var(--brand-olive)] text-[color:var(--brand-bone)]'
          : 'border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(31,43,23,0.9)] dark:text-[rgba(232,239,210,0.96)] dark:hover:bg-[rgba(39,54,28,0.96)]'
      }`}
    >
      {label}
    </Link>
  )
}
