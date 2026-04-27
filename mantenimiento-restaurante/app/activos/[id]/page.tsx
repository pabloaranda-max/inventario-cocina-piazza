import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSignedUrl } from '@/lib/storage'
import type { Activo, Incidencia, Mantenimiento } from '@/lib/types'
import { formatDate, formatDateTime } from '@/lib/utils'
import { FlashMessage } from '@/components/ui/flash-message'
import { StatusBadge } from '@/components/ui/status-badge'

type TimelineItem =
  | {
      id: string
      kind: 'incidencia'
      date: string
      title: string
      href: string
      status: Incidencia['estado']
      priority: Incidencia['prioridad']
      subtitle: string
    }
  | {
      id: string
      kind: 'mantenimiento'
      date: string
      title: string
      href: string
      status: Mantenimiento['tipo']
      subtitle: string
    }

export default async function ActivoDetallePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ flash?: string }>
}) {
  const { id } = await params
  const { flash } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: activoData } = await supabase
    .from('activos')
    .select('*, proveedor:proveedores!proveedor_id(*), nivel:mapa_niveles(id,nombre), zona:mapa_zonas(id,nombre,area), limpieza_proveedor:proveedores!limpieza_proveedor_id(nombre)')
    .eq('id', id)
    .single()

  if (!activoData) notFound()

  const activo = activoData as Activo & {
    zona?: { id: string; nombre: string | null; area: string | null } | null
    limpieza_proveedor?: { nombre: string } | null
  }
  const [{ data: equipo }, { data: infraestructura }] = await Promise.all([
    activo.clase === 'equipo'
      ? supabase.from('equipos').select('id').eq('id', id).single()
      : Promise.resolve({ data: null }),
    activo.clase === 'infraestructura'
      ? supabase.from('infraestructura').select('id').eq('id', id).single()
      : Promise.resolve({ data: null })
  ])
  const hasEquipo = Boolean(equipo)
  const hasInfraestructura = Boolean(infraestructura)
  const provisional =
    (activo.clase === 'equipo' && !hasEquipo) ||
    (activo.clase === 'infraestructura' && !hasInfraestructura)

  const [incidenciasData, mantenimientosData] = await Promise.all([
    supabase
      .from('incidencias')
      .select('*')
      .or(`activo_id.eq.${id}${activo.clase === 'equipo' ? `,equipo_id.eq.${id}` : ''}${activo.clase === 'infraestructura' ? `,infraestructura_id.eq.${id}` : ''}`)
      .order('fecha_reporte', { ascending: false })
      .limit(20),
    supabase
      .from('mantenimientos')
      .select('*')
      .or(`activo_id.eq.${id}${activo.clase === 'equipo' ? `,equipo_id.eq.${id}` : ''}${activo.clase === 'infraestructura' ? `,infraestructura_id.eq.${id}` : ''}`)
      .order('fecha_realizacion', { ascending: false })
      .limit(20)
  ])

  const incidencias = (incidenciasData.data as Incidencia[] | null) ?? []
  const mantenimientos = (mantenimientosData.data as Mantenimiento[] | null) ?? []
  const foto = await createSignedUrl(supabase, activo.foto_url)
  const incidenciasAbiertas = incidencias.filter((incidencia) => incidencia.estado === 'abierta' || incidencia.estado === 'en_progreso')
  const proximoVencimiento = [
    activo.fecha_proxima_revision ? { label: 'Revisión', date: activo.fecha_proxima_revision } : null,
    activo.fecha_proxima_limpieza ? { label: 'Limpieza', date: activo.fecha_proxima_limpieza } : null
  ]
    .filter((item): item is { label: string; date: string } => item !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null

  const timeline: TimelineItem[] = [
    ...incidencias.map((incidencia) => ({
      id: incidencia.id,
      kind: 'incidencia' as const,
      date: incidencia.fecha_reporte,
      title: `${incidencia.ticket_numero} · ${incidencia.descripcion}`,
      href: `/incidencias/${incidencia.id}`,
      status: incidencia.estado,
      priority: incidencia.prioridad,
      subtitle: incidencia.reportado_por ? `Reportó ${incidencia.reportado_por}` : 'Incidencia registrada'
    })),
    ...mantenimientos.map((mantenimiento) => ({
      id: mantenimiento.id,
      kind: 'mantenimiento' as const,
      date: mantenimiento.fecha_realizacion,
      title: mantenimiento.descripcion,
      href: `/mantenimientos/${mantenimiento.id}`,
      status: mantenimiento.tipo,
      subtitle: mantenimiento.realizado_por
        ? `${mantenimiento.realizado_por} · ${mantenimiento.ejecucion_tipo}`
        : `Mantenimiento ${mantenimiento.ejecucion_tipo}`
    }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="space-y-6">
      <FlashMessage code={flash} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/activos" className="brand-inline-link text-sm">
            Volver a activos
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{activo.nombre}</h1>
            {provisional ? (
              <span className="rounded-md border border-[rgba(239,169,30,0.24)] bg-[rgba(239,169,30,0.1)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#7a5500] dark:border-[rgba(239,169,30,0.28)] dark:bg-[rgba(90,65,24,0.56)] dark:text-[rgba(255,223,130,0.92)]">
                Provisional
              </span>
            ) : null}
          </div>
          <p className="brand-hint text-sm">
            {activo.area ?? 'Sin área'} · {activo.tipo} · {activo.clase}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/incidencias/nueva?activo=${activo.id}${activo.zona_id ? `&zona=${activo.zona_id}` : ''}`}
            className="rounded-md border border-[rgba(155,30,33,0.2)] bg-[rgba(155,30,33,0.08)] px-4 py-2 text-sm font-medium text-[color:var(--brand-wine)] hover:bg-[rgba(155,30,33,0.12)] dark:border-[rgba(155,30,33,0.24)] dark:bg-[rgba(155,30,33,0.18)] dark:text-[color:var(--brand-bone)]"
          >
            Reportar incidencia
          </Link>
          <Link
            href={`/mantenimientos/nuevo?activo=${activo.id}`}
            className="rounded-md border border-[rgba(47,62,30,0.16)] bg-[rgba(47,62,30,0.08)] px-4 py-2 text-sm font-medium text-[color:var(--brand-green)] hover:bg-[rgba(47,62,30,0.12)] dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.2)] dark:text-[color:var(--brand-bone)]"
          >
            Registrar mantenimiento
          </Link>
          <Link
            href={`/activos/${activo.id}/ubicacion`}
            className="brand-button-muted rounded-md px-4 py-2 text-sm font-medium"
          >
            Asignar zona
          </Link>
          <Link href={`/activos/${activo.id}/editar`} className="brand-button rounded-md px-4 py-2 text-sm font-medium">
            Editar
          </Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="brand-card rounded-lg p-5">
          {provisional ? (
            <div className="mb-4 rounded-lg border border-[rgba(239,169,30,0.24)] bg-[rgba(239,169,30,0.1)] px-4 py-3 text-sm text-[#7a5500] dark:border-[rgba(239,169,30,0.28)] dark:bg-[rgba(90,65,24,0.56)] dark:text-[rgba(255,223,130,0.92)]">
              Este activo se creó con captura rápida. Todavía no tiene ficha técnica completa y conviene terminar de catalogarlo.
            </div>
          ) : null}
          <h2 className="text-lg font-semibold">Datos</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="brand-hint">Estado</dt>
              <dd className="mt-1">
                <StatusBadge
                  type={activo.clase === 'equipo' ? 'equipo' : 'infraestructura'}
                  value={activo.estado}
                />
              </dd>
            </div>
            <div>
              <dt className="brand-hint">Criticidad</dt>
              <dd className="mt-1">
                <StatusBadge type="criticidad" value={activo.criticidad} />
              </dd>
            </div>
            <Info label="Proveedor" value={activo.proveedor?.nombre} />
            <Info label="Lámina" value={activo.nivel?.nombre} />
            <Info label="Zona" value={activo.zona?.nombre ?? 'Sin zona'} />
            <Info label="Última revisión" value={formatDate(activo.fecha_ultima_revision)} />
            <Info label="Próxima revisión" value={formatDate(activo.fecha_proxima_revision)} />
          </dl>

          {activo.limpieza_intervalo_dias ? (
            <div className="brand-card mt-4 rounded-md border-[rgba(47,62,30,0.16)] bg-[rgba(238,227,202,0.72)] p-3 dark:border-[rgba(238,227,202,0.14)] dark:bg-[rgba(47,62,30,0.18)]">
              <p className="brand-hint text-xs font-medium uppercase tracking-wide">Limpieza profunda</p>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 md:grid-cols-4">
                <InfoCompact label="Tipo" value={activo.limpieza_tipo === 'contratado' ? 'Servicio contratado' : 'Proceso interno'} />
                <InfoCompact label="Proveedor" value={activo.limpieza_proveedor?.nombre ?? '—'} />
                <InfoCompact label="Intervalo" value={`Cada ${activo.limpieza_intervalo_dias} días`} />
                <InfoCompact label="Última" value={formatDate(activo.fecha_ultima_limpieza)} />
                <InfoCompact label="Próxima" value={formatDate(activo.fecha_proxima_limpieza)} />
              </dl>
            </div>
          ) : null}

          {activo.notas ? (
            <p className="mt-4 whitespace-pre-line text-sm text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">
              {activo.notas}
            </p>
          ) : null}
        </div>

        <div className="brand-card rounded-lg p-3">
          <h2 className="brand-label mb-2">Foto</h2>
          {foto ? (
            <Image
              src={foto}
              alt={activo.nombre}
              width={320}
              height={240}
              className="h-60 w-full rounded-md object-cover"
            />
          ) : (
            <div className="brand-hint flex h-60 items-center justify-center rounded-md bg-[rgba(47,62,30,0.06)] dark:bg-[rgba(238,227,202,0.08)]">
              Sin foto
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <HistoryPanel title="Resumen operativo">
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Incidencias" value={incidencias.length} tone="wine" />
            <MetricCard label="Abiertas" value={incidenciasAbiertas.length} tone="wine" />
            <MetricCard label="Mantenimientos" value={mantenimientos.length} tone="olive" />
          </div>
          <div className="mt-4 rounded-md border border-[rgba(47,62,30,0.08)] px-3 py-3 dark:border-[rgba(238,227,202,0.08)]">
            <p className="brand-hint text-xs font-medium uppercase tracking-wide">Próximo hito</p>
            <p className="mt-1 text-sm font-medium text-[color:var(--brand-ink)] dark:text-[color:var(--brand-bone)]">
              {proximoVencimiento ? `${proximoVencimiento.label}: ${formatDate(proximoVencimiento.date)}` : 'Sin vencimientos programados'}
            </p>
          </div>
        </HistoryPanel>

        <HistoryPanel title="Historial cronológico">
          {timeline.length ? (
            <ol className="space-y-3">
              {timeline.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="rounded-md border border-[rgba(47,62,30,0.08)] p-3 dark:border-[rgba(238,227,202,0.08)]">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={item.href} className="font-medium text-[color:var(--brand-green)] hover:underline dark:text-[color:var(--brand-bone)]">
                        {item.title}
                      </Link>
                      <p className="brand-hint mt-1 text-sm">{item.subtitle}</p>
                    </div>
                    <span className="brand-hint text-sm">{formatDateTime(item.date)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.kind === 'incidencia' ? (
                      <>
                        <StatusBadge type="incidencia" value={item.status} />
                        <StatusBadge type="prioridad" value={item.priority} />
                      </>
                    ) : (
                      <StatusBadge type="mantenimiento" value={item.status} />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="brand-hint text-sm">Sin actividad operativa registrada todavía.</p>
          )}
        </HistoryPanel>
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="brand-hint">{label}</dt>
      <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{value || 'Sin dato'}</dd>
    </div>
  )
}

function InfoCompact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="brand-hint">{label}</dt>
      <dd className="font-medium text-[color:var(--brand-green)] dark:text-[color:var(--brand-bone)]">{value}</dd>
    </div>
  )
}

function HistoryPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="brand-card rounded-lg p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone: 'wine' | 'olive'
}) {
  const classes = tone === 'wine'
    ? 'bg-[rgba(155,30,33,0.08)] text-[color:var(--brand-wine)]'
    : 'bg-[rgba(47,62,30,0.08)] text-[color:var(--brand-green)]'

  return (
    <div className={`rounded-md px-3 py-3 ${classes}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide">{label}</p>
    </div>
  )
}
