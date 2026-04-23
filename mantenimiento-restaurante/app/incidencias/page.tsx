import Image from 'next/image'
import Link from 'next/link'
import { cambiarEstadoIncidencia } from './actions'
import { EstadoFlowPanel } from './estado-flow-panel'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrlMap } from '@/lib/storage'
import type { Incidencia } from '@/lib/types'
import { formatDateTime, isAdminEmail } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

const estados = ['pendiente_asignacion', 'abierta', 'en_progreso', 'resuelta', 'cerrada']

export default async function IncidenciasPage({
  searchParams
}: {
  searchParams: Promise<{ flash?: string; estado?: string; prioridad?: string }>
}) {
  const { flash, estado, prioridad } = await searchParams
  const supabase = await createServerSupabaseClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()
  const canCloseIncidencias = isAdminEmail(user?.email)
  let query = supabase
    .from('incidencias')
    .select('*, activo:activos(id,nombre,area,clase,tipo), equipo:equipos(id,nombre,area), infraestructura:infraestructura(id,nombre,area,tipo)')
    .order('fecha_reporte', { ascending: false })

  if (estado === 'activas') query = query.in('estado', ['abierta', 'en_progreso'])
  else if (estado === 'sin_asignar') query = query.eq('estado', 'pendiente_asignacion')
  else if (estado && estados.includes(estado)) query = query.eq('estado', estado)

  if (prioridad === 'alta_urgente') query = query.in('prioridad', ['alta', 'urgente'])
  else if (prioridad && ['baja', 'media', 'alta', 'urgente'].includes(prioridad)) query = query.eq('prioridad', prioridad)

  const { data } = await query
  const incidencias = (data as Incidencia[]) ?? []
  const fotoUrls = await createSignedUrlMap(
    supabase,
    incidencias.map((incidencia) => incidencia.foto_url)
  )
  const getDestino = (incidencia: Incidencia) =>
    incidencia.activo?.nombre ??
    incidencia.equipo?.nombre ??
    incidencia.infraestructura?.nombre ??
    incidencia.zona_nombre ??
    'Sin destino'
  const incidenciasConFoto = incidencias.map((incidencia) => ({
    incidencia,
    foto: incidencia.foto_url ? fotoUrls.get(incidencia.foto_url) ?? null : null
  }))
  const currentQuery = new URLSearchParams({
    ...(estado ? { estado } : {}),
    ...(prioridad ? { prioridad } : {})
  }).toString()
  const redirectTo = `/incidencias${currentQuery ? `?${currentQuery}` : ''}`

  return (
    <div className="space-y-5">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--brand-ink)]">Incidencias</h1>
          <p className="brand-hint">Averias y pendientes reportados.</p>
        </div>
        <Link href="/incidencias/nueva" className="brand-button">
          Nueva incidencia
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterLink href="/incidencias" active={!estado && !prioridad} label="Todas" />
        <FilterLink href="/incidencias?estado=sin_asignar" active={estado === 'sin_asignar'} label="Sin asignar" tone="orange" />
        <FilterLink href="/incidencias?estado=activas" active={estado === 'activas' && !prioridad} label="Activas" />
        <FilterLink href="/incidencias?estado=activas&prioridad=alta_urgente" active={estado === 'activas' && prioridad === 'alta_urgente'} label="Alta / urgente" />
        <FilterLink href="/incidencias?estado=abierta" active={estado === 'abierta'} label="Abiertas" />
        <FilterLink href="/incidencias?estado=en_progreso" active={estado === 'en_progreso'} label="En progreso" />
        <FilterLink href="/incidencias?estado=resuelta" active={estado === 'resuelta'} label="Resueltas" />
      </div>

      <div className="brand-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-[color:var(--brand-muted)]">
        <span>{incidencias.length} incidencia{incidencias.length === 1 ? '' : 's'} en esta bandeja</span>
        <span>Ordenadas por reporte más reciente</span>
      </div>

      {incidenciasConFoto.length ? (
        <div className="brand-card overflow-hidden">
          {incidenciasConFoto.map(({ incidencia, foto }) => (
            <article
              key={incidencia.id}
              className="border-b border-[color:color-mix(in_srgb,var(--brand-olive)_12%,transparent)] p-4 last:border-0"
            >
              <div className="grid gap-3 md:grid-cols-[72px_1fr_auto] md:items-start">
                {foto ? (
                  <Image
                    src={foto}
                    alt="Foto de incidencia"
                    width={72}
                    height={72}
                    className="h-18 w-18 rounded-md object-cover"
                  />
                ) : (
                  <div className="hidden h-[72px] w-[72px] items-center justify-center rounded-md bg-[color:color-mix(in_srgb,var(--brand-bone)_88%,white)] text-xs text-[color:var(--brand-muted)] md:flex">
                    Sin foto
                  </div>
                )}

                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-[color:color-mix(in_srgb,var(--brand-olive)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_80%,white)] px-2 py-1 text-xs font-medium text-[color:var(--brand-olive)]">
                      {incidencia.ticket_numero}
                    </span>
                    <StatusBadge type="incidencia" value={incidencia.estado} />
                    <StatusBadge type="prioridad" value={incidencia.prioridad} />
                  </p>
                  <Link
                    href={`/incidencias/${incidencia.id}`}
                    className="mt-2 block truncate font-medium text-[color:var(--brand-ink)] hover:underline"
                  >
                    {incidencia.descripcion}
                  </Link>
                  <p className="mt-1 text-sm text-[color:var(--brand-muted)]">
                    {getDestino(incidencia)} ·{' '}
                    {formatDateTime(incidencia.fecha_reporte)}
                    {incidencia.reportado_por ? ` · ${incidencia.reportado_por}` : ''}
                  </p>
                </div>

                <div className="flex flex-col gap-2 md:items-end">
                  <div className="flex gap-2">
                    <Link href={`/incidencias/${incidencia.id}`} className="brand-button flex-1 text-center md:flex-none">
                      Ver
                    </Link>
                    <Link href={`/incidencias/${incidencia.id}/editar`} className="brand-button-muted flex-1 text-center md:flex-none">
                      Editar
                    </Link>
                  </div>
                  <EstadoFlowPanel
                    incidenciaId={incidencia.id}
                    currentEstado={incidencia.estado}
                    canClose={canCloseIncidencias}
                    requiereEvidencia={(incidencia.prioridad === 'alta' || incidencia.prioridad === 'urgente') && !incidencia.foto_url}
                    cambiarEstadoAction={cambiarEstadoIncidencia.bind(null, incidencia.id)}
                    redirectTo={redirectTo}
                    compact
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="brand-card p-6 text-sm text-[color:var(--brand-muted)]">
          No hay incidencias registradas.
        </div>
      )}
    </div>
  )
}

function FilterLink({ href, active, label, tone }: { href: string; active: boolean; label: string; tone?: 'orange' }) {
  const inactiveClass = tone === 'orange'
    ? 'border-[color:color-mix(in_srgb,var(--brand-gold)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-gold)_14%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-gold)_22%,white)] dark:border-[rgba(239,169,30,0.22)] dark:bg-[rgba(90,65,24,0.84)] dark:text-[rgba(255,223,130,0.96)] dark:hover:bg-[rgba(107,77,30,0.92)]'
    : 'border-[color:color-mix(in_srgb,var(--brand-olive)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-bone)_76%,white)] text-[color:var(--brand-olive)] hover:bg-[color:color-mix(in_srgb,var(--brand-bone)_92%,white)] dark:border-[rgba(101,127,68,0.22)] dark:bg-[rgba(31,43,23,0.9)] dark:text-[rgba(232,239,210,0.96)] dark:hover:bg-[rgba(39,54,28,0.96)]'

  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-2 text-sm font-medium ${
        active
          ? 'border-[color:var(--brand-wine)] bg-[color:var(--brand-wine)] text-[color:var(--brand-bone)]'
          : inactiveClass
      }`}
    >
      {label}
    </Link>
  )
}
