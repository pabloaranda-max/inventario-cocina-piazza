import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Mantenimiento, TipoMantenimiento } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

const filtros: Array<{ label: string; tipo?: TipoMantenimiento }> = [
  { label: 'Todos' },
  { label: 'Preventivos', tipo: 'preventivo' },
  { label: 'Correctivos', tipo: 'correctivo' },
  { label: 'Limpiezas profundas', tipo: 'limpieza_profunda' }
]

const tiposMantenimiento: TipoMantenimiento[] = ['preventivo', 'correctivo', 'limpieza_profunda']

export default async function MantenimientosPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string; tipo?: string }>
}) {
  const { flash, tipo } = await searchParams
  const supabase = await createServerSupabaseClient()
  const tipoActivo = tiposMantenimiento.includes(tipo as TipoMantenimiento) ? (tipo as TipoMantenimiento) : undefined

  let query = supabase
    .from('mantenimientos')
    .select('*, activo:activos(id,nombre,area,clase,tipo), equipo:equipos(id,nombre,area), infraestructura:infraestructura(id,nombre,area,tipo), incidencia:incidencias(id,ticket_numero,descripcion,estado), proveedor:proveedores(id,nombre,especialidad)')
    .order('fecha_realizacion', { ascending: false })
    .limit(100)

  if (tipoActivo) query = query.eq('tipo', tipoActivo)

  const { data } = await query
  const mantenimientos = (data as Mantenimiento[]) ?? []

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Mantenimientos</h1>
          <p className="brand-hint">Preventivos y correctivos registrados.</p>
        </div>
        <Link href="/mantenimientos/nuevo" className="brand-button">
          Nuevo mantenimiento
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtros.map((filtro) => {
          const href = filtro.tipo ? `/mantenimientos?tipo=${filtro.tipo}` : '/mantenimientos'
          const active = filtro.tipo ? tipoActivo === filtro.tipo : !tipoActivo

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

      <div className="brand-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-[color:var(--brand-muted)]">
        <span>{mantenimientos.length} mantenimiento{mantenimientos.length === 1 ? '' : 's'} en esta bandeja</span>
        <span>{tipoActivo ? 'Filtrado por tipo' : 'Preventivos, correctivos y limpiezas recientes'}</span>
      </div>

      {mantenimientos.length ? (
        <div className="brand-card overflow-hidden">
          {mantenimientos.map((mantenimiento) => (
            <article
              key={mantenimiento.id}
              className="border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] p-4 last:border-0"
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_230px_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge type="mantenimiento" value={mantenimiento.tipo} />
                    <span className="text-sm text-[color:var(--brand-muted)]">
                      {formatDate(mantenimiento.fecha_realizacion)}
                    </span>
                  </div>
                  <Link
                    href={`/mantenimientos/${mantenimiento.id}`}
                    className="mt-2 block truncate font-medium text-[color:var(--brand-ink)] hover:underline"
                  >
                    {mantenimiento.descripcion}
                  </Link>
                  <p className="mt-1 truncate text-sm text-[color:var(--brand-muted)]">
                    {mantenimiento.activo?.nombre ??
                      mantenimiento.equipo?.nombre ??
                      mantenimiento.infraestructura?.nombre ??
                      mantenimiento.zona_nombre ??
                      'Sin activo específico'}
                    {mantenimiento.realizado_por ? ` · ${mantenimiento.realizado_por}` : ''}
                  </p>
                </div>

                <div className="text-sm text-[color:var(--brand-muted)]">
                  <p>
                    {mantenimiento.ejecucion_tipo === 'externo'
                      ? mantenimiento.costo != null
                        ? formatCurrency(mantenimiento.costo)
                        : 'Externo sin costo capturado'
                      : mantenimiento.requiere_material
                        ? mantenimiento.costo != null
                          ? `Material: ${formatCurrency(mantenimiento.costo)}`
                          : 'Interno con material'
                        : 'Interno'}
                  </p>
                  {mantenimiento.proveedor ? <p className="mt-1">{mantenimiento.proveedor.nombre}</p> : null}
                  {mantenimiento.incidencia ? (
                    <p className="mt-1">
                      Ticket:{' '}
                      <Link
                        href={`/incidencias/${mantenimiento.incidencia.id}`}
                        className="font-medium text-[color:var(--brand-ink)] hover:underline"
                      >
                        {mantenimiento.incidencia.ticket_numero}
                      </Link>
                    </p>
                  ) : null}
                  {mantenimiento.proxima_fecha_sugerida ? (
                    <p className="mt-1">Proximo: {formatDate(mantenimiento.proxima_fecha_sugerida)}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link href={`/mantenimientos/${mantenimiento.id}`} className="brand-button-muted">
                    Ver
                  </Link>
                  <Link href={`/mantenimientos/${mantenimiento.id}/editar`} className="brand-button-muted">
                    Editar
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-card p-6 text-sm text-[color:var(--brand-muted)]">
          No hay mantenimientos registrados.
        </div>
      )}
    </div>
  )
}
